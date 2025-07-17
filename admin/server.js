const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3005;
const JWT_SECRET = 'your-secret-key-change-this-in-production';

// データベース初期化
const dbPath = path.join(__dirname, '../server/database/icg.db');
console.log('Database path:', dbPath);
const db = new sqlite3.Database(dbPath);

// ミドルウェア
app.use(cors({
  origin: 'http://localhost:3006',
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: 'admin-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24時間
}));

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));

// データベーステーブル作成
db.serialize(() => {
  // カードテーブル
  db.run(`CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    number INTEGER UNIQUE,
    name TEXT NOT NULL,
    traits TEXT,
    abilities TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // カード効果ステータステーブル
  db.run(`CREATE TABLE IF NOT EXISTS card_effect_status (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    ability_index INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('working', 'broken', 'untested')),
    last_tested DATETIME DEFAULT CURRENT_TIMESTAMP,
    test_count INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    reported_by TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(card_id, ability_index)
  )`);
  
  // 管理者テーブル
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // デフォルト管理者作成（初回のみ）
  const defaultPassword = 'admin123'; // 本番では変更必須
  bcrypt.hash(defaultPassword, 10, (err, hash) => {
    if (err) return;
    db.run(`INSERT OR IGNORE INTO admins (username, password_hash) VALUES (?, ?)`, 
           ['admin', hash]);
  });
});

// 既存のcards.jsonとcardEffectStatus.jsonをDBにインポート（初回のみ）
function importDataFromJSON() {
  // データベースにカードが既にあるかチェック
  db.get('SELECT COUNT(*) as count FROM cards', (err, row) => {
    if (err) {
      console.error('カード数確認エラー:', err);
      return;
    }
    
    // 既にカードが存在する場合はインポートをスキップ
    if (row.count > 0) {
      console.log('データベースに既にカードが存在します。インポートをスキップします。');
      return;
    }
    
    console.log('初回起動: JSONファイルからデータをインポート中...');
    
    // cards.jsonのインポート
    const cardsPath = path.join(__dirname, '../cards.json');
    if (fs.existsSync(cardsPath)) {
      const cardsData = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
      
      cardsData.cards.forEach(card => {
        const traits = card.traits ? JSON.stringify(card.traits) : null;
        const abilities = JSON.stringify(card.abilities);
        
        db.run(`INSERT OR REPLACE INTO cards (id, number, name, traits, abilities) VALUES (?, ?, ?, ?, ?)`,
               [card.id, card.number, card.name, traits, abilities]);
      });
      console.log('カードデータをインポートしました');
    }
    
    // cardEffectStatus.jsonのインポート
    const statusPath = path.join(__dirname, '../server/database/cardEffectStatus.json');
    if (fs.existsSync(statusPath)) {
      const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      
      Object.entries(statusData.effectStatuses).forEach(([key, status]) => {
        const reportedBy = JSON.stringify(status.reportedBy || []);
        
        db.run(`INSERT OR REPLACE INTO card_effect_status 
                (id, card_id, ability_index, status, last_tested, test_count, notes, reported_by) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
               [key, status.cardId, status.abilityIndex, status.status, 
                status.lastTested, status.testCount, status.notes || '', reportedBy]);
      });
      console.log('カード効果ステータスをインポートしました');
    }
  });
}

// 認証ミドルウェア
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'アクセストークンが必要です' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: '無効なトークンです' });
    req.user = user;
    next();
  });
}

// ====== API ルート ======

// ログイン
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get('SELECT * FROM admins WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: 'データベースエラー' });
    if (!user) return res.status(401).json({ error: 'ユーザーが見つかりません' });
    
    bcrypt.compare(password, user.password_hash, (err, isValid) => {
      if (err) return res.status(500).json({ error: 'パスワード検証エラー' });
      if (!isValid) return res.status(401).json({ error: 'パスワードが間違っています' });
      
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, username: user.username });
    });
  });
});

