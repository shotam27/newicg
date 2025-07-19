const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

console.log('データベースファイルの詳細分析...\n');

// icg.dbの詳細確認
const icgDbPath = './server/database/icg.db';
if (fs.existsSync(icgDbPath)) {
    console.log('=== icg.db の分析 ===');
    const icgDb = new sqlite3.Database(icgDbPath);
    
    // テーブル一覧を取得
    icgDb.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        if (err) {
            console.error('テーブル一覧取得エラー:', err);
        } else {
            console.log('テーブル一覧:', tables.map(t => t.name).join(', '));
            
            // cardsテーブルの構造を確認
            icgDb.all("PRAGMA table_info(cards)", (err, columns) => {
                if (err) {
                    console.error('カラム情報取得エラー:', err);
                } else {
                    console.log('\ncardsテーブルの構造:');
                    columns.forEach(col => {
                        console.log(`- ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
                    });
                    
                    // サンプルデータを確認
                    icgDb.get("SELECT * FROM cards WHERE id = 'lion'", (err, row) => {
                        if (err) {
                            console.error('データ取得エラー:', err);
                        } else if (row) {
                            console.log('\nライオンカードのデータ:');
                            console.log('ID:', row.id);
                            console.log('Name:', row.name);
                            console.log('Number:', row.number);
                            if (row.abilities) {
                                const abilities = JSON.parse(row.abilities);
                                console.log('Abilities:');
                                abilities.forEach((ability, index) => {
                                    console.log(`  ${index + 1}. ${ability.description} (cost: ${ability.cost}, type: ${ability.type})`);
                                });
                            }
                        }
                        
                        // レコード総数を確認
                        icgDb.get("SELECT COUNT(*) as count FROM cards", (err, countRow) => {
                            if (err) {
                                console.error('カウント取得エラー:', err);
                            } else {
                                console.log(`\n総カード数: ${countRow.count}枚`);
                            }
                            
                            icgDb.close();
                        });
                    });
                }
            });
        }
    });
} else {
    console.log('icg.db が見つかりません');
}

// cards.dbの確認
const cardsDbPath = './server/database/cards.db';
if (fs.existsSync(cardsDbPath)) {
    console.log('\n=== cards.db の分析 ===');
    const cardsDb = new sqlite3.Database(cardsDbPath);
    
    cardsDb.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        if (err) {
            console.error('cards.db テーブル一覧取得エラー:', err);
        } else {
            console.log('cards.db テーブル一覧:', tables.map(t => t.name).join(', '));
        }
        
        cardsDb.close();
    });
} else {
    console.log('\ncards.db は存在しません');
}

// プロジェクト内でcards.dbへの参照を検索
console.log('\n=== プロジェクト内でのcards.db参照検索 ===');
const searchInFile = (filePath, searchTerm) => {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const matches = [];
        
        lines.forEach((line, index) => {
            if (line.includes(searchTerm)) {
                matches.push(`行${index + 1}: ${line.trim()}`);
            }
        });
        
        return matches;
    } catch (err) {
        return [];
    }
};

// 主要なファイルでcards.dbの参照を検索
const filesToSearch = [
    './server/index.js',
    './server/gameEngine.js',
    './server/cardEffects.js',
    './package.json'
];

filesToSearch.forEach(file => {
    if (fs.existsSync(file)) {
        const matches = searchInFile(file, 'cards.db');
        if (matches.length > 0) {
            console.log(`\n${file}:`);
            matches.forEach(match => console.log(`  ${match}`));
        }
    }
});
