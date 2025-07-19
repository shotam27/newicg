const fs = require('fs');
const path = require('path');

// ファイルの置換処理
function replaceInFile(filePath, replacements) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    
    replacements.forEach(([from, to]) => {
      if (content.includes(from)) {
        content = content.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
        changed = true;
        console.log(`置換: "${from}" → "${to}"`);
      }
    });
    
    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`${filePath} を更新しました`);
    } else {
      console.log(`${filePath} に変更はありませんでした`);
    }
  } catch (error) {
    console.error(`エラー - ${filePath}:`, error.message);
  }
}

// 置換ルール
const replacements = [
  // 漢数字 → 英数字
  ['一匹', '1匹'],
  ['一体', '1体'],
  ['一枚', '1枚'],
  ['二匹', '2匹'],
  ['三匹', '3匹'],
  ['四匹', '4匹'],
  ['五匹', '5匹'],
  ['六匹', '6匹'],
  ['七匹', '7匹'],
  ['八匹', '8匹'],
  ['九匹', '9匹'],
  ['十匹', '10匹'],
  
  // 全角数字 → 半角数字
  ['１', '1'],
  ['２', '2'],
  ['３', '3'],
  ['４', '4'],
  ['５', '5'],
  ['６', '6'],
  ['７', '7'],
  ['８', '8'],
  ['９', '9'],
  ['０', '0'],
];

// 修正対象ファイル
const files = [
  './cards.json',
  './server/game/CardEffects.js',
  './server/game/GameEngine.js'
];

console.log('漢数字・全角数字の英数字統一を開始します...\n');

files.forEach(file => {
  const fullPath = path.resolve(file);
  if (fs.existsSync(fullPath)) {
    console.log(`\n=== ${file} ===`);
    replaceInFile(fullPath, replacements);
  } else {
    console.log(`⚠️ ファイルが見つかりません: ${file}`);
  }
});

console.log('\n統一作業が完了しました！');
