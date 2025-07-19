const fs = require('fs');

// cards.jsonの内容を確認
console.log('cards.jsonの内容を確認中...');
const cardsData = JSON.parse(fs.readFileSync('./cards.json', 'utf8'));
const lionCard = cardsData.cards.find(card => card.id === 'lion');

if (lionCard) {
    console.log('cards.jsonのライオンカード:');
    lionCard.abilities.forEach((ability, index) => {
        console.log(`能力${index + 1}: ${ability.description}`);
    });
}

// データベースファイルの更新時間を確認
const dbPath = './server/database/icg.db';
if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    console.log('\nデータベースファイル情報:');
    console.log('最終更新時間:', stats.mtime);
    console.log('サイズ:', stats.size, 'bytes');
} else {
    console.log('\nデータベースファイルが見つかりません');
}
