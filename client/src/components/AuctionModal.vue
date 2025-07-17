<template>
  <div v-if="show" class="auction-modal-overlay" @click="closeModal">
    <div class="auction-modal-content" @click.stop>
      <div class="auction-modal-header">
        <h3>🎯 オークション</h3>
        <button class="close-btn" @click="closeModal">×</button>
      </div>

      <div class="auction-modal-body">
        <!-- 選択中のカード詳細と入札 -->
        <div v-if="internalSelectedCard" class="selected-card-section">
          <!-- カード詳細 -->
          <div class="card-detail">
            <h4>{{ internalSelectedCard.name }}</h4>

            <div v-if="internalSelectedCard.traits" class="detail-traits">
              <strong>特性:</strong>
              {{ internalSelectedCard.traits.join(", ") }}
            </div>

            <div class="detail-abilities">
              <h5>アビリティ:</h5>
              <div
                v-for="(ability, index) in internalSelectedCard.abilities"
                :key="index"
                class="detail-ability"
              >
                <div class="ability-header">
                  <span class="ability-type">{{ ability.type }}</span>
                  <span class="ability-cost">コスト: {{ ability.cost }}</span>
                </div>
                <div class="ability-desc">{{ ability.description }}</div>
              </div>
            </div>
          </div>

          <!-- 入札セクション -->
          <div class="bid-section">
            <h5>入札</h5>

            <div class="bid-input">
              <div class="bid-input-group">
                <label>入札額:</label>
                <input
                  v-model.number="bidAmount"
                  type="number"
                  min="1"
                  :max="playerIP"
                  placeholder="入札額"
                  @keyup.enter="placeBid"
                />
                <span class="ip-indicator">/ {{ playerIP }}IP</span>
              </div>

              <div class="action-buttons">
                <button
                  class="bid-btn"
                  @click="placeBid"
                  :disabled="
                    !internalSelectedCard ||
                    bidAmount <= 0 ||
                    bidAmount > playerIP
                  "
                >
                  💰 入札
                </button>

                <!-- デバッグ獲得ボタン -->
                <button
                  class="debug-btn"
                  @click="debugAcquire"
                  :disabled="!internalSelectedCard"
                  title="デバッグ用: 疲労せずに獲得"
                >
                  🔧 デバッグ獲得
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="no-selection">
          <p>競売するカードを選択してください</p>
          <small>疲労中のカードは選択できません</small>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import EffectStatusAPI from "../api/effectStatus.js";

export default {
  name: "AuctionModal",
  props: {
    show: {
      type: Boolean,
      default: false,
    },
    selectedCard: {
      type: Object,
      default: null,
    },
    playerIP: {
      type: Number,
      required: true,
    },
    neutralField: {
      type: Array,
      default: () => [],
    },
  },
  emits: ["close", "place-bid", "debug-acquire"],
  data() {
    return {
      internalSelectedCard: null, // 内部的な選択カード状態
      bidAmount: 1,
      effectStatusAPI: new EffectStatusAPI(),
      effectStatuses: {},
    };
  },
  watch: {
    // モーダルが開かれたときに選択状態をリセット
    show(newValue) {
      if (newValue) {
        this.bidAmount = 1;
      }
    },
    // selectedCardが変更されたらinternalSelectedCardにも反映
    selectedCard(newCard) {
      this.internalSelectedCard = newCard;
    },
    // 内部選択カードが変更されたときに効果ステータスを読み込み
    internalSelectedCard(newCard) {
      if (newCard) {
        this.bidAmount = 1;
        this.loadEffectStatusesForCard(newCard);
      }
    },
  },
  methods: {
    selectCard(card) {
      this.internalSelectedCard = card;
    },

    closeModal() {
      this.internalSelectedCard = null;
      this.bidAmount = 1;
      this.$emit("close");
    },

    placeBid() {
      if (
        this.internalSelectedCard &&
        this.bidAmount > 0 &&
        this.bidAmount <= this.playerIP
      ) {
        this.$emit("place-bid", {
          selectedCard: this.internalSelectedCard,
          bidAmount: this.bidAmount,
        });
      }
    },

    debugAcquire() {
      if (this.internalSelectedCard) {
        this.$emit("debug-acquire", this.internalSelectedCard);
        // デバッグ獲得後はモーダルを閉じる
        this.closeModal();
      }
    },

    async loadEffectStatusesForCard(card) {
      if (card && card.abilities) {
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
    },
  },
};
</script>

<style scoped>
.auction-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
}

