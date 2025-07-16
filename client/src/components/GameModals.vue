<template>
  <!-- マッチング完了画面 -->
  <div v-if="showMatchResult" class="match-result-overlay">
    <div class="match-result-content">
      <h2>🎉 マッチングしました！</h2>
      <div class="opponent-info-display">
        <p class="opponent-label">対戦相手！</p>
        <p class="opponent-name-display">{{ opponentName }}</p>
      </div>
    </div>
  </div>

  <!-- オークション結果表示 -->
  <div v-if="showAuctionResult" class="auction-result-overlay">
    <div class="auction-result-content">
      <div class="auction-result-header">
        <h2>🎯 オークション結果</h2>
        <button @click="$emit('close-auction-result')" class="close-btn">
          ×
        </button>
      </div>
      <div class="auction-result-body" v-if="auctionResultData">
        <div class="auction-card-info" v-if="auctionResultData.cardInfo">
          <div class="card-image">🎴</div>
          <h3>{{ auctionResultData.cardInfo?.name || "カード" }}</h3>
          <div class="card-details">
            <span class="card-type">{{
              auctionResultData.cardInfo?.type || "カード"
            }}</span>
            <span class="card-cost" v-if="auctionResultData.cardInfo?.manaCost">
              コスト: {{ auctionResultData.cardInfo.manaCost }}
            </span>
          </div>
        </div>

        <div class="auction-bids">
          <div class="bid-comparison">
            <div
              class="player-bid"
              :class="{ winner: auctionResultData.winner === playerName }"
            >
              <div class="player-name">{{ playerName }}</div>
              <div class="bid-amount">{{ auctionResultData.playerBid }}IP</div>
              <div
                v-if="auctionResultData.winner === playerName"
                class="winner-badge"
              >
                勝利!
              </div>
            </div>

            <div class="vs-separator">VS</div>

            <div
              class="opponent-bid"
              :class="{ winner: auctionResultData.winner === opponentName }"
            >
              <div class="player-name">{{ opponentName }}</div>
              <div class="bid-amount">
                {{ auctionResultData.opponentBid }}IP
              </div>
              <div
                v-if="auctionResultData.winner === opponentName"
                class="winner-badge"
              >
                勝利!
              </div>
            </div>
          </div>
        </div>

        <div class="auction-result-summary">
          <div
            v-if="auctionResultData.winner === playerName"
            class="result-message success"
          >
            🎉
            {{ auctionResultData.cardInfo?.name || "カード" }}を獲得しました！
          </div>
          <div
            v-else-if="auctionResultData.winner === opponentName"
            class="result-message defeat"
          >
            😔 {{ opponentName }}が{{
              auctionResultData.cardInfo?.name || "カード"
            }}を獲得しました
          </div>
          <div v-else class="result-message draw">
            引き分け - カードは中立フィールドに残ります
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ターン/フェーズ変更通知 -->
  <div v-if="showTurnPhaseNotification" class="turn-phase-notification-overlay">
    <div class="turn-phase-notification-content">
      <div class="notification-icon">🔄</div>
      <h2 class="notification-title">{{ turnPhaseNotificationMessage }}</h2>
      <div class="notification-details">
        <div class="current-turn">ターン {{ currentTurn }}</div>
        <div class="current-phase">
          {{ getPhaseDisplayName(currentPhase) }}
        </div>
      </div>
    </div>
  </div>

  <!-- 対象選択モーダル -->
  <div
    v-if="showTargetSelection"
    class="target-selection-modal"
    @click="$emit('cancel-target-selection')"
  >
    <div class="target-selection-content" @click.stop>
      <div class="target-selection-header">
        <h3>対象を選択してください</h3>
        <button class="close-btn" @click="$emit('cancel-target-selection')">
          ×
        </button>
      </div>
      <div class="target-selection-body">
        <p class="target-message">{{ targetSelectionMessage }}</p>
        <div class="target-cards">
          <div
            v-for="target in validTargets"
            :key="target.fieldId"
            class="target-card"
            :class="{ fatigued: target.isFatigued }"
            @click="$emit('select-target', target.fieldId)"
          >
            <div class="target-card-name">{{ target.name }}</div>
            <div v-if="target.isFatigued" class="target-fatigue">疲労中</div>
          </div>
        </div>
        <div class="target-actions">
          <button
            class="cancel-target-btn"
            @click="$emit('cancel-target-selection')"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- カード選択オプションメニュー -->
  <div
    v-if="showCardOptions"
    class="card-options-modal"
    @click="$emit('hide-card-options')"
  >
    <div class="card-options-content" @click.stop>
      <div class="card-options-header">
        <h4>{{ selectedCardForOptions?.name }}</h4>
        <button class="close-btn" @click="$emit('hide-card-options')">×</button>
      </div>
      <div class="card-options-body">
        <button class="option-btn detail-btn" @click="$emit('show-detail')">
          📋 詳細
        </button>
        <button
          class="option-btn cancel-btn"
          @click="$emit('hide-card-options')"
        >
          ❌ キャンセル
        </button>
        <!-- オークション中の場合、入札オプションを表示 -->
        <button
          v-if="
            currentPhase === 'auction' &&
            selectedCardForOptions &&
            !selectedCardForOptions.fatigued
          "
          class="option-btn bid-btn"
          @click="$emit('select-for-bid')"
        >
          💰 入札
        </button>
      </div>
    </div>
  </div>

  <!-- カード詳細モーダル -->
  <div
    v-if="detailCard"
    class="card-detail-modal"
    @click="$emit('hide-card-detail')"
  >
    <div class="card-detail-content" @click.stop>
      <div class="card-detail-header">
        <h3>{{ detailCard.name }}</h3>
        <button class="close-btn" @click="$emit('hide-card-detail')">×</button>
      </div>
      <div class="card-detail-body">
        <div v-if="detailCard.traits" class="detail-traits">
          <strong>特性:</strong> {{ detailCard.traits.join(", ") }}
        </div>
        <div
          v-if="detailCard.abilities && detailCard.abilities.length > 0"
          class="detail-abilities"
        >
          <strong>アビリティ:</strong>
          <div
            v-for="(ability, index) in detailCard.abilities"
            :key="index"
            class="detail-ability"
          >
            <div class="ability-header">
              <span class="ability-name">{{ ability.type }}</span>
              <span class="ability-cost">コスト: {{ ability.cost }}</span>
              <!-- 効果ステータス表示 -->
              <span
                class="effect-status-icon"
                :style="{
                  color: getStatusColor(
                    getEffectStatus(detailCard.id, index).status
                  ),
                }"
                @click.stop="toggleEffectStatus(detailCard.id, index)"
                :title="`効果ステータス: ${
                  getEffectStatus(detailCard.id, index).status
                } (クリックで切り替え)`"
              >
                {{
                  getStatusIcon(getEffectStatus(detailCard.id, index).status)
                }}
              </span>
              <!-- 個別アビリティの未実装タグ -->
              <div
                v-if="checkAbilityUnimplemented(ability)"
                class="ability-unimplemented-badge"
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
            <div class="ability-description">{{ ability.description }}</div>
          </div>
        </div>
        <div v-if="detailCard.fatigued" class="detail-status">
          <strong>状態:</strong> 疲労中 ({{
            detailCard.fatigueCounter
          }}ターン残り)
        </div>
      </div>
    </div>
  </div>

  <!-- ゲーム終了 -->
  <div v-if="gameState === 'finished'" class="game-over">
    <h2>ゲーム終了</h2>
    <div class="winner-announcement">
      <p v-if="winner">勝者: {{ winner }}</p>
      <p v-else>引き分け</p>
    </div>
    <button @click="$emit('reset-game')">新しいゲーム</button>
  </div>
</template>

<script>
import EffectStatusAPI from "../api/effectStatus.js";

export default {
  name: "GameModals",
  data() {
    return {
      effectStatusAPI: new EffectStatusAPI(),
      effectStatuses: {},
    };
  },
  props: {
    // Match result modal
    showMatchResult: {
      type: Boolean,
      default: false,
    },
    opponentName: {
      type: String,
      default: "",
    },
    // Auction result modal
    showAuctionResult: {
      type: Boolean,
      default: false,
    },
    auctionResultData: {
      type: Object,
      default: null,
    },
    playerName: {
      type: String,
      default: "",
    },
    // Turn/Phase notification
    showTurnPhaseNotification: {
      type: Boolean,
      default: false,
    },
    turnPhaseNotificationMessage: {
      type: String,
      default: "",
    },
    currentTurn: {
      type: Number,
      default: 1,
    },
    currentPhase: {
      type: String,
      default: "",
    },
    // Target selection modal
    showTargetSelection: {
      type: Boolean,
      default: false,
    },
    targetSelectionMessage: {
      type: String,
      default: "",
    },
    validTargets: {
      type: Array,
      default: () => [],
    },
    // Card options modal
    showCardOptions: {
      type: Boolean,
      default: false,
    },
    selectedCardForOptions: {
      type: Object,
      default: null,
    },
    // Card detail modal
    detailCard: {
      type: Object,
      default: null,
    },
    // Game over modal
    gameState: {
      type: String,
      default: "",
    },
    winner: {
      type: String,
      default: null,
    },
  },
  methods: {
    getPhaseDisplayName(phase) {
      const phaseNames = {
        auction: "オークション",
        playing: "プレイング",
        "target-selection": "対象選択",
      };
      return phaseNames[phase] || phase;
    },
    checkAbilityUnimplemented(ability) {
      // まずdetailCardからアビリティのインデックスを取得
      if (this.detailCard && this.detailCard.abilities) {
        const abilityIndex = this.detailCard.abilities.indexOf(ability);
        if (abilityIndex !== -1) {
          const key = `${this.detailCard.id}_${abilityIndex}`;
          const effectStatus = this.effectStatuses[key];
          
          // DBでbrokenと記録されている場合は未実装扱い
          if (effectStatus && effectStatus.status === 'broken') {
            return {
              priority: "高",
              class: "unimplemented-high",
              icon: "🚨",
              source: "DB"
            };
          }
        }
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
  },

  watch: {
    detailCard: {
      handler(newCard) {
        if (newCard) {
          this.loadEffectStatusesForCard(newCard);
        }
      },
      deep: true,
    },
  },
};
</script>

<style scoped>
/* Base modal styles */
.match-result-overlay,
.auction-result-overlay,
.turn-phase-notification-overlay,
.target-selection-modal,
.card-options-modal,
.card-detail-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  animation: fadeIn 0.3s ease;
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

/* Close button styles */
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

/* Match result modal */
.match-result-content {
  background: white;
  border-radius: 16px;
  padding: 40px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
}

.match-result-content h2 {
  color: #28a745;
  margin-bottom: 20px;
  font-size: 2em;
}

.opponent-info-display {
  background: #e3f2fd;
  padding: 20px;
  border-radius: 12px;
  border: 2px solid #2196f3;
}

.opponent-label {
  font-size: 14px;
  color: #1976d2;
  margin-bottom: 8px;
  font-weight: 600;
}

.opponent-name-display {
  font-size: 24px;
  font-weight: bold;
  color: #1976d2;
  margin: 0;
}

/* Auction result modal */
.auction-result-content {
  background: white;
  border-radius: 16px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
}

.auction-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e9ecef;
}

.auction-result-header h2 {
  margin: 0;
  color: #333;
  font-size: 24px;
}

.auction-card-info {
  text-align: center;
  margin-bottom: 20px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 12px;
}

.card-image {
  font-size: 48px;
  margin-bottom: 10px;
}

.auction-card-info h3 {
  margin: 10px 0;
  color: #333;
}

.card-details {
  display: flex;
  justify-content: center;
  gap: 15px;
  font-size: 14px;
  color: #666;
}

.bid-comparison {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 20px 0;
}

.player-bid,
.opponent-bid {
  text-align: center;
  padding: 15px;
  border-radius: 12px;
  border: 2px solid #dee2e6;
  background: white;
  flex: 1;
  max-width: 120px;
}

.player-bid.winner,
.opponent-bid.winner {
  border-color: #28a745;
  background: #d4edda;
}

.player-name {
  font-weight: 600;
  margin-bottom: 8px;
  color: #333;
}

.bid-amount {
  font-size: 18px;
  font-weight: bold;
  color: #007bff;
}

.winner-badge {
  margin-top: 8px;
  padding: 4px 8px;
  background: #28a745;
  color: white;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.vs-separator {
  font-weight: bold;
  font-size: 18px;
  color: #666;
  margin: 0 15px;
}

.auction-result-summary {
  text-align: center;
  margin-top: 20px;
}

.result-message {
  padding: 15px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 16px;
}

.result-message.success {
  background: #d4edda;
  color: #155724;
  border: 2px solid #c3e6cb;
}

.result-message.defeat {
  background: #f8d7da;
  color: #721c24;
  border: 2px solid #f5c6cb;
}

.result-message.draw {
  background: #fff3cd;
  color: #856404;
  border: 2px solid #ffeaa7;
}

/* Turn/Phase notification */
.turn-phase-notification-content {
  background: white;
  border-radius: 16px;
  padding: 40px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
  max-width: 400px;
}

.notification-icon {
  font-size: 48px;
  margin-bottom: 20px;
}

.notification-title {
  color: #333;
  margin-bottom: 20px;
  font-size: 1.5em;
}

.notification-details {
  display: flex;
  justify-content: center;
  gap: 20px;
  font-size: 14px;
  color: #666;
}

/* Target selection modal */
.target-selection-content {
  background: white;
  border-radius: 16px;
  padding: 24px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
}

.target-selection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e9ecef;
}

.target-selection-header h3 {
  margin: 0;
  color: #333;
}

.target-message {
  margin-bottom: 20px;
  color: #666;
  font-size: 16px;
}

.target-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 20px;
}

.target-card {
  padding: 15px;
  border: 2px solid #ddd;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: white;
}

.target-card:hover {
  border-color: #007bff;
  box-shadow: 0 4px 8px rgba(0, 123, 255, 0.2);
}

.target-card.fatigued {
  opacity: 0.6;
  background: #f5f5f5;
}

.target-card-name {
  font-weight: 600;
  margin-bottom: 8px;
}

.target-fatigue {
  font-size: 12px;
  color: #ff6b6b;
  font-weight: bold;
}

.target-actions {
  text-align: center;
}

.cancel-target-btn {
  padding: 10px 20px;
  background: #6c757d;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
}

.cancel-target-btn:hover {
  background: #545b62;
}

/* Card options modal */
.card-options-content {
  background: white;
  border-radius: 16px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
}

.card-options-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e9ecef;
}

.card-options-header h4 {
  margin: 0;
  color: #333;
  font-size: 20px;
  font-weight: 600;
}

.card-options-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.option-btn {
  padding: 12px 20px;
  border: 2px solid #ddd;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.option-btn:hover {
  border-color: #007bff;
  background: #f8f9fa;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.2);
}

.detail-btn {
  border-color: #17a2b8;
  color: #17a2b8;
}

.detail-btn:hover {
  border-color: #138496;
  color: #138496;
  background: #e6f3f5;
}

.cancel-btn {
  border-color: #6c757d;
  color: #6c757d;
}

.cancel-btn:hover {
  border-color: #545b62;
  color: #545b62;
  background: #f8f9fa;
}

.bid-btn {
  border-color: #28a745;
  color: #28a745;
}

.bid-btn:hover {
  border-color: #1e7e34;
  color: #1e7e34;
  background: #e8f5e9;
}

/* Card detail modal */
.card-detail-content {
  background: white;
  border-radius: 16px;
  padding: 24px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
}

.card-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e9ecef;
}

.card-detail-header h3 {
  margin: 0;
  color: #333;
  font-size: 24px;
  font-weight: 600;
}

.card-detail-body {
  line-height: 1.6;
}

.detail-traits {
  margin-bottom: 16px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
  border-left: 4px solid #6f42c1;
}

.detail-abilities {
  margin-bottom: 16px;
}

.detail-ability {
  margin: 12px 0;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
  border-left: 4px solid #007bff;
}

.ability-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.ability-name {
  font-weight: 600;
  color: #333;
}

.ability-cost {
  color: #007bff;
  font-weight: 600;
}

.ability-description {
  color: #666;
  font-size: 14px;
}

.detail-status {
  padding: 12px;
  background: #fff3cd;
  border-radius: 8px;
  border-left: 4px solid #ffc107;
  color: #856404;
}

.ability-unimplemented-badge {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
  cursor: help;
  border: 1px solid white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  margin-left: auto;
}

.ability-unimplemented-badge.unimplemented-high {
  background: linear-gradient(135deg, #ff4444, #cc0000);
  color: white;
}

.ability-unimplemented-badge.unimplemented-medium {
  background: linear-gradient(135deg, #ff9800, #f57c00);
  color: white;
}

.ability-unimplemented-badge.unimplemented-low {
  background: linear-gradient(135deg, #2196f3, #1976d2);
  color: white;
}

/* Game over modal */
.game-over {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  border-radius: 16px;
  padding: 40px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  z-index: 2000;
  animation: slideUp 0.3s ease;
}

.game-over h2 {
  color: #333;
  margin-bottom: 20px;
  font-size: 2em;
}

.winner-announcement {
  margin-bottom: 30px;
  font-size: 18px;
  color: #666;
}

.game-over button {
  padding: 12px 24px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.game-over button:hover {
  background: #0056b3;
}

.effect-status-icon {
  font-size: 14px;
  margin-left: 8px;
  cursor: pointer;
  user-select: none;
  transition: transform 0.2s ease;
}

.effect-status-icon:hover {
  transform: scale(1.2);
}

.ability-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
</style>
