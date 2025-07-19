const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/database/icg.db');

console.log('カード1-12の能力とコストを確認:');
console.log('=====================================');

db.all('SELECT id, name, abilities FROM cards WHERE id BETWEEN 1 AND 12 ORDER BY id', (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    rows.forEach(row => {
      console.log(`=== ${row.name} (ID: ${row.id}) ===`);
      try {
        const abilities = JSON.parse(row.abilities);
        abilities.forEach((ability, index) => {
          console.log(`${index + 1}. [${ability.type}] ${ability.description} (cost: ${ability.cost})`);
        });
      } catch(e) {
        console.log('Parse error:', e.message);
      }
      console.log('');
    });
  }
  db.close();
});
