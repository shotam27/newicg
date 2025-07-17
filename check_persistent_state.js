const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'database', 'icg.db');
const db = new sqlite3.Database(dbPath);

console.log('現在のデータベース状態を確認中...');

db.all("SELECT id, number, name FROM cards WHERE id IN ('tulip', 'red_eared_slider', 'coral') ORDER BY number", (err, rows) => {
  if (err) {
    console.error('エラー:', err);
  } else {
    console.log('番号12-14のカード状態:');
    rows.forEach(row => {
      console.log(`  番号${row.number}: ${row.name} (${row.id})`);
    });
  }
  db.close();
});
