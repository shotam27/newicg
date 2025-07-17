const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'database', 'icg.db');
const db = new sqlite3.Database(dbPath);

console.log('チューリップカードの状態を確認中...');

db.all("SELECT * FROM cards WHERE name LIKE '%チューリップ%'", (err, rows) => {
  if (err) {
    console.error('エラー:', err);
  } else {
    console.log('チューリップのカード:', rows);
  }
  
  console.log('\n番号12のカードを確認...');
  db.all("SELECT * FROM cards WHERE number = 12", (err, rows) => {
    if (err) {
      console.error('エラー:', err);
    } else {
      console.log('番号12のカード:', rows);
    }
    
    console.log('\n最近更新されたカードTOP5...');
    db.all("SELECT id, number, name, updated_at FROM cards ORDER BY updated_at DESC LIMIT 5", (err, rows) => {
      if (err) {
        console.error('エラー:', err);
      } else {
        console.log('最近の更新:');
        rows.forEach(row => {
          console.log(`  ${row.updated_at}: 番号${row.number} ${row.name} (${row.id})`);
        });
      }
      db.close();
    });
  });
});