.auction-modal-content {
  background: white;
  border-radius: 16px;
  padding: 24px;
  max-width: 95vw;
  max-height: 95vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
  min-width: 800px;
}

.auction-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e9ecef;
}

.auction-modal-header h3 {
  margin: 0;
  color: #333;
  font-size: 24px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f8f9fa;
  color: #333;
}

.auction-modal-body {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 24px;
}

.auction-cards h4 {
  margin-bottom: 16px;
  color: #333;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
  max-height: 60vh;
  overflow-y: auto;
}

.auction-card {
  border: 2px solid #ddd;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: white;
}

.auction-card:hover:not(.disabled) {
  border-color: #007bff;
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.2);
  transform: translateY(-2px);
}

.auction-card.selected {
  border-color: #28a745;
  background: #f8fff9;
  box-shadow: 0 0 0 3px rgba(40, 167, 69, 0.2);
}

.auction-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #f5f5f5;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.card-name {
  font-weight: 600;
  color: #333;
  font-size: 16px;
}

.fatigue-label {
  background: #dc3545;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.card-traits {
  color: #6f42c1;
  font-size: 14px;
  margin-bottom: 12px;
  font-weight: 500;
}

.card-abilities {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ability {
  padding: 8px;
  background: #f8f9fa;
  border-radius: 6px;
  border-left: 3px solid #007bff;
  position: relative;
}

.ability-type {
  font-weight: 600;
  color: #007bff;
  margin-right: 8px;
}

.ability-cost {
  color: #666;
  font-size: 12px;
}

.ability-desc {
  color: #333;
  font-size: 13px;
  margin-top: 4px;
}

/* 選択中のカードセクション */
.selected-card-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: 70vh;
  overflow-y: auto;
}

.card-detail {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  border-left: 4px solid #007bff;
}

.card-detail h4 {
  margin: 0 0 16px 0;
  color: #333;
  font-size: 18px;
}

.detail-traits {
  margin-bottom: 16px;
  color: #6f42c1;
  font-size: 14px;
}

.detail-abilities {
  margin-bottom: 20px;
}

.detail-abilities h5 {
  margin: 0 0 12px 0;
  color: #333;
}

.detail-ability {
  background: white;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  border-left: 3px solid #007bff;
  position: relative;
}

.ability-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  position: relative;
}

.bid-section {
  background: #e8f5e8;
  border-radius: 12px;
  padding: 20px;
  border-left: 4px solid #28a745;
}

.bid-section h5 {
  margin: 0 0 16px 0;
  color: #333;
}

.bid-input-group {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.bid-input-group label {
  font-weight: 600;
  color: #333;
}

.bid-input-group input {
  padding: 8px 12px;
  border: 2px solid #ddd;
  border-radius: 6px;
  font-size: 16px;
  width: 100px;
}

.ip-indicator {
  color: #666;
  font-size: 14px;
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.bid-btn,
.debug-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;
}

.bid-btn {
  background: #28a745;
  color: white;
}

.bid-btn:hover:not(:disabled) {
  background: #218838;
  transform: translateY(-1px);
}

.bid-btn:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

.debug-btn {
  background: #ffc107;
  color: #212529;
}

.debug-btn:hover:not(:disabled) {
  background: #e0a800;
  transform: translateY(-1px);
}

.debug-btn:disabled {
  background: #6c757d;
  color: white;
  cursor: not-allowed;
}

.no-selection {
  text-align: center;
  padding: 40px;
  color: #666;
  background: #f8f9fa;
  border-radius: 12px;
  grid-column: 1 / -1;
}

.no-selection p {
  margin: 0 0 8px 0;
  font-size: 16px;
}

.no-selection small {
  color: #999;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

/* レスポンシブ対応 */
@media (max-width: 1200px) {
  .auction-modal-body {
    grid-template-columns: 1fr;
  }

  .auction-modal-content {
    min-width: 600px;
  }
}

@media (max-width: 768px) {
  .auction-modal-content {
    min-width: 90vw;
    padding: 16px;
  }

  .cards-grid {
    grid-template-columns: 1fr;
  }
}
</style>
