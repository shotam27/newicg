const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'database', 'icg.db');
const db = new sqlite3.Database(dbPath);

console.log('安全なカード番号修正を実行中...');
console.log('目標:');
console.log('  番号12: チューリップ');
console.log('  番号13: Mアカミミガメ');
console.log('  番号14: サンゴ');

// 現在の状態を確認
db.all("SELECT id, name, number FROM cards WHERE id IN ('tulip', 'red_eared_slider', 'coral') ORDER BY number", (err, rows) => {
  if (err) {
    console.error('エラー:', err);
    return;
  }
  
  console.log('\n現在の状態:');
  rows.forEach(row => {
    console.log(`  番号${row.number}: ${row.name} (${row.id})`);
  });
  
  // トランザクション開始
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // 全部を一時的に大きな番号に移動
    const updates = [
      { id: 'tulip', temp: 9001, final: 12 },
      { id: 'red_eared_slider', temp: 9002, final: 13 },
      { id: 'coral', temp: 9003, final: 14 }
    ];
    
    let completed = 0;
    
    // Step 1: 全部を一時番号に
    function moveToTemp(index) {
      if (index >= updates.length) {
        moveToFinal(0);
        return;
      }
      
      const update = updates[index];
      db.run('UPDATE cards SET number = ? WHERE id = ?', [update.temp, update.id], function(err) {
        if (err) {
          console.error(`一時番号移動エラー (${update.id}):`, err);
          db.run('ROLLBACK');
          return;
        }
        console.log(`Step ${index + 1}: ${update.id} → 一時番号${update.temp}`);
        moveToTemp(index + 1);
      });
    }
    
    // Step 2: 一時番号から最終番号に
    function moveToFinal(index) {
      if (index >= updates.length) {
        commitTransaction();
        return;
      }
      
      const update = updates[index];
      db.run('UPDATE cards SET number = ? WHERE id = ?', [update.final, update.id], function(err) {
        if (err) {
          console.error(`最終番号移動エラー (${update.id}):`, err);
          db.run('ROLLBACK');
          return;
        }
        console.log(`Step ${index + 4}: ${update.id} → 番号${update.final}`);
        moveToFinal(index + 1);
      });
    }
    
    function commitTransaction() {
      db.run('COMMIT', function(err) {
        if (err) {
          console.error('Commit error:', err);
          db.run('ROLLBACK');
          return;
        }
        
        console.log('修正完了！');
        
        // データベースファイルのタイムスタンプを更新
        const fs = require('fs');
        const now = new Date();
        fs.utimesSync(dbPath, now, now);
        console.log('ゲームサーバーに更新通知を送信');
        
        // 結果確認
        db.all("SELECT id, number, name FROM cards WHERE id IN ('tulip', 'red_eared_slider', 'coral') ORDER BY number", (err, rows) => {
          if (err) {
            console.error('確認エラー:', err);
          } else {
            console.log('\n修正結果:');
            rows.forEach(row => {
              console.log(`  番号${row.number}: ${row.name} (${row.id})`);
            });
          }
          db.close();
        });
      });
    }
    
    moveToTemp(0);
  });
});
