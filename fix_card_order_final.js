const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'database', 'icg.db');
const db = new sqlite3.Database(dbPath);

console.log('カードの番号を正しく修正中...');
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
    
    // 一時番号を使って安全に入れ替え
    const temp1 = 9001;
    const temp2 = 9002;
    const temp3 = 9003;
    
    // 1. 全部を一時番号に移動
    db.run('UPDATE cards SET number = ? WHERE id = ?', [temp1, 'tulip'], function(err) {
      if (err) {
        console.error('Step 1 error:', err);
        db.run('ROLLBACK');
        return;
      }
      console.log('Step 1: チューリップ → 一時番号');
      
      db.run('UPDATE cards SET number = ? WHERE id = ?', [temp2, 'red_eared_slider'], function(err) {
        if (err) {
          console.error('Step 2 error:', err);
          db.run('ROLLBACK');
          return;
        }
        console.log('Step 2: Mアカミミガメ → 一時番号');
        
        db.run('UPDATE cards SET number = ? WHERE id = ?', [temp3, 'coral'], function(err) {
          if (err) {
            console.error('Step 3 error:', err);
            db.run('ROLLBACK');
            return;
          }
          console.log('Step 3: サンゴ → 一時番号');
          
          // 2. 正しい番号に配置
          db.run('UPDATE cards SET number = ? WHERE id = ?', [12, 'tulip'], function(err) {
            if (err) {
              console.error('Step 4 error:', err);
              db.run('ROLLBACK');
              return;
            }
            console.log('Step 4: チューリップ → 番号12');
            
            db.run('UPDATE cards SET number = ? WHERE id = ?', [13, 'red_eared_slider'], function(err) {
              if (err) {
                console.error('Step 5 error:', err);
                db.run('ROLLBACK');
                return;
              }
              console.log('Step 5: Mアカミミガメ → 番号13');
              
              db.run('UPDATE cards SET number = ? WHERE id = ?', [14, 'coral'], function(err) {
                if (err) {
                  console.error('Step 6 error:', err);
                  db.run('ROLLBACK');
                  return;
                }
                console.log('Step 6: サンゴ → 番号14');
                
                // コミット
                db.run('COMMIT', function(err) {
                  if (err) {
                    console.error('Commit error:', err);
                    db.run('ROLLBACK');
                    return;
                  }
                  
                  console.log('修正完了！');
                  
                  // データベースファイルのタイムスタンプを更新してゲームサーバーに通知
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
              });
            });
          });
        });
      });
    });
  });
});
