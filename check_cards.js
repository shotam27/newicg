const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'database', 'icg.db');
const db = new sqlite3.Database(dbPath);

console.log('アカミミガメカードを検索中...');

db.all("SELECT * FROM cards WHERE name LIKE '%アカミミガメ%'", (err, rows) => {
  if (err) {
    console.error('エラー:', err);
  } else {
    console.log('アカミミガメのカード:', rows);
  }
  
  console.log('\n全カードの番号13を確認...');
  db.all("SELECT * FROM cards WHERE number = 13", (err, rows) => {
    if (err) {
      console.error('エラー:', err);
    } else {
      console.log('番号13のカード:', rows);
    }
    db.close();
  });
});
