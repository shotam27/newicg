const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('SQLiteデータベースの漢数字・表記ゆれ統一を開始...\n');

// 統一ルール
const replacements = [
  // 漢数字 → 英数字
  ['一匹', '1匹'],
  ['一体', '1体'],
  ['一枚', '1枚'],
  ['二匹', '2匹'],
  ['三匹', '3匹'],
  ['四匹', '4匹'],
  ['五匹', '5匹'],
  ['六匹', '6匹'],
  ['七匹', '7匹'],
  ['八匹', '8匹'],
  ['九匹', '9匹'],
  ['十匹', '10匹'],
  
  // 全角数字 → 半角数字
  ['１', '1'],
  ['２', '2'],
  ['３', '3'],
  ['４', '4'],
  ['５', '5'],
  ['６', '6'],
  ['７', '7'],
  ['８', '8'],
  ['９', '9'],
  ['０', '0'],
  
  // 表記ゆれ統一
  ['IPを消費', 'IP消費'],
  ['疲労させる。', '疲労させる'],
  ['追放する。', '追放する'],
  ['生成する。', '生成する'],
  ['獲得する。', '獲得する'],
  ['IP＋', 'IP+'],
  ['取り除く', '除去する'],
  ['場合。', '場合'],
  ['回数が6を超えていた', '回数が6超過の'],
  ['いる場合', 'がいる場合'],
];

// データベースファイルの処理
const dbPaths = [
  './server/database/icg.db',
  './admin/cards.db'
];

function updateDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(dbPath)) {
      console.log(`⚠️ ファイルが見つかりません: ${dbPath}`);
      resolve();
      return;
    }

    console.log(`\n=== ${dbPath} ===`);
    const db = new sqlite3.Database(dbPath);

    // テーブル一覧を取得
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
      if (err) {
        console.error('テーブル取得エラー:', err);
        reject(err);
        return;
      }

      console.log('テーブル:', tables.map(t => t.name).join(', '));

      // cardsテーブルの確認と更新
      db.all("SELECT * FROM cards LIMIT 5", (err, rows) => {
        if (err) {
          console.log('cardsテーブルが見つかりません:', err.message);
        } else {
          console.log('cardsテーブルのサンプル:', rows.length, '件');
          
          // カード効果テキストの統一処理
          rows.forEach(row => {
            if (row.abilities) {
              let abilities = row.abilities;
              let updated = false;
              
              replacements.forEach(([from, to]) => {
                if (abilities.includes(from)) {
                  abilities = abilities.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
                  updated = true;
                  console.log(`  更新: ${row.name} - "${from}" → "${to}"`);
                }
              });
              
              if (updated) {
                db.run("UPDATE cards SET abilities = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", 
                       [abilities, row.id], (err) => {
                  if (err) {
                    console.error('更新エラー:', err);
                  } else {
                    console.log(`  ✅ ${row.name}を更新しました`);
                  }
                });
              }
            }
          });
        }

        // card_effect_statusテーブルの確認
        db.all("SELECT * FROM card_effect_status LIMIT 5", (err, statusRows) => {
          if (err) {
            console.log('card_effect_statusテーブルが見つかりません:', err.message);
          } else {
            console.log('card_effect_statusテーブルのサンプル:', statusRows.length, '件');
          }

          db.close((err) => {
            if (err) {
              console.error('DB切断エラー:', err);
              reject(err);
            } else {
              console.log(`${dbPath} の処理完了`);
              resolve();
            }
          });
        });
      });
    });
  });
}

// 全てのDBを順番に処理
async function updateAllDatabases() {
  try {
    for (const dbPath of dbPaths) {
      await updateDatabase(dbPath);
    }
    console.log('\n✅ 全データベースの統一処理が完了しました！');
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// SQLite3モジュールの存在確認
try {
  require('sqlite3');
  updateAllDatabases();
} catch (error) {
  console.log('⚠️ sqlite3モジュールが見つかりません。');
  console.log('インストールするには: npm install sqlite3');
  console.log('現在はJSONファイルのみが統一されています。');
}
