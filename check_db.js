const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'database', 'icg.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath);

// Check cards table
db.all('SELECT COUNT(*) as count FROM cards', (err, rows) => {
  if (err) {
    console.error('Cards table error:', err);
  } else {
    console.log('Cards count:', rows[0].count);
  }
  
  // Check first few cards
  db.all('SELECT id, number, name FROM cards ORDER BY number LIMIT 5', (err, rows) => {
    if (err) {
      console.error('Cards select error:', err);
    } else {
      console.log('First 5 cards:', rows);
    }
    
    // Check card_effect_status table
    db.all('SELECT COUNT(*) as count FROM card_effect_status', (err, rows) => {
      if (err) {
        console.error('Effect status table error:', err);
      } else {
        console.log('Effect status count:', rows[0].count);
      }
      
      db.close();
    });
  });
});
