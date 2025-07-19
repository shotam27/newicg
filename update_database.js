const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// cards.jsonを読み込み
const cardsData = JSON.parse(fs.readFileSync('./cards.json', 'utf8'));

// データベースに接続
const dbPath = './server/database/icg.db';
const db = new sqlite3.Database(dbPath);

console.log('データベースを更新中...');

// カードデータを更新
db.serialize(() => {
    // 各カードのデータを更新
    cardsData.cards.forEach(card => {
        const abilities = JSON.stringify(card.abilities);
        
        db.run(
            "UPDATE cards SET abilities = ? WHERE id = ?",
            [abilities, card.id],
            function(err) {
                if (err) {
                    console.error(`${card.id}の更新エラー:`, err.message);
                } else if (this.changes > 0) {
                    console.log(`${card.id} (${card.name}) を更新しました`);
                }
            }
        );
    });
    
    // 特にライオンカードを確認
    db.get("SELECT abilities FROM cards WHERE id = 'lion'", (err, row) => {
        if (err) {
            console.error('確認エラー:', err);
        } else if (row) {
            console.log('\n更新後のライオンカード:');
            const abilities = JSON.parse(row.abilities);
            abilities.forEach((ability, index) => {
                console.log(`能力${index + 1}: ${ability.description}`);
            });
        }
        
        db.close();
        console.log('\nデータベース更新完了');
    });
});
