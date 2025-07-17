<template>
  <div class="field-container" :class="fieldType">
    <h3>{{ title }}</h3>
    <div class="card-grid">
      <div
        v-for="card in cards"
        :key="card.id + '-' + card.instanceId"
        class="card"
        :class="{
          fatigued: card.isFatigued,
          selected: selectedCard?.instanceId === card.instanceId,
          'player-card': fieldType === 'player-field',
          'neutral-card': fieldType === 'neutral-field',
        }"
        @click="$emit('card-click', card)"
        @contextmenu.prevent="$emit('card-detail', card)"
      >
        <div class="card-name">{{ card.name }}</div>
        <div v-if="card.traits" class="card-traits">
          {{ card.traits.join(", ") }}
        </div>
        <div v-if="fieldType === 'player-field'" class="card-count">
          所持: {{ getCardCount(card.id) }}
        </div>
        <div v-if="card.isFatigued" class="fatigue-counter">疲労中</div>

        <!-- アビリティボタン（プレイヤーフィールドのみ） -->
        <div v-if="fieldType === 'player-field'" class="abilities">
          <!-- デバッグ情報 -->
          <div
            class="debug-info"
            style="font-size: 10px; color: #666; margin-bottom: 2px"
          >
            Phase: {{ currentPhase }} | MyTurn: {{ isMyTurn }} | CardCount:
            {{ getCardCount(card.id) }}
          </div>
          <button
            v-for="(ability, index) in card.abilities"
            :key="index"
            class="ability-btn"
            :class="{
              'passive-ability':
                ability.type === '反応' ||
                ability.type === '獲得時' ||
                ability.type === '敵ターン開始時' ||
                ability.type === '永続',
              'conditions-met': isAbilityConditionsMet(card, ability),
              'victory-ready': isVictoryConditionMet(card, ability),
            }"
            :disabled="isAbilityDisabled(card, ability)"
            @click.stop="handleAbilityClick(card, ability)"
          >
            <span class="ability-text"
              >{{ ability.type }} ({{ ability.cost }})</span
            >
            <!-- 効果ステータス表示 -->
            <span
              class="effect-status-icon"
              :style="{
                color: getStatusColor(getEffectStatus(card.id, index).status),
              }"
              @click.stop="toggleEffectStatus(card.id, index)"
              :title="`効果ステータス: ${
                getEffectStatus(card.id, index).status
              } (クリックで切り替え)`"
            >
              {{ getStatusIcon(getEffectStatus(card.id, index).status) }}
            </span>
            <!-- 無効理由のデバッグ表示 -->
            <div
              v-if="
                getCardCount(card.id) < ability.cost ||
                card.isFatigued ||
                currentPhase !== 'playing' ||
                !isMyTurn
              "
              style="font-size: 8px; color: red"
            >
              <span v-if="getCardCount(card.id) < ability.cost">枚数不足 </span>
              <span v-if="card.isFatigued">疲労 </span>
              <span v-if="currentPhase !== 'playing'">非プレイング </span>
              <span v-if="!isMyTurn">非マイターン </span>
            </div>
            <!-- アビリティボタンの未実装タグ -->
            <div
              v-if="checkAbilityUnimplemented(card, ability, index)"
              class="ability-btn-badge"
              :class="checkAbilityUnimplemented(card, ability, index).class"
              :title="
                '未実装効果(優先度: ' +
                checkAbilityUnimplemented(card, ability, index).priority +
                ')'
              "
            >
              {{ checkAbilityUnimplemented(card, ability, index).icon }}
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import EffectStatusAPI from "../api/effectStatus.js";

export default {
  name: "CardGrid",
  data() {
    return {
      effectStatusAPI: new EffectStatusAPI(),
      effectStatuses: {}, // カードID_アビリティインデックス をキーとするステータス
    };
  },
  props: {
    title: {
      type: String,
      required: true,
    },
    cards: {
      type: Array,
      required: true,
    },
    fieldType: {
      type: String,
      required: true,
      validator: (value) =>
        ["opponent-field", "neutral-field", "player-field"].includes(value),
    },
    selectedCard: {
      type: Object,
      default: null,
    },
    currentPhase: {
      type: String,
      default: "",
    },
    isMyTurn: {
      type: Boolean,
      default: false,
    },
    playerField: {
      type: Array,
      default: () => [],
    },
    playerIP: {
      type: Number,
      default: 0,
    },
  },
  methods: {
    getCardCount(cardId) {
      return this.playerField.filter((card) => card.id === cardId).length;
    },
    checkUnimplementedEffects(card) {
      if (!card.abilities) return null;

      // DBベースのチェック（最優先）
      for (let i = 0; i < card.abilities.length; i++) {
        const key = `${card.id}_${i}`;
        const effectStatus = this.effectStatuses[key];

        if (effectStatus && effectStatus.status === "broken") {
          return {
            priority: "高",
            class: "unimplemented-high",
            icon: "🚨",
            source: "DB",
          };
        }
      }

      // 従来のパターンマッチング（レガシー検出用）
      return this.checkUnimplementedEffectsLegacy(card);
    },

    checkUnimplementedEffectsLegacy(card) {
      if (!card.abilities) return null;

      // 高優先度未実装効果のパターン
      const highPriorityPatterns = [
        /１ラウンドで侵略した回数が\d+を?超えていた場合/,
        /自フィールドに同種がいない場合/,
        /相手の反応持ちの数だけ/,
      ];

      // 中優先度未実装効果のパターン
      const mediumPriorityPatterns = [
        /自分の反応持ちカードの効果を発動できる/,
        /中立フィールドの同種を回復する/,
        /\d+体疲労させる/,
        /好きなだけ置く/,
        /１ラウンドにつき一度のみ/,
        /同種を一枚疲労させ/,
        /疲労済を追放する/,
        /自身の疲労取り除く/,
        /ラウンド終了/,
      ];

      // 低優先度未実装効果のパターン
      const lowPriorityPatterns = [
        /反応持ちを一体追放/,
        /反応持ちを一体疲労させ/,
        /相手の.*カードを発動させる/,
      ];

      // アビリティをチェック
      for (const ability of card.abilities) {
        const description = ability.description;

        // 高優先度チェック
        for (const pattern of highPriorityPatterns) {
          if (pattern.test(description)) {
            return {
              priority: "高",
              class: "unimplemented-high",
              icon: "🚨",
            };
          }
        }

        // 中優先度チェック
        for (const pattern of mediumPriorityPatterns) {
          if (pattern.test(description)) {
            return {
              priority: "中",
              class: "unimplemented-medium",
              icon: "🔶",
            };
          }
        }

        // 低優先度チェック
        for (const pattern of lowPriorityPatterns) {
          if (pattern.test(description)) {
            return {
              priority: "低",
              class: "unimplemented-low",
              icon: "🔷",
            };
          }
        }
      }

      return null;
    },
    checkAbilityUnimplemented(card, ability, abilityIndex) {
      // DBベースのチェック（最優先）
      const key = `${card.id}_${abilityIndex}`;
      const effectStatus = this.effectStatuses[key];

      if (effectStatus && effectStatus.status === "broken") {
        return {
          priority: "高",
          class: "unimplemented-high",
          icon: "🚨",
          source: "DB",
        };
      }

      // 従来のパターンマッチング（レガシー検出用）
      return this.checkAbilityUnimplementedLegacy(ability);
    },

    checkAbilityUnimplementedLegacy(ability) {
      const description = ability.description;

      // 高優先度未実装効果のパターン
      const highPriorityPatterns = [
        /１ラウンドで侵略した回数が\d+を?超えていた場合/,
        /自フィールドに同種がいない場合/,
        /相手の反応持ちの数だけ/,
      ];

      // 中優先度未実装効果のパターン
      const mediumPriorityPatterns = [
        /自分の反応持ちカードの効果を発動できる/,
        /中立フィールドの同種を回復する/,
        /\d+体疲労させる/,
        /好きなだけ置く/,
        /１ラウンドにつき一度のみ/,
        /同種を一枚疲労させ/,
        /疲労済を追放する/,
        /自身の疲労取り除く/,
        /ラウンド終了/,
      ];

      // 低優先度未実装効果のパターン
      const lowPriorityPatterns = [
        /反応持ちを一体追放/,
        /反応持ちを一体疲労させ/,
        /相手の.*カードを発動させる/,
      ];

      // 高優先度チェック
      for (const pattern of highPriorityPatterns) {
        if (pattern.test(description)) {
          return {
            priority: "高",
            class: "unimplemented-high",
            icon: "🚨",
          };
        }
      }

      // 中優先度チェック
      for (const pattern of mediumPriorityPatterns) {
        if (pattern.test(description)) {
          return {
            priority: "中",
            class: "unimplemented-medium",
            icon: "🔶",
          };
        }
      }

      // 低優先度チェック
      for (const pattern of lowPriorityPatterns) {
        if (pattern.test(description)) {
          return {
            priority: "低",
            class: "unimplemented-low",
            icon: "🔷",
          };
        }
      }

      return null;
    },

    // 効果ステータス関連メソッド
    async loadEffectStatuses() {
      for (const card of this.cards) {
        if (card.abilities) {
          for (let i = 0; i < card.abilities.length; i++) {
            const key = `${card.id}_${i}`;
            try {
              const status = await this.effectStatusAPI.getEffectStatus(
                card.id,
                i
              );
              this.effectStatuses[key] = status;
            } catch (error) {
              console.error("効果ステータス読み込みエラー:", error);
            }
          }
        }
      }
    },

    getEffectStatus(cardId, abilityIndex) {
      const key = `${cardId}_${abilityIndex}`;
      return this.effectStatuses[key] || { status: "unknown" };
    },

    async toggleEffectStatus(cardId, abilityIndex) {
      const currentStatus = this.getEffectStatus(cardId, abilityIndex);
      let newStatus;

      // working -> broken -> unknown -> working の循環
      switch (currentStatus.status) {
        case "working":
          newStatus = "broken";
          break;
        case "broken":
          newStatus = "unknown";
          break;
        default:
          newStatus = "working";
          break;
      }

      try {
        const result = await this.effectStatusAPI.setEffectStatus(
          cardId,
          abilityIndex,
          newStatus,
          "user"
        );
        if (result.success) {
          const key = `${cardId}_${abilityIndex}`;
          this.effectStatuses[key] = {
            ...currentStatus,
            status: newStatus,
          };
        }
      } catch (error) {
        console.error("効果ステータス更新エラー:", error);
      }
    },

    getStatusIcon(status) {
      switch (status) {
        case "working":
          return "✅";
        case "broken":
          return "❌";
        default:
          return "❓";
      }
    },

    getStatusColor(status) {
      switch (status) {
        case "working":
          return "#4caf50";
        case "broken":
          return "#f44336";
        default:
          return "#9e9e9e";
      }
    },

    // アビリティが無効かどうかを判定
    isAbilityDisabled(card, ability) {
      // 反応、獲得時、敵ターン開始時、永続は常に無効（能動的に発動できない）
      if (
        ability.type === "反応" ||
        ability.type === "獲得時" ||
        ability.type === "敵ターン開始時" ||
        ability.type === "永続"
      ) {
        return true;
      }

      // 勝利条件は特別扱い（条件を満たしていれば有効）
      if (ability.type === "勝利") {
        return (
          !this.isVictoryConditionMet(card, ability) ||
          this.getCardCount(card.id) < ability.cost ||
          card.isFatigued ||
          this.currentPhase !== "playing" ||
          !this.isMyTurn
        );
      }

      // 一般的な条件チェック
      return (
        this.getCardCount(card.id) < ability.cost ||
        card.isFatigued ||
        this.currentPhase !== "playing" ||
        !this.isMyTurn
      );
    },

    // アビリティの条件が満たされているかチェック
    isAbilityConditionsMet(card, ability) {
      // 基本条件（枚数、疲労状態、フェーズ、ターン）
      const basicConditions =
        this.getCardCount(card.id) >= ability.cost &&
        !card.isFatigued &&
        this.currentPhase === "playing" &&
        this.isMyTurn;

      // 反応、獲得時、敵ターン開始時、永続は基本条件のみ
      if (
        ability.type === "反応" ||
        ability.type === "獲得時" ||
        ability.type === "敵ターン開始時" ||
        ability.type === "永続"
      ) {
        return basicConditions;
      }

      // 強化効果の追加条件チェック
      if (ability.type === "強化") {
        // ブナシメジ生成効果の条件チェック
        if (ability.description.includes("自フィールドに反応持ちがいる場合")) {
          const hasReactionCard = this.playerField.some(
            (fieldCard) =>
              fieldCard.abilities &&
              fieldCard.abilities.some((a) => a.type === "反応")
          );
          return basicConditions && hasReactionCard;
        }
      }

      return basicConditions;
    },

    // 勝利条件が満たされているかチェック
    isVictoryConditionMet(card, ability) {
      if (ability.type !== "勝利") return false;

      // 基本条件：コスト数のカードを所持しているか
      const cardCount = this.getCardCount(card.id);
      if (cardCount < ability.cost) {
        return false;
      }

      // 累計IPが40を超えている場合の条件チェック
      if (ability.description.includes("累計IPが40を超えている場合")) {
        return this.playerIP > 40;
      }

      // ブナシメジの勝利条件：IP40以上
      if (card.id === "mushroom" && ability.description.includes("IP40以上")) {
        return this.playerIP >= 40;
      }

      // IP40以上の条件チェック
      if (ability.description.includes("IP40以上")) {
        return this.playerIP >= 40;
      }

      // 条件なしの勝利条件
      if (ability.description.includes("条件なし")) {
        return true;
      }

      // 追放枚数系勝利条件（概算として40で判定、正確な実装には追放フィールドのデータが必要）
      if (ability.description.includes("追放が10体になった時")) {
        // 実際の追放フィールドのデータがないため、仮の条件
        return false; // TODO: 追放フィールドのデータを取得して正確に判定
      }

      // フィールド枚数系勝利条件
      const fieldCountMatch = ability.description.match(
        /自フィールドにカードが(\d+)枚ある場合/
      );
      if (fieldCountMatch) {
        const requiredCount = parseInt(fieldCountMatch[1]);
        return this.playerField.length >= requiredCount;
      }

      return false;
    },

    // アビリティクリック処理
    handleAbilityClick(card, ability) {
      // 反応、獲得時、敵ターン開始時、永続効果は能動的に発動しない
      if (
        ability.type === "反応" ||
        ability.type === "獲得時" ||
        ability.type === "敵ターン開始時" ||
        ability.type === "永続"
      ) {
        return;
      }

      // その他の効果は通常通り発動
      this.$emit("use-ability", card, ability);
    },
  },

  mounted() {
    this.loadEffectStatuses();
  },

  watch: {
    cards: {
      handler() {
        this.loadEffectStatuses();
      },
      deep: true,
    },
  },
};
</script>

<style scoped>
.field-container {
  margin-bottom: 30px;
}

.field-container h3 {
  margin-bottom: 15px;
  padding: 10px;
  background: #e9ecef;
  border-radius: 4px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
}

.card {
  border: 2px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.card:hover {
  border-color: #007bff;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.card.selected {
  border-color: #007bff;
  background: #e3f2fd;
}

.card.fatigued {
  opacity: 0.6;
  background: #f5f5f5;
}

.card-name {
  font-weight: bold;
  font-size: 16px;
  margin-bottom: 8px;
  color: #333;
}

.card-traits {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
  font-style: italic;
}

.card-count {
  font-size: 12px;
  color: #007bff;
  font-weight: bold;
}

.fatigue-counter {
  font-size: 12px;
  color: #ff6b6b;
  font-weight: bold;
}

.abilities {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ability-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 10px;
  font-size: 12px;
  background: #f8f9fa;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.ability-btn:hover:not(:disabled) {
  background: #e9ecef;
  border-color: #007bff;
}

.ability-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ability-btn.has-unimplemented {
  border: 2px solid #ff9800;
  box-shadow: 0 0 8px rgba(255, 152, 0, 0.3);
}

.ability-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 未実装効果バッジ */
.unimplemented-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  cursor: help;
  z-index: 10;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  animation: unimplemented-pulse 2s infinite;
}

.unimplemented-badge.unimplemented-high {
  background: linear-gradient(135deg, #ff4444, #cc0000);
  color: white;
}

.unimplemented-badge.unimplemented-medium {
  background: linear-gradient(135deg, #ff9800, #f57c00);
  color: white;
}

.unimplemented-badge.unimplemented-low {
  background: linear-gradient(135deg, #2196f3, #1976d2);
  color: white;
}

@keyframes unimplemented-pulse {
  0% {
    transform: scale(1);
    opacity: 0.9;
  }
  50% {
    transform: scale(1.1);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0.9;
  }
}

.unimplemented-badge:hover {
  transform: scale(1.2);
  animation: none;
}

.ability-btn-badge {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: bold;
  cursor: help;
  border: 1px solid white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  margin-left: 4px;
}

.ability-btn-badge.unimplemented-high {
  background: linear-gradient(135deg, #ff4444, #cc0000);
  color: white;
}

.ability-btn-badge.unimplemented-medium {
  background: linear-gradient(135deg, #ff9800, #f57c00);
  color: white;
}

.ability-btn-badge.unimplemented-low {
  background: linear-gradient(135deg, #2196f3, #1976d2);
  color: white;
}

.effect-status-icon {
  font-size: 12px;
  margin-left: 4px;
  cursor: pointer;
  user-select: none;
  transition: transform 0.2s ease;
}

.effect-status-icon:hover {
  transform: scale(1.2);
}

/* パッシブアビリティ（反応・獲得時）のスタイル */
.ability-btn.passive-ability {
  background: linear-gradient(135deg, #6c757d, #5a6268);
  color: white;
  cursor: not-allowed;
  opacity: 0.7;
}

.ability-btn.passive-ability:hover {
  background: linear-gradient(135deg, #6c757d, #5a6268);
  transform: none;
  box-shadow: none;
}

/* 条件を満たしているパッシブアビリティ */
.ability-btn.passive-ability.conditions-met {
  background: linear-gradient(135deg, #28a745, #20c997);
  opacity: 0.9;
  box-shadow: 0 0 10px rgba(40, 167, 69, 0.3);
}

.ability-btn.passive-ability.conditions-met:hover {
  background: linear-gradient(135deg, #28a745, #20c997);
}

/* 勝利条件が満たされている場合のキラキラエフェクト */
.ability-btn.victory-ready {
  background: linear-gradient(135deg, #ffd700, #ffb347);
  color: #333;
  font-weight: bold;
  animation: sparkle 1.5s ease-in-out infinite;
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.6);
}

.ability-btn.victory-ready:hover {
  background: linear-gradient(135deg, #ffed4e, #ffc947);
  animation-duration: 0.8s;
  box-shadow: 0 0 25px rgba(255, 215, 0, 0.8);
}

@keyframes sparkle {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.6);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 0 30px rgba(255, 215, 0, 0.9), 0 0 40px rgba(255, 215, 0, 0.4),
      0 0 50px rgba(255, 215, 0, 0.2);
  }
}
</style>
