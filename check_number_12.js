const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'database', 'icg.db');
const db = new sqlite3.Database(dbPath);

console.log('番号12のカードの状態を確認中...');

db.all("SELECT * FROM cards WHERE number = 12", (err, rows) => {
  if (err) {
    console.error('エラー:', err);
  } else {
    console.log('番号12のカード:');
    rows.forEach(row => {
      console.log(`  ID: ${row.id}, 名前: ${row.name}, 番号: ${row.number}, 更新日時: ${row.updated_at}`);
    });
  }
  
  console.log('\nアカミミガメの状態:');
  db.all("SELECT * FROM cards WHERE name LIKE '%アカミミガメ%'", (err, rows) => {
    if (err) {
      console.error('エラー:', err);
    } else {
      rows.forEach(row => {
        console.log(`  ID: ${row.id}, 名前: ${row.name}, 番号: ${row.number}, 更新日時: ${row.updated_at}`);
      });
    }
    
    console.log('\nチューリップの状態:');
    db.all("SELECT * FROM cards WHERE name LIKE '%チューリップ%'", (err, rows) => {
      if (err) {
        console.error('エラー:', err);
      } else {
        rows.forEach(row => {
          console.log(`  ID: ${row.id}, 名前: ${row.name}, 番号: ${row.number}, 更新日時: ${row.updated_at}`);
        });
      }
      db.close();
    });
  });
});
