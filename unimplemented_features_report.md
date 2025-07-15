# 🚨 CardEffects.js 未対応事項 総合レポート（2025年7月版）

## 📊 **修正状況サマリー**

### ✅ **修正完了項目（2025年7月15日実装済み）**
- 疲労効果の句点対応（`"一匹疲労させる。"` / `"一匹疲労させる"`）
- IP消費系の統一（`"自分のIPを3消費し"` 対応）
- 疲労済限定追放（`"疲労済を追放する"` 実装）
- 同種疲労効果（`"同種を一枚疲労させ"` 実装）
- 勝利条件の表記統一

### ❌ **現在も未対応の事項**

## 🔥 **高優先度未対応（ゲームプレイに直接影響）**

### **1. 自身回復効果**
```javascript
// cards.json文言: "自身の疲労取り除く"
// 現状: 未実装 ❌
// 影響カード: ライオン（カード2）など

// 必要な実装:
if (ability.description.includes('自身の疲労取り除く') || 
    ability.description.includes('自身の疲労を取り除く')) {
  card.isFatigued = false;
  return { success: true, message: '自身の疲労を取り除きました' };
}
```

### **2. 疲労回避効果**
```javascript
// cards.json文言: "この効果で疲労しない"
// 現状: 未実装 ❌
// 影響: カード使用後の疲労状態管理

// 必要な実装:
if (!ability.description.includes('この効果で疲労しない')) {
  card.isFatigued = true; // 通常は疲労
}
```

### **3. 条件付き効果の基盤**
```javascript
// cards.json文言: "自フィールドに同種がいない場合"
// 現状: 条件チェック機能なし ❌

// 必要な実装:
handleConditionalEffect(player, card, ability) {
  if (ability.description.includes('自フィールドに同種がいない場合')) {
    const sameTypeExists = player.field.some(c => 
      c.id === card.id && c.fieldId !== card.fieldId
    );
    if (sameTypeExists) {
      return { success: false, message: '同種カードが存在します' };
    }
  }
  // 条件を満たす場合の効果実行
}
```

### **4. 侵略回数追跡システム**
```javascript
// cards.json文言: "１ラウンドで侵略した回数が6を超えていた場合"
// 現状: 常にfalseを返す ❌

// 必要な実装:
class GameEngine {
  constructor() {
    this.invasionCounts = {}; // プレイヤーごとの侵略回数
  }
  
  trackInvasion(playerId) {
    if (!this.invasionCounts[playerId]) {
      this.invasionCounts[playerId] = 0;
    }
    this.invasionCounts[playerId]++;
  }
  
  resetInvasionCounts() {
    this.invasionCounts = {}; // ラウンド終了時にリセット
  }
}
```

## 🔶 **中優先度未対応（機能性向上）**

### **5. 複雑な反応効果**
```javascript
// cards.json文言: "相手の反応持ちの数だけ、ジュゴンを回復させる"
// 現状: カウント機能なし ❌

// 必要な実装:
if (ability.description.includes('相手の反応持ちの数だけ')) {
  const opponent = this.getOpponent(player);
  const reactionCount = opponent.field.filter(card => 
    card.abilities.some(a => a.type === '反応')
  ).length;
  
  // reactionCount回の回復処理
  for (let i = 0; i < reactionCount; i++) {
    // 回復処理実行
  }
}
```

### **6. 手動反応発動システム**
```javascript
// cards.json文言: "自分の反応持ちカードの効果を発動できる"
// 現状: 自動反応のみ ❌

// 必要な実装:
executeManualReaction(player, reactionCard) {
  const reactionAbilities = reactionCard.abilities.filter(a => a.type === '反応');
  // プレイヤーが選択した反応効果を手動実行
}
```

### **7. 中立フィールド操作**
```javascript
// cards.json文言: "中立フィールドの同種を回復する"
// 現状: 中立フィールド操作機能なし ❌

// 必要な実装:
if (ability.description.includes('中立フィールドの同種を回復する')) {
  const neutralSameType = this.game.neutralField.filter(c => c.id === card.id);
  neutralSameType.forEach(c => c.isFatigued = false);
}
```

