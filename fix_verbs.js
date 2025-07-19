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

// 動詞・語尾の統一ルール
const verbStandardization = [
  // 「する」の統一
  ['疲労させる', '疲労させる'], // 既に統一済み
  ['追放する', '追放する'], // 既に統一済み
  ['生成する', '生成する'], // 既に統一済み
  ['獲得する', '獲得する'], // 既に統一済み
  
  // その他細かい統一
  ['取り除く', '除去する'],
  ['場合。', '場合'],
  ['場合、', '場合、'],
  
  // 状態表現の統一
  ['疲労済み', '疲労済'],
  ['非疲労', 'アクティブ'],
  
  // 数値表現の統一
  ['回数が6を超えていた', '回数が6超過の'],
  ['回数が6以上', '回数が6以上の'],
  
  // 条件表現の統一
  ['いる場合', 'がいる場合'],
  ['持ちを所持している', '持ちがいる'],
  ['持ちがある', '持ちがいる'],
];

// 修正対象ファイル
const files = [
  './cards.json',
  './server/game/CardEffects.js',
  './server/game/GameEngine.js'
];

console.log('動詞・語尾の統一を開始します...\n');

files.forEach(file => {
  const fullPath = path.resolve(file);
  if (fs.existsSync(fullPath)) {
    console.log(`\n=== ${file} ===`);
    replaceInFile(fullPath, verbStandardization);
  } else {
    console.log(`⚠️ ファイルが見つかりません: ${file}`);
  }
});

console.log('\n動詞・語尾統一作業が完了しました！');
