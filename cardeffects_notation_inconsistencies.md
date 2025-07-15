# CardEffects.js 表記ゆれ確認リスト

## 🔍 **表記ゆれが確認された文言**

### 1. **疲労効果の表記ゆれ**
- ✅ `'一匹疲労させる'` (行131, 212)
- ✅ `'一体疲労させる'` (行131, 212)
**→ 統一推奨**: `'一体疲労させる'` に統一する

### 2. **同種生成の表記ゆれ**
- ✅ `'同種を生成'` (行252)
- ✅ `'同種を一枚生成'` (行252)
**→ 統一推奨**: `'同種を一枚生成'` に統一する（より具体的）

### 3. **IP勝利条件の表記ゆれ**
- ✅ `'IP40'` (行387)
- ✅ `'IP40以上'` (行387)
**→ 統一推奨**: `'IP40以上'` に統一する（より明確）

## 🔍 **IP消費系の重複パターン**

### 4. **IP消費判定の複数パターン**
- ✅ `'IP'` + `'消費'` (行144, 224) - 分離判定
- ✅ `'IP消費'` (行272) - 結合判定
**→ 統一推奨**: `'IP消費'` に統一する（簡潔）

### 5. **中立生成の重複**
- ✅ `'中立に'` + `'生成'` (行343, 375) - 分離判定（獲得時効果・水棲効果）
**→ 現状維持**: 複数箇所での条件判定として適切

## 🔍 **cards.jsonとの文言照合結果**

### 6. **cards.jsonで実際に使用される文言との差異**

#### **疲労関連**
- cards.json: `"一匹疲労させる。"` (句点あり)
- CardEffects.js: `'一匹疲労させる'` (句点なし)
- cards.json: `"一匹疲労させる"` (句点なし)
- CardEffects.js: `'一体疲労させる'` 
**→ 問題**: 句点の有無とカウント単位の不統一

#### **IP系効果**
- cards.json: `"IP＋2"`, `"IP＋5"` (全角プラス)
- CardEffects.js: 正規表現 `/IP[＋+](\d+)/` で両方対応済み ✅

#### **獲得時IP効果**
- cards.json: `"増加IP＋1"` 
- CardEffects.js: `/[＋+](\d+)IP/` で対応済み ✅

#### **同種生成**
- cards.json: `"同種を一枚疲労させ、同種を一枚生成する。"`
- CardEffects.js: `'同種を生成'` + `'同種を一枚生成'` で対応 ✅

#### **追放系**
- cards.json: `"疲労済を追放する"`
- CardEffects.js: `'追放する'` で部分的に対応 ⚠️

## 🚨 **cards.jsonに存在するが未対応の文言**

### 7. **未実装の重要な文言**
- ❌ `"同種を一枚疲労させ"` - 同種疲労（前処理）
- ❌ `"疲労済を追放する"` - 疲労済限定追放
- ❌ `"自分のIPを(\d+)消費し"` - 自分IP消費（増加IPと区別）
- ❌ `"自身の疲労取り除く"` - 自身回復
- ❌ `"この効果で疲労しない"` - 疲労回避
- ❌ `"中立フィールドの同種を回復する"` - 中立回復
- ❌ `"自フィールドに同種がいない場合"` - 条件付き効果
- ❌ `"１ラウンドで侵略した回数が(\d+)を超えていた場合"` - 侵略回数勝利

## 📝 **修正推奨事項**

### 🔥 **高優先度修正**

1. **疲労効果の統一**
```javascript
// 現在
if (ability.description.includes('一匹疲労させる') || ability.description.includes('一体疲労させる')) {

// 推奨 (句点も考慮)
if (ability.description.includes('一匹疲労させる') || 
    ability.description.includes('一体疲労させる') || 
    ability.description.includes('一匹疲労させる。') || 
    ability.description.includes('一体疲労させる。')) {
```

2. **IP消費の統一**
```javascript
// 現在 (複数パターン)
if (ability.description.includes('IP') && ability.description.includes('消費')) {
if (ability.description.includes('IP消費')) {

// 推奨 (統一)
if (ability.description.includes('IP消費') || 
    (ability.description.includes('IP') && ability.description.includes('消費'))) {
```

### 🔶 **中優先度修正**

3. **疲労済追放の対応**
```javascript
// 追加推奨
if (ability.description.includes('疲労済を追放する')) {
  return this.executeExile(player, opponent, ability, 'fatigued');
}
```

4. **自分IP消費の対応**
```javascript
// 追加推奨
const selfIpCostMatch = ability.description.match(/自分のIPを(\d+)消費し/);
if (selfIpCostMatch) {
  // 処理
}
```

### 🔷 **低優先度修正**

5. **条件付き効果の基盤作成**
```javascript
// 追加推奨
if (ability.description.includes('場合')) {
  return this.handleConditionalEffect(player, card, ability);
}
```

## 📊 **統計情報**

- **表記ゆれ箇所**: 4パターン
- **未対応文言**: 8個以上
- **句点の不統一**: 疲労系で確認
- **優先修正項目**: 3個（疲労統一、IP消費統一、疲労済追放）

## 🔧 **実装推奨順序**

1. **表記ゆれ修正** (疲労、IP消費)
2. **句点対応** (`.` 有無の両対応)
3. **未対応文言追加** (疲労済追放、自分IP消費)
4. **条件付き効果基盤** (複雑な条件判定)
5. **勝利条件完成** (侵略回数系)

これにより、cards.jsonの効果文言との整合性が大幅に向上し、より多くのカード効果が正しく動作するようになります。