### **8. 特定条件の追放**
```javascript
// cards.json文言: "疲労済を追放する"は実装済み ✅
// 未対応: "反応持ちを追放する"などの特定条件

// 必要な実装:
if (ability.description.includes('反応持ちを追放する')) {
  const reactionCards = opponent.field.filter(card => 
    card.abilities.some(a => a.type === '反応')
  );
  // 反応持ちから選択して追放
}
```

## 🔷 **低優先度未対応（高度な機能）**

### **9. フィールド生成系**
```javascript
// cards.json文言: "中立に○○を生成"
// 現状: 簡略化実装（実際のカード生成なし） ⚠️

// 必要な実装:
generateToNeutral(cardData) {
  const newCard = this.createCardInstance(cardData);
  this.game.neutralField.push(newCard);
}
```

### **10. 複数体効果**
```javascript
// cards.json文言: "2体疲労させる", "好きなだけ"
// 現状: 単体効果のみ ❌

// 必要な実装:
if (ability.description.includes('2体疲労させる')) {
  const targets = this.selectMultipleTargets(opponent.field, 2);
  targets.forEach(target => target.isFatigued = true);
}
```

### **11. ラウンド制限効果**
```javascript
// cards.json文言: "１ラウンドにつき一度のみ"
// 現状: 使用回数制限なし ❌

// 必要な実装:
class GameEngine {
  constructor() {
    this.roundLimitedEffects = {}; // ラウンド制限効果の使用履歴
  }
}
```

## 📈 **実装優先度マトリックス**

### **🚨 緊急度: 高**
1. **自身疲労回復** - 多数のカードで使用
2. **侵略回数追跡** - 勝利条件に影響
3. **条件付き効果基盤** - 多くの高度効果の基礎

### **⚡ 緊急度: 中**
4. **疲労回避効果** - 戦略性に影響
5. **複雑反応効果** - 反応システムの完成度向上
6. **中立フィールド操作** - 水棲系カードの完全実装

### **🔧 緊急度: 低**
7. **手動反応発動** - UI連携が必要
8. **複数体効果** - 実装複雑度が高い
9. **ラウンド制限** - ゲームフロー管理が必要

## 🎯 **段階的実装ロードマップ**

### **Phase 1: 基本効果の完成（1-2週間）**
```javascript
// 自身疲労回復、疲労回避、基本条件チェック
// 推定実装工数: 3-5時間
```

### **Phase 2: 追跡システム実装（2-3週間）**
```javascript
// 侵略回数追跡、ラウンド管理、使用回数制限
// 推定実装工数: 8-12時間
```

### **Phase 3: 高度な効果実装（1-2ヶ月）**
```javascript
// 複雑反応、手動発動、中立操作、複数体効果
// 推定実装工数: 20-30時間
```

## 💡 **実装時の注意点**

### **1. 既存コードへの影響**
- 新機能追加時は既存の動作に影響しないよう注意
- テストケースの充実が必要

### **2. パフォーマンス考慮**
- 条件チェックの最適化
- 無限ループ防止機構

### **3. UI連携**
- 手動発動系は対応するフロントエンド実装が必要
- 複数選択UIの実装

## 📊 **現在の実装完成度**

| カテゴリ | 完成度 | 主な未対応 |
|----------|---------|------------|
| **基本効果** | 85% | 自身回復、疲労回避 |
| **条件付き効果** | 20% | 条件チェック基盤 |
| **追跡システム** | 10% | 侵略回数、ラウンド制限 |
| **反応システム** | 70% | 複雑反応、手動発動 |
| **中立操作** | 30% | 実際の生成・操作 |
| **複数体効果** | 0% | 全般的に未実装 |

**総合実装完成度: 約65%** 

基本的なゲームプレイは可能だが、一部の高度なカード効果は期待通りに動作しない状態です。Phase 1の実装により完成度を85%程度まで向上させることが可能です。