// カード一覧取得
app.get('/api/cards', authenticateToken, (req, res) => {
  db.all('SELECT * FROM cards ORDER BY number ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'データベースエラー' });
    
    const cards = rows.map(row => ({
      id: row.id,
      number: row.number,
      name: row.name,
      traits: row.traits ? JSON.parse(row.traits) : null,
      abilities: JSON.parse(row.abilities),
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    
    res.json({ cards });
  });
});

// カード個別取得
app.get('/api/cards/:id', authenticateToken, (req, res) => {
  db.get('SELECT * FROM cards WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'データベースエラー' });
    if (!row) return res.status(404).json({ error: 'カードが見つかりません' });
    
    const card = {
      id: row.id,
      number: row.number,
      name: row.name,
      traits: row.traits ? JSON.parse(row.traits) : null,
      abilities: JSON.parse(row.abilities)
    };
    
    res.json(card);
  });
});

// ゲームサーバーに更新を通知する関数
function notifyGameServer() {
  // データベースファイルのタイムスタンプを更新してファイル監視をトリガー
  const fs = require('fs');
  const now = new Date();
  try {
    fs.utimesSync(dbPath, now, now);
    console.log('ゲームサーバーに更新を通知しました');
  } catch (err) {
    console.log('ゲームサーバー通知エラー:', err);
  }
}

// カード作成
app.post('/api/cards', authenticateToken, (req, res) => {
  const { id, number, name, traits, abilities } = req.body;
  
  if (!id || !number || !name || !abilities) {
    return res.status(400).json({ error: '必須フィールドが不足しています' });
  }
  
  // 番号の重複チェックと入れ替え処理
  db.get('SELECT id, number FROM cards WHERE number = ?', [number], (err, existingCard) => {
    if (err) return res.status(500).json({ error: 'データベースエラー' });
    
    const traitsJson = traits ? JSON.stringify(traits) : null;
    const abilitiesJson = JSON.stringify(abilities);
    
    if (existingCard && existingCard.id !== id) {
      // 既存のカードがある場合は入れ替え
      console.log(`番号 ${number} を使用しているカード ${existingCard.id} と ${id} を入れ替えます`);
      
      // 現在のカードの番号を取得
      db.get('SELECT number FROM cards WHERE id = ?', [id], (err, currentCard) => {
        if (err) return res.status(500).json({ error: 'データベースエラー' });
        
        // トランザクション開始
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          
          const tempNumber = Date.now(); // より確実にユニークな一時番号
          
          // 1. 既存カードを一時番号に変更
          db.run('UPDATE cards SET number = ? WHERE id = ?', [tempNumber, existingCard.id], function(err) {
            if (err) {
              console.error('Step 1 error:', err);
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'データベースエラー (Step 1)' });
            }
            
            // 2. 新しいカードを目的の番号に設定
            db.run(`INSERT OR REPLACE INTO cards (id, number, name, traits, abilities) VALUES (?, ?, ?, ?, ?)`,
                   [id, number, name, traitsJson, abilitiesJson], function(err) {
              if (err) {
                console.error('Step 2 error:', err);
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'データベースエラー (Step 2)' });
              }
              
              // 3. 既存カードを元の番号（または空いている番号）に設定
              const swapNumber = currentCard ? currentCard.number : number + 1000;
              db.run('UPDATE cards SET number = ? WHERE id = ?', [swapNumber, existingCard.id], function(err) {
                if (err) {
                  console.error('Step 3 error:', err);
                  db.run('ROLLBACK');
                  return res.status(500).json({ error: 'データベースエラー (Step 3)' });
                }
                
                // トランザクション完了
                db.run('COMMIT', function(err) {
                  if (err) {
                    console.error('Commit error:', err);
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'データベースエラー (Commit)' });
                  }
                  
                  notifyGameServer(); // ゲームサーバーに通知
                  res.status(201).json({ 
                    message: `カードを作成しました（番号 ${number} は ${existingCard.id} と入れ替えました）`, 
                    id 
                  });
                });
              });
            });
          });
        });
      });
    } else {
      // 重複なしの場合は通常作成
      db.run(`INSERT OR REPLACE INTO cards (id, number, name, traits, abilities) VALUES (?, ?, ?, ?, ?)`,
             [id, number, name, traitsJson, abilitiesJson], function(err) {
        if (err) {
          console.error('Create error:', err);
          return res.status(500).json({ error: 'データベースエラー' });
        }
        notifyGameServer(); // ゲームサーバーに通知
        res.status(201).json({ message: 'カードを作成しました', id });
      });
    }
  });
});

