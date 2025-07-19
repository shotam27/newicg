const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// cards.jsonを読み込み
const cardsData = JSON.parse(fs.readFileSync('./cards.json', 'utf8'));

// cards.dbも更新
const cardsDbPath = './server/database/cards.db';
if (fs.existsSync(cardsDbPath)) {
    const cardsDb = new sqlite3.Database(cardsDbPath);
    
    console.log('cards.dbを更新中...');
    
    cardsDb.serialize(() => {
        cardsData.cards.forEach(card => {
            const abilities = JSON.stringify(card.abilities);
            
            cardsDb.run(
                "UPDATE cards SET abilities = ? WHERE id = ?",
                [abilities, card.id],
                function(err) {
                    if (err) {
                        console.error(`cards.db ${card.id}の更新エラー:`, err.message);
                    } else if (this.changes > 0) {
                        console.log(`cards.db: ${card.id} (${card.name}) を更新しました`);
                    }
                }
            );
        });
        
        cardsDb.close();
        console.log('cards.db更新完了');
    });
} else {
    console.log('cards.dbが見つかりません');
}
