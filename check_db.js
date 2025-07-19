const fs = require('fs');
const path = require('path');

// SQLiteファイルの内容を確認
const dbPath = './server/database/icg.db';

if (fs.existsSync(dbPath)) {
  const stats = fs.statSync(dbPath);
  console.log('SQLiteファイル情報:');
  console.log('- サイズ:', stats.size, 'bytes');
  console.log('- 最終更新:', stats.mtime);
  
  // バイナリファイルの先頭部分を確認
  const buffer = fs.readFileSync(dbPath);
  const header = buffer.slice(0, 100).toString('ascii').replace(/[^\x20-\x7E]/g, '.');
  console.log('- ヘッダー:', header);
} else {
  console.log('SQLiteファイルが見つかりません');
}

// JSONデータベースファイルの内容確認
const jsonDbPath = './server/database/cardEffectStatus.json';
if (fs.existsSync(jsonDbPath)) {
  const jsonData = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8'));
  console.log('\nJSONデータベースの効果ステータス件数:', Object.keys(jsonData.effectStatuses).length);
  console.log('最終更新:', jsonData.lastUpdated);
  
  // 漢数字が含まれているエントリを検索
  const entries = Object.entries(jsonData.effectStatuses);
  const kanjiEntries = entries.filter(([key, data]) => {
    return key.includes('一') || key.includes('二') || key.includes('三') || 
           key.includes('四') || key.includes('五') || key.includes('１') ||
           key.includes('２') || key.includes('３');
  });
  
  if (kanjiEntries.length > 0) {
    console.log('\n漢数字を含むエントリが見つかりました:');
    kanjiEntries.forEach(([key, data]) => {
      console.log(`- ${key}: ${data.cardId}`);
    });
  } else {
    console.log('\n漢数字を含むエントリは見つかりませんでした');
  }
}

console.log('\nDB確認完了');