// カード更新
app.put('/api/cards/:id', authenticateToken, (req, res) => {
  const { number, name, traits, abilities } = req.body;
  const id = req.params.id;
  
  if (!number || !name || !abilities) {
    return res.status(400).json({ error: '必須フィールドが不足しています' });
  }
  
  // 現在のカード情報を取得
  db.get('SELECT number FROM cards WHERE id = ?', [id], (err, currentCard) => {
    if (err) return res.status(500).json({ error: 'データベースエラー' });
    if (!currentCard) return res.status(404).json({ error: 'カードが見つかりません' });
    
    // 番号が変更されない場合は通常更新
    if (currentCard.number === number) {
      const traitsJson = traits ? JSON.stringify(traits) : null;
      const abilitiesJson = JSON.stringify(abilities);
      
      db.run(`UPDATE cards SET name = ?, traits = ?, abilities = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE id = ?`,
             [name, traitsJson, abilitiesJson, id], function(err) {
        if (err) return res.status(500).json({ error: 'データベースエラー' });
        notifyGameServer(); // ゲームサーバーに通知
        res.json({ message: 'カードを更新しました' });
      });
      return;
    }
    
    // 番号の重複チェックと入れ替え処理
    db.get('SELECT id FROM cards WHERE number = ? AND id != ?', [number, id], (err, conflictCard) => {
      if (err) return res.status(500).json({ error: 'データベースエラー' });
      
      const traitsJson = traits ? JSON.stringify(traits) : null;
      const abilitiesJson = JSON.stringify(abilities);
      
      if (conflictCard) {
        // 既存のカードと番号を入れ替え
        console.log(`番号 ${number} を使用しているカード ${conflictCard.id} と ${id} を入れ替えます`);
        
        // トランザクション開始
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          
          const tempNumber = Date.now(); // より確実にユニークな一時番号
          
          // 1. 競合するカードを一時番号に変更
          db.run('UPDATE cards SET number = ? WHERE id = ?', [tempNumber, conflictCard.id], function(err) {
            if (err) {
              console.error('Swap step 1 error:', err);
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'データベースエラー (Swap 1)' });
            }
            
            // 2. 現在のカードを新しい番号に更新
            db.run(`UPDATE cards SET number = ?, name = ?, traits = ?, abilities = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?`,
                   [number, name, traitsJson, abilitiesJson, id], function(err) {
              if (err) {
                console.error('Update error:', err);
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'データベースエラー (Update)' });
              }
              
              // 3. 競合していたカードを元の番号に変更
              db.run('UPDATE cards SET number = ? WHERE id = ?', [currentCard.number, conflictCard.id], function(err) {
                if (err) {
                  console.error('Swap step 2 error:', err);
                  db.run('ROLLBACK');
                  return res.status(500).json({ error: 'データベースエラー (Swap 2)' });
                }
                
                // トランザクション完了
                db.run('COMMIT', function(err) {
                  if (err) {
                    console.error('Commit error:', err);
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'データベースエラー (Commit)' });
                  }
                  
                  notifyGameServer(); // ゲームサーバーに通知
                  res.json({ message: `カードを更新しました（番号 ${number} は ${conflictCard.id} と入れ替えました）` });
                });
              });
            });
          });
        });
      } else {
        // 重複なしの場合は通常更新
        db.run(`UPDATE cards SET number = ?, name = ?, traits = ?, abilities = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?`,
               [number, name, traitsJson, abilitiesJson, id], function(err) {
          if (err) return res.status(500).json({ error: 'データベースエラー' });
          notifyGameServer(); // ゲームサーバーに通知
          res.json({ message: 'カードを更新しました' });
        });
      }
    });
  });
});

// カード削除
app.delete('/api/cards/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM cards WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'データベースエラー' });
    if (this.changes === 0) {
      return res.status(404).json({ error: 'カードが見つかりません' });
    }
    notifyGameServer(); // ゲームサーバーに通知
    res.json({ message: 'カードを削除しました' });
  });
});

// カード効果ステータス一覧取得
app.get('/api/effect-status', authenticateToken, (req, res) => {
  db.all(`SELECT ces.*, c.name as card_name 
          FROM card_effect_status ces
          LEFT JOIN cards c ON ces.card_id = c.id
          ORDER BY ces.card_id, ces.ability_index`, (err, rows) => {
    if (err) return res.status(500).json({ error: 'データベースエラー' });
    
    const effectStatuses = rows.map(row => ({
      id: row.id,
      cardId: row.card_id,
      cardName: row.card_name,
      abilityIndex: row.ability_index,
      status: row.status,
      lastTested: row.last_tested,
      testCount: row.test_count,
      notes: row.notes,
      reportedBy: JSON.parse(row.reported_by || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    
    res.json({ effectStatuses });
  });
});

// カード効果ステータス更新
app.put('/api/effect-status/:id', authenticateToken, (req, res) => {
  const { status, notes } = req.body;
  const id = req.params.id;
  
  if (!status || !['working', 'broken', 'untested'].includes(status)) {
    return res.status(400).json({ error: '有効なステータスを指定してください' });
  }
  
  db.run(`UPDATE card_effect_status 
          SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?`,
         [status, notes || '', id], function(err) {
    if (err) return res.status(500).json({ error: 'データベースエラー' });
    if (this.changes === 0) {
      return res.status(404).json({ error: '効果ステータスが見つかりません' });
    }
    notifyGameServer(); // ゲームサーバーに通知
    res.json({ message: '効果ステータスを更新しました' });
  });
});

// cards.jsonエクスポート
app.get('/api/export', authenticateToken, (req, res) => {
  db.all('SELECT * FROM cards ORDER BY number ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'データベースエラー' });
    
    const cards = rows.map(row => ({
      number: row.number,
      id: row.id,
      name: row.name,
      ...(row.traits ? { traits: JSON.parse(row.traits) } : {}),
      abilities: JSON.parse(row.abilities)
    }));
    
    const exportData = { cards };
    
    // cards.jsonファイルを更新
    const cardsPath = path.join(__dirname, '../cards.json');
    fs.readFile(cardsPath, 'utf8', (err, data) => {
      let gameRules = {};
      if (!err && data) {
        try {
          const existingData = JSON.parse(data);
          gameRules = existingData.gameRules || {};
        } catch (e) {
          console.log('既存のcards.jsonの解析に失敗しました');
        }
      }
      
      const fullData = { ...exportData, gameRules };
      fs.writeFileSync(cardsPath, JSON.stringify(fullData, null, 2));
      res.json({ message: 'cards.jsonを更新しました', cards: exportData.cards });
    });
  });
});

// サーバー起動時にJSONインポート
importDataFromJSON();

app.listen(PORT, () => {
  console.log(`カード管理サーバーが起動しました: http://localhost:${PORT}`);
  console.log('デフォルト管理者: admin / admin123');
});
