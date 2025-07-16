<template>
  <div v-if="currentPhase === 'auction'" class="auction-panel">
    <div class="auction-info">
      <div v-if="selectedCard" class="selected-card-info">
        <h4>選択中: {{ selectedCard.name }}</h4>
        <div class="card-abilities">
          <div
            v-for="(ability, index) in selectedCard.abilities"
            :key="index"
            class="ability"
          >
            <span class="ability-cost">コスト: {{ ability.cost }}</span>
            <span class="ability-type">{{ ability.type }}</span>
            <span class="ability-desc">{{ ability.description }}</span>
            <!-- オークションパネルの未実装チェック -->
            <div
              v-if="checkAbilityUnimplemented(ability)"
              class="auction-ability-badge"
              :class="checkAbilityUnimplemented(ability).class"
              :title="
                '未実装効果(優先度: ' +
                checkAbilityUnimplemented(ability).priority +
                ')'
              "
            >
              {{ checkAbilityUnimplemented(ability).icon }}
            </div>
          </div>
        </div>
      </div>

      <div class="bid-section">
        <input
          v-model.number="bidAmount"
          type="number"
          min="0"
          :max="playerIP"
          placeholder="入札額"
        />
        <button
          @click="$emit('place-bid', { selectedCard, bidAmount })"
          :disabled="!selectedCard || bidAmount <= 0"
        >
          入札
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "AuctionPanel",
  props: {
    currentPhase: {
      type: String,
      required: true,
    },
    selectedCard: {
      type: Object,
      default: null,
    },
    playerIP: {
      type: Number,
      required: true,
    },
  },
  data() {
    return {
      bidAmount: 0,
    };
  },
  watch: {
    selectedCard(newCard) {
      if (newCard) {
        this.bidAmount = 1;
      } else {
        this.bidAmount = 0;
      }
    },
  },
  methods: {
    checkAbilityUnimplemented(ability) {
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
  },
};
</script>

<style scoped>
.auction-panel {
  background: #f8f9fa;
  border: 2px solid #dee2e6;
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
}

.auction-info {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.selected-card-info h4 {
  margin-bottom: 15px;
  font-size: 18px;
  color: #333;
}

.card-abilities {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ability {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
}

.ability-cost {
  font-weight: bold;
  color: #007bff;
  min-width: 80px;
}

.ability-type {
  font-weight: 600;
  color: #333;
  min-width: 100px;
}

.ability-desc {
  flex: 1;
  color: #666;
}

.bid-section {
  display: flex;
  gap: 10px;
  align-items: center;
}

.bid-section input {
  padding: 10px;
  border: 2px solid #ddd;
  border-radius: 6px;
  font-size: 16px;
  width: 120px;
}

.bid-section button {
  padding: 10px 20px;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.bid-section button:hover:not(:disabled) {
  background: #218838;
}

.bid-section button:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

.auction-ability-badge {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: bold;
  cursor: help;
  border: 1px solid white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  margin-left: auto;
}

.auction-ability-badge.unimplemented-high {
  background: linear-gradient(135deg, #ff4444, #cc0000);
  color: white;
}

.auction-ability-badge.unimplemented-medium {
  background: linear-gradient(135deg, #ff9800, #f57c00);
  color: white;
}

.auction-ability-badge.unimplemented-low {
  background: linear-gradient(135deg, #2196f3, #1976d2);
  color: white;
}
</style>
