const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'database', 'icg.db');
const db = new sqlite3.Database(dbPath);

console.log('現在のデータベース状態を確認中...');

// 番号12と13のカードを確認
db.all("SELECT * FROM cards WHERE number IN (12, 13) ORDER BY number", (err, rows) => {
  if (err) {
    console.error('エラー:', err);
  } else {
    console.log('番号12と13のカード:');
    rows.forEach(row => {
      console.log(`  番号${row.number}: ${row.name} (${row.id}) - 更新: ${row.updated_at}`);
    });
  }
  
  // アカミミガメとチューリップの状態を確認
  console.log('\nアカミミガメとチューリップの状態:');
  db.all("SELECT * FROM cards WHERE name LIKE '%アカミミガメ%' OR name LIKE '%チューリップ%' ORDER BY number", (err, rows) => {
    if (err) {
      console.error('エラー:', err);
    } else {
      rows.forEach(row => {
        console.log(`  番号${row.number}: ${row.name} (${row.id}) - 更新: ${row.updated_at}`);
      });
    }
    db.close();
  });
});
