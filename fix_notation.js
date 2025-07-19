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

// 表記ゆれ統一ルール
const standardizationRules = [
  // IP消費パターンの統一
  ['IPを消費', 'IP消費'],
  ['自分のIPを消費', 'IP消費'],
  ['ポイントを消費', 'IP消費'],
  ['ポイント消費', 'IP消費'],
  
  // 句読点の統一
  ['疲労させる。', '疲労させる'],
  ['追放する。', '追放する'],
  ['生成する。', '生成する'],
  ['獲得する。', '獲得する'],
  
  // IP増減表記の統一
  ['IP＋', 'IP+'],
  ['IP－', 'IP-'],
  ['ポイント+', 'IP+'],
  ['ポイント-', 'IP-'],
  
  // カード枚数・匹数表記の統一（既に英数字化済み）
  ['カードを1枚', 'カード1枚'],
  ['カード1枚を', 'カード1枚'],
  
  // 効果発動タイミングの統一
  ['ターン開始時', 'ターン開始時'],
  ['ラウンド開始時', 'ラウンド開始時'],
  
  // フィールド名の統一
  ['中立フィールド', '中立フィールド'],
  ['追放フィールド', '追放フィールド'],
  ['自分フィールド', '自フィールド'],
  ['相手フィールド', '敵フィールド'],
  
  // その他の細かい統一
  ['発動する', '発動'],
  ['実行する', '実行'],
  ['効果を使用', '効果使用'],
];

// 修正対象ファイル
const files = [
  './cards.json',
  './server/game/CardEffects.js',
  './server/game/GameEngine.js',
  './server/database/cardEffectStatus.js'
];

console.log('表記ゆれの統一を開始します...\n');

files.forEach(file => {
  const fullPath = path.resolve(file);
  if (fs.existsSync(fullPath)) {
    console.log(`\n=== ${file} ===`);
    replaceInFile(fullPath, standardizationRules);
  } else {
    console.log(`⚠️ ファイルが見つかりません: ${file}`);
  }
});

console.log('\n表記ゆれ統一作業が完了しました！');
