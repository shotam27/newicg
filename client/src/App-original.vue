<template>
  <div class="game-container">
    <!-- 接続状態表示 -->
    <div class="connection-status" :class="{ connected: isConnected }">
      {{ isConnected ? "接続中" : "切断中" }}
    </div>

    <!-- ゲーム開始前 -->
    <div v-if="gameState === 'waiting'" class="lobby">
      <div class="lobby-content">
        <h1>🎴 ICG カードゲーム</h1>
        <p>オークション型対戦カードゲーム</p>

        <!-- マッチング中の表示 -->
        <div v-if="isMatching" class="matching-status">
          <div class="matching-spinner"></div>
          <h2>マッチング中...</h2>
          <p>対戦相手を探しています。少々お待ちください。</p>
          <button @click="cancelMatching" class="cancel-btn">キャンセル</button>
        </div>

        <!-- 通常のログイン画面 -->
        <div v-else class="join-form">
          <input
            v-model="playerName"
            placeholder="プレイヤー名を入力"
            @keyup.enter="joinGame"
            maxlength="20"
          />
          <button @click="joinGame" :disabled="!playerName.trim()">
            ゲームに参加
          </button>
        </div>

        <div class="game-info">
          <h3>ゲームルール</h3>
          <ul>
            <li>オークション形式でカードを獲得</li>
            <li>カードのアビリティを使って戦略的にプレイ</li>
            <li>所持カード枚数がアビリティコストに影響</li>
            <li>様々な勝利条件を目指そう</li>
          </ul>
        </div>
      </div>
    </div>

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

    <!-- ゲーム中 -->
    <div v-else-if="gameState === 'playing'" class="game-board">
      <!-- ターン情報 -->
      <div class="turn-info">
        <div class="turn-display">
          <span class="turn-label">ターン {{ currentTurn }}</span>
          <span class="phase-label">{{ currentPhase }}</span>
        </div>
        <div class="players-info">
          <div class="player-info">
            <span class="player-name">{{ playerName }}</span>
            <span class="ip-display">IP: {{ playerIP }}</span>
          </div>
          <div v-if="opponentName" class="opponent-info">
            <span class="vs-label">vs</span>
            <span class="opponent-name">{{ opponentName }}</span>
            <span class="opponent-ip">IP: {{ opponentIP }}</span>
          </div>
        </div>
      </div>

      <!-- 相手のフィールド -->
      <div class="opponent-field field-container">
        <h3>{{ opponentName || "相手" }}のフィールド</h3>
        <div class="card-grid">
          <div
            v-for="card in opponentField"
            :key="card.id + '-' + card.instanceId"
            class="card"
            :class="{ fatigued: card.isFatigued }"
            @click="showCardOptionsMenu(card)"
          >
            <div class="card-name">{{ card.name }}</div>
            <div v-if="card.traits" class="card-traits">
              {{ card.traits.join(", ") }}
            </div>
            <div v-if="card.isFatigued" class="fatigue-counter">疲労中</div>
            <!-- 未実装効果バッジ -->
            <div
              v-if="checkUnimplementedEffects(card)"
              class="unimplemented-badge"
              :class="checkUnimplementedEffects(card).class"
              :title="
                '未実装効果あり(優先度: ' +
                checkUnimplementedEffects(card).priority +
                ')'
              "
            >
              {{ checkUnimplementedEffects(card).icon }}
            </div>
          </div>
        </div>
      </div>

      <!-- 中立フィールド -->
      <div class="neutral-field field-container">
        <h3>中立フィールド</h3>
        <div class="card-grid">
          <div
            v-for="card in neutralField"
            :key="card.id + '-' + card.instanceId"
            class="card neutral-card"
            :class="{
              fatigued: card.isFatigued,
              selected: selectedCard?.instanceId === card.instanceId,
            }"
            @click="showCardOptionsMenu(card)"
            @contextmenu.prevent="showCardDetail(card)"
          >
            <div class="card-name">{{ card.name }}</div>
            <div v-if="card.traits" class="card-traits">
              {{ card.traits.join(", ") }}
            </div>
            <div v-if="card.isFatigued" class="fatigue-counter">疲労中</div>
            <!-- 未実装効果バッジ -->
            <div
              v-if="checkUnimplementedEffects(card)"
              class="unimplemented-badge"
              :class="checkUnimplementedEffects(card).class"
              :title="
                '未実装効果あり(優先度: ' +
                checkUnimplementedEffects(card).priority +
                ')'
              "
            >
              {{ checkUnimplementedEffects(card).icon }}
            </div>
          </div>
        </div>
      </div>

      <!-- オークションパネル -->
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
              @click="placeBid"
              :disabled="!selectedCard || bidAmount <= 0"
            >
              入札
            </button>
          </div>
        </div>
      </div>

      <!-- 自分のフィールド -->
      <div class="player-field field-container">
        <h3>自分のフィールド</h3>
        <div class="card-grid">
          <div
            v-for="card in playerField"
            :key="card.id + '-' + card.instanceId"
            class="card player-card"
            :class="{ fatigued: card.isFatigued }"
            @click="showCardOptionsMenu(card)"
            @contextmenu.prevent="showCardDetail(card)"
          >
            <div class="card-name">{{ card.name }}</div>
            <div v-if="card.traits" class="card-traits">
              {{ card.traits.join(", ") }}
            </div>
            <div class="card-count">所持: {{ getCardCount(card.id) }}</div>
            <div v-if="card.isFatigued" class="fatigue-counter">疲労中</div>
            <!-- 未実装効果バッジ -->
            <div
              v-if="checkUnimplementedEffects(card)"
              class="unimplemented-badge"
              :class="checkUnimplementedEffects(card).class"
              :title="
                '未実装効果あり(優先度: ' +
                checkUnimplementedEffects(card).priority +
                ')'
              "
            >
              {{ checkUnimplementedEffects(card).icon }}
            </div>

            <!-- アビリティボタン -->
            <div class="abilities">
              <button
                v-for="(ability, index) in card.abilities"
                :key="index"
                class="ability-btn"
                :class="{
                  'has-unimplemented': checkAbilityUnimplemented(ability),
                }"
                :disabled="
                  getCardCount(card.id) < ability.cost ||
                  card.isFatigued ||
                  currentPhase !== 'playing' ||
                  !isMyTurn
                "
                @click.stop="useAbility(card, ability)"
              >
                <span class="ability-text"
                  >{{ ability.type }} ({{ ability.cost }})</span
                >
                <!-- アビリティボタンの未実装タグ -->
                <div
                  v-if="checkAbilityUnimplemented(ability)"
                  class="ability-btn-badge"
                  :class="checkAbilityUnimplemented(ability).class"
                  :title="
                    '未実装効果(優先度: ' +
                    checkAbilityUnimplemented(ability).priority +
                    ')'
                  "
                >
                  {{ checkAbilityUnimplemented(ability).icon }}
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- アクションボタン -->
      <div class="action-buttons">
        <!-- プレイングフェーズの場合 -->
        <div v-if="currentPhase === 'playing'" class="playing-actions">
          <div class="turn-status">
            <span v-if="isMyTurn" class="current-turn">あなたのターン</span>
            <span v-else class="waiting-turn">相手のターン</span>
          </div>
          <button @click="passTurn" :disabled="!isMyTurn" class="pass-btn">
            ターンパス
          </button>
        </div>
        <!-- その他のフェーズの場合 -->
        <div v-else class="other-actions">
          <button @click="endTurn" :disabled="currentPhase !== 'main'">
            ターン終了
          </button>
        </div>
      </div>
    </div>

    <!-- カード選択オプションメニュー -->
    <div
      v-if="showCardOptions"
      class="card-options-modal"
      @click="hideCardOptionsMenu"
    >
      <div class="card-options-content" @click.stop>
        <div class="card-options-header">
          <h4>{{ selectedCardForOptions?.name }}</h4>
          <button class="close-btn" @click="hideCardOptionsMenu">×</button>
        </div>
        <div class="card-options-body">
          <button class="option-btn detail-btn" @click="showDetailFromOptions">
            📋 詳細
          </button>
          <button class="option-btn cancel-btn" @click="hideCardOptionsMenu">
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
            @click="selectForBid"
          >
            💰 入札
          </button>
        </div>
      </div>
    </div>

    <!-- カード詳細モーダル -->
    <div v-if="detailCard" class="card-detail-modal" @click="hideCardDetail">
      <div class="card-detail-content" @click.stop>
        <div class="card-detail-header">
          <h3>{{ detailCard.name }}</h3>
          <button class="close-btn" @click="hideCardDetail">×</button>
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
    <div v-else-if="gameState === 'finished'" class="game-over">
      <h2>ゲーム終了</h2>
      <div class="winner-announcement">
        <p v-if="winner">勝者: {{ winner }}</p>
        <p v-else>引き分け</p>
      </div>
      <button @click="resetGame">新しいゲーム</button>
    </div>

    <!-- オークション結果表示 -->
    <div v-if="showAuctionResult" class="auction-result-overlay">
      <div class="auction-result-content">
        <div class="auction-result-header">
          <h2>🎯 オークション結果</h2>
          <button @click="closeAuctionResult" class="close-btn">×</button>
        </div>
        <div class="auction-result-body" v-if="auctionResultData">
          <div class="auction-card-info" v-if="auctionResultData.cardInfo">
            <div class="card-image">🎴</div>
            <h3>{{ auctionResultData.cardInfo?.name || "カード" }}</h3>
            <div class="card-details">
              <span class="card-type">{{
                auctionResultData.cardInfo?.type || "カード"
              }}</span>
              <span
                class="card-cost"
                v-if="auctionResultData.cardInfo?.manaCost"
              >
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
                <div class="bid-amount">
                  {{ auctionResultData.playerBid }}IP
                </div>
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
              �引き分け - カードは中立フィールドに残ります
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ターン/フェーズ変更通知 -->
    <div
      v-if="showTurnPhaseNotification"
      class="turn-phase-notification-overlay"
    >
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
      @click="cancelTargetSelection"
    >
      <div class="target-selection-content" @click.stop>
        <div class="target-selection-header">
          <h3>対象を選択してください</h3>
          <button class="close-btn" @click="cancelTargetSelection">×</button>
        </div>
        <div class="target-selection-body">
          <p class="target-message">{{ targetSelectionMessage }}</p>
          <div class="target-cards">
            <div
              v-for="target in validTargets"
              :key="target.fieldId"
              class="target-card"
              :class="{ fatigued: target.isFatigued }"
              @click="selectTarget(target.fieldId)"
              @mouseenter="console.log('カードのホバー:', target.name)"
              @mouseleave="console.log('カードのホバー終了', target.name)"
            >
              <div class="target-card-name">{{ target.name }}</div>
              <div v-if="target.isFatigued" class="target-fatigue">疲労中</div>
            </div>
          </div>
          <div class="target-actions">
            <button class="cancel-target-btn" @click="cancelTargetSelection">
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- メッセージログ -->
    <div class="message-log" :class="{ minimized: isMessageLogMinimized }">
      <div class="message-header" @click="toggleMessageLog">
        <span>メッセージ</span>
        <button
          class="minimize-btn"
          :class="{ rotated: isMessageLogMinimized }"
        >
          ▼
        </button>
      </div>
      <div class="messages" v-show="!isMessageLogMinimized">
        <div
          v-for="(message, index) in messages"
          :key="index"
          class="message"
          :class="message.type"
        >
          {{ message.text }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { io } from "socket.io-client";

export default {
  name: "App",
  data() {
    return {
      socket: null,
      isConnected: false,
      gameState: "waiting", // waiting, matching, playing, finished
      isMatching: false,
      playerName: "",
      playerId: "",
      playerIP: 10,
      currentTurn: 1,
      currentPhase: "auction", // auction, playing
      currentPlayer: "", // 現在のプレイヤー名

      // フィールド
      playerField: [],
      opponentField: [],
      neutralField: [],
      opponentName: "", // 対戦相手の名前
      opponentIP: 10, // 対戦相手のポイント

      // オークション
      selectedCard: null,
      bidAmount: 0,

      // オークション結果表示
      showAuctionResult: false,
      auctionResultData: null,
      auctionResultTimer: null,

      // カード詳細表示
      detailCard: null, // 詳細表示中のカード

      // マッチング完了画面
      showMatchResult: false,
      matchResultTimer: null,

      // カード選択オプション
      showCardOptions: false,
      selectedCardForOptions: null,

      // 対象選択
      showTargetSelection: false,
      targetSelectionMessage: "",
      validTargets: [],
      pendingAbility: null,

      // メッセージ
      messages: [],
      isMessageLogMinimized: false,

      // ターン/フェーズ変更通知
      showTurnPhaseNotification: false,
      turnPhaseNotificationMessage: "",
      turnPhaseNotificationTimer: null,
      pendingTurnPhaseNotification: false,

      // 前回のターン/フェーズを記録
      previousTurn: 1,
      previousPhase: "auction",

      // 勝老E
      winner: null,
    };
  },

  mounted() {
    this.initializeSocket();
  },

  computed: {
    isMyTurn() {
      return this.currentPlayer === this.playerName;
    },
  },

  methods: {
    initializeSocket() {
      this.socket = io("http://localhost:3001");

      this.socket.on("connect", () => {
        this.isConnected = true;
        this.addMessage("サーバ�Eに接続しました", "info");
      });

      this.socket.on("disconnect", () => {
        this.isConnected = false;
        this.addMessage("サーバ�Eから刁E��されました", "warning");
      });

      this.socket.on("gameState", (state) => {
        this.updateGameState(state);
      });

      this.socket.on("waiting-for-opponent", () => {
        this.isMatching = true;
        this.addMessage("対戦相手を探しています..", "info");
      });

      this.socket.on("message", (message) => {
        this.addMessage(message.text, message.type || "info");
      });

      this.socket.on("auction-result", (data) => {
        console.log("オークション結果受信:", data);
        this.showAuctionResultModal(data);
      });

      this.socket.on("gameEnd", (data) => {
        this.gameState = "finished";
        this.winner = data.winner;
        this.addMessage(`ゲーム終了 ${data.winner || "引き分け"}`, "success");
      });

      this.socket.on("select-target", (data) => {
        console.log("select-targetイベント受信:", data);
        console.log("受信したability:", data.ability);
        this.showTargetSelection = true;
        this.targetSelectionMessage = data.message;
        this.validTargets = data.validTargets;
        this.pendingAbility = data.ability;
        console.log("pendingAbilityに設定", this.pendingAbility);
        console.log("対象選択UI表示:", {
          showTargetSelection: this.showTargetSelection,
          validTargets: this.validTargets,
        });
        this.addMessage(data.message, "info");
      });

      this.socket.on("no-valid-targets", (data) => {
        this.addMessage(data.message, "warning");
      });

      // 反応効果発動�E通知
      this.socket.on("reaction-triggered", (data) => {
        console.log("反応効果発勁E", data);
        this.addMessage(
          `${data.player}の${data.cardName}が反応！E{data.result}�E�E{data.trigger}に対して�E�`,
          "reaction"
        );
      });

      // 未実裁E��果�E通知
      this.socket.on("unimplemented-effect", (data) => {
        console.warn("🚧 未実裁E��果が使用されました:", data);
        this.addMessage(
          `⚠�E�E${data.player}の${data.cardName}: 未実裁E��果、E{data.unimplementedInfo.feature}、E優先度: ${data.unimplementedInfo.priority})`,
          "warning"
        );
        this.addMessage(`📝 理由: ${data.unimplementedInfo.reason}`, "info");
      });
    },

    joinGame() {
      if (this.playerName.trim()) {
        this.isMatching = true;
        this.socket.emit("joinGame", { playerName: this.playerName });
        this.addMessage("マッチング開始..", "info");
      }
    },

    updateGameState(state) {
      console.log("ゲーム状態更新:", state);

      // ターン/フェーズ変更を検知
      const turnChanged = this.currentTurn !== state.turn;
      const phaseChanged = this.currentPhase !== state.phase;

      if ((turnChanged || phaseChanged) && state.status === "playing") {
        this.showTurnPhaseChangeNotification(
          state.turn,
          state.phase,
          turnChanged,
          phaseChanged
        );
      }

      this.gameState = state.status;
      this.currentTurn = state.turn;
      this.currentPhase = state.phase;
      this.currentPlayer = state.currentPlayer || ""; // 現在のプレイヤーを更新

      console.log(
        "現在のフェーズ:",
        this.currentPhase,
        "ゲーム状慁E",
        this.gameState,
        "現在のプレイヤー:",
        this.currentPlayer
      );

      // ゲームが開始されたらマッチング状態を解除
      if (state.status === "playing") {
        this.isMatching = false;
      }

      if (state.players && state.players[this.socket.id]) {
        const playerData = state.players[this.socket.id];
        this.playerId = this.socket.id;
        this.playerIP = playerData.ip;
        this.playerField = (playerData.field || []).map((card) => ({
          ...card,
          instanceId: card.instanceId || card.fieldId, // instanceIdまた�EfieldIdを使用
        }));

        // 相手のフィールドを取得
        const opponentId = Object.keys(state.players).find(
          (id) => id !== this.socket.id
        );
        if (opponentId) {
          const wasFirstMatch = !this.opponentName; // 初回マッチングかチェック
          this.opponentField = (state.players[opponentId].field || []).map(
            (card) => ({
              ...card,
              instanceId: card.instanceId || card.fieldId, // instanceIdまた�EfieldIdを使用
            })
          );
          this.opponentName = state.players[opponentId].name || "対戦相手";
          this.opponentIP = state.players[opponentId].ip || 10;

          // 初回マッチング時にマッチング完亁E��面を表示
          if (wasFirstMatch && state.status === "playing") {
            this.showMatchingComplete();
          }
        }
      }

      if (state.neutralField) {
        this.neutralField = state.neutralField.map((card) => ({
          ...card,
          instanceId: card.fieldId, // fieldIdをinstanceIdとしても使用
        }));
      }
    },

    selectCard(card) {
      if (this.currentPhase === "auction" && !card.fatigued) {
        this.selectedCard = card;
        this.bidAmount = 1;
      }
    },

    selectPlayerCard(card) {
      this.addMessage(`${card.name}を選択しました`, "info");
    },

    placeBid() {
      if (this.selectedCard && this.bidAmount > 0) {
        console.log("入札開姁E", {
          cardId: this.selectedCard.fieldId || this.selectedCard.instanceId,
          amount: this.bidAmount,
          selectedCard: this.selectedCard,
        });

        this.socket.emit("placeBid", {
          cardId: this.selectedCard.fieldId || this.selectedCard.instanceId,
          amount: this.bidAmount,
        });
        this.addMessage(
          `${this.selectedCard.name}に${this.bidAmount}IP入札`,
          "info"
        );
      } else {
        console.log("入札失敁E", {
          selectedCard: this.selectedCard,
          bidAmount: this.bidAmount,
        });
      }
    },

    useAbility(card, ability) {
      // プレイングフェーズで自刁E�Eターンでのみ使用可能
      if (this.currentPhase !== "playing" || !this.isMyTurn) {
        this.addMessage("現在はアビリチE��を使用できません", "warning");
        return;
      }

      console.log("=== useAbility 呼び出ぁE===");
      console.log("カード情報:", card);
      console.log("card.instanceId:", card.instanceId);
      console.log("card.fieldId:", card.fieldId);
      console.log("ability:", ability);

      const cardCount = this.getCardCount(card.id);
      if (cardCount >= ability.cost && !card.isFatigued) {
        console.log("アビリチE��使用:", {
          card: card.name,
          ability: ability.description,
          instanceId: card.instanceId,
          fieldId: card.fieldId,
        });

        const payload = {
          cardInstanceId: card.instanceId,
          abilityIndex: card.abilities.indexOf(ability),
        };
        console.log("サーバ�Eに送信するpayload:", payload);

        this.socket.emit("useAbility", payload);
        this.addMessage(`${card.name}の${ability.type}を使用`, "info");
      } else if (card.isFatigued) {
        this.addMessage("疲労しているカードはプレイできません", "warning");
      } else {
        this.addMessage("カード枚数が不足しています", "warning");
      }
    },

    getCardCount(cardId) {
      return this.playerField.filter((card) => card.id === cardId).length;
    },

    // 未実装効果をチェックする関数
    checkUnimplementedEffects(card) {
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

    // 個別アビリティの未実装効果をチェックする関数
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

    showCardDetail(card) {
      this.detailCard = card;
    },

    hideCardDetail() {
      this.detailCard = null;
    },

    showMatchingComplete() {
      this.showMatchResult = true;
      this.matchResultTimer = setTimeout(() => {
        this.showMatchResult = false;
      }, 1000); // 1秒後に非表示
    },

    showCardOptionsMenu(card) {
      this.selectedCardForOptions = card;
      this.showCardOptions = true;
    },

    hideCardOptionsMenu() {
      this.showCardOptions = false;
      this.selectedCardForOptions = null;
    },

    showDetailFromOptions() {
      this.detailCard = this.selectedCardForOptions;
      this.hideCardOptionsMenu();
    },

    selectForBid() {
      if (this.currentPhase === "auction" && this.selectedCardForOptions) {
        this.selectedCard = this.selectedCardForOptions;
        this.bidAmount = 1;
        this.hideCardOptionsMenu();
      }
    },

    endTurn() {
      this.socket.emit("endTurn");
    },

    passTurn() {
      console.log("=== passTurn 呼び出ぁE===");
      console.log("isMyTurn:", this.isMyTurn);
      console.log("currentPhase:", this.currentPhase);
      console.log("currentPlayer:", this.currentPlayer);
      console.log("playerName:", this.playerName);

      if (this.isMyTurn && this.currentPhase === "playing") {
        console.log("パス送信中...");
        this.socket.emit("pass-turn");
        this.addMessage("ターンをパスしました", "info");
      } else {
        console.log("パス条件を満たしていません");
        if (!this.isMyTurn) {
          console.log("理由: 自分のターンではない");
        }
        if (this.currentPhase !== "playing") {
          console.log("理由: プレイングフェーズではない");
        }
      }
    },

    resetGame() {
      this.gameState = "waiting";
      this.isMatching = false;
      this.winner = null;
      this.playerField = [];
      this.opponentField = [];
      this.neutralField = [];
      this.selectedCard = null;
      this.detailCard = null;
      this.opponentName = "";
      this.opponentIP = 10;
      this.showMatchResult = false;
      this.showCardOptions = false;
      this.selectedCardForOptions = null;
      if (this.matchResultTimer) {
        clearTimeout(this.matchResultTimer);
        this.matchResultTimer = null;
      }
      if (this.turnPhaseNotificationTimer) {
        clearTimeout(this.turnPhaseNotificationTimer);
        this.turnPhaseNotificationTimer = null;
      }
      this.showTurnPhaseNotification = false;
      this.messages = [];
    },

    selectTarget(targetFieldId) {
      console.log("selectTarget呼び出ぁE", {
        targetFieldId,
        pendingAbility: this.pendingAbility,
      });
      if (this.pendingAbility) {
        this.socket.emit("target-selected", {
          ability: this.pendingAbility,
          targetFieldId: targetFieldId,
        });
        console.log("target-selectedイベント送信:", {
          ability: this.pendingAbility,
          targetFieldId,
        });
        this.cancelTargetSelection();
      } else {
        console.log("pendingAbilityがありません");
      }
    },

    cancelTargetSelection() {
      this.showTargetSelection = false;
      this.targetSelectionMessage = "";
      this.validTargets = [];
      this.pendingAbility = null;
    },

    cancelMatching() {
      this.isMatching = false;
      this.socket.emit("cancelMatching");
      this.addMessage("マッチングをキャンセルしました", "info");
    },

    addMessage(text, type = "info") {
      this.messages.push({ text, type, timestamp: Date.now() });
      if (this.messages.length > 50) {
        this.messages.shift();
      }
    },

    toggleMessageLog() {
      this.isMessageLogMinimized = !this.isMessageLogMinimized;
    },

    showTurnPhaseChangeNotification(
      newTurn,
      newPhase,
      turnChanged,
      phaseChanged
    ) {
      let message = "";

      if (turnChanged && phaseChanged) {
        message = `ターン ${newTurn} - ${this.getPhaseDisplayName(
          newPhase
        )}フェーズ開始！`;
      } else if (turnChanged) {
        message = `ターン ${newTurn} 開始！`;
      } else if (phaseChanged) {
        message = `${this.getPhaseDisplayName(newPhase)}フェーズ開始！`;
      }

      this.turnPhaseNotificationMessage = message;

      // オークション結果が表示されてぁE��間�E表示しなぁE
      if (!this.showAuctionResult) {
        this.showTurnPhaseNotification = true;

        // 3秒後に非表示
        if (this.turnPhaseNotificationTimer) {
          clearTimeout(this.turnPhaseNotificationTimer);
        }
        this.turnPhaseNotificationTimer = setTimeout(() => {
          this.showTurnPhaseNotification = false;
        }, 3000);
      } else {
        // オークション結果が閉じられた後に表示するためのフラグ
        this.pendingTurnPhaseNotification = true;
      }

      // メチE��ージログにも追加
      this.addMessage(message, "info");
    },

    getPhaseDisplayName(phase) {
      const phaseNames = {
        auction: "オークション",
        playing: "プレイング",
        "target-selection": "対象選択",
      };
      return phaseNames[phase] || phase;
    },

    showAuctionResultModal(resultData) {
      console.log("Showing auction result:", resultData);
      this.auctionResultData = resultData;
      this.showAuctionResult = true;

      // 5秒後に自動で閉じめE
      if (this.auctionResultTimer) {
        clearTimeout(this.auctionResultTimer);
      }
      this.auctionResultTimer = setTimeout(() => {
        this.showAuctionResult = false;
      }, 5000);
    },

    closeAuctionResult() {
      this.showAuctionResult = false;
      if (this.auctionResultTimer) {
        clearTimeout(this.auctionResultTimer);
      }

      // 保留中のフェーズ通知がある場合�E表示する
      if (this.pendingTurnPhaseNotification) {
        this.pendingTurnPhaseNotification = false;
        setTimeout(() => {
          this.showTurnPhaseNotification = true;

          // 3秒後に非表示
          if (this.turnPhaseNotificationTimer) {
            clearTimeout(this.turnPhaseNotificationTimer);
          }
          this.turnPhaseNotificationTimer = setTimeout(() => {
            this.showTurnPhaseNotification = false;
          }, 3000);
        }, 500); // 少し遁E��してスムーズに表示
      }
    },
  },

  beforeUnmount() {
    if (this.socket) {
      this.socket.disconnect();
    }
    if (this.matchResultTimer) {
      clearTimeout(this.matchResultTimer);
    }
    if (this.turnPhaseNotificationTimer) {
      clearTimeout(this.turnPhaseNotificationTimer);
    }
  },
};
</script>

<style scoped>
.game-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

.connection-status {
  position: fixed;
  top: 10px;
  right: 10px;
  padding: 5px 10px;
  border-radius: 4px;
  background: #ff4444;
  color: white;
  font-size: 12px;
}

.connection-status.connected {
  background: #44ff44;
  color: #000;
}

.lobby {
  text-align: center;
  padding: 40px;
}

.lobby-content h1 {
  font-size: 2.5em;
  margin-bottom: 10px;
  color: #333;
}

.join-form {
  margin: 30px 0;
}

.join-form input {
  padding: 10px;
  font-size: 16px;
  border: 2px solid #ddd;
  border-radius: 4px;
  margin-right: 10px;
  width: 200px;
}

.join-form button {
  padding: 10px 20px;
  font-size: 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.join-form button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.matching-status {
  text-align: center;
  padding: 40px;
  background: #e3f2fd;
  border-radius: 12px;
  margin: 30px 0;
  border: 2px solid #2196f3;
}

.matching-status h2 {
  color: #1976d2;
  margin: 20px 0 10px 0;
  font-size: 1.8em;
}

.matching-status p {
  color: #1976d2;
  font-size: 1.1em;
  margin-bottom: 30px;
}

.matching-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #e3f2fd;
  border-top: 4px solid #2196f3;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.cancel-btn {
  padding: 10px 20px;
  font-size: 16px;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.cancel-btn:hover {
  background: #d32f2f;
}

.game-info {
  max-width: 600px;
  margin: 0 auto;
  text-align: left;
  background: #f5f5f5;
  padding: 20px;
  border-radius: 8px;
}

.game-info ul {
  list-style-type: disc;
  padding-left: 20px;
}

.turn-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
  color: white;
  padding: 20px;
  margin-bottom: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.turn-display {
  font-weight: bold;
  font-size: 20px;
  display: flex;
  align-items: center;
  gap: 15px;
}

.turn-label {
  background: rgba(255, 255, 255, 0.2);
  padding: 8px 16px;
  border-radius: 20px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.phase-label {
  padding: 8px 16px;
  background: #ff9800;
  color: white;
  border-radius: 20px;
  font-size: 16px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  box-shadow: 0 2px 8px rgba(255, 152, 0, 0.4);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 2px 8px rgba(255, 152, 0, 0.4);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 4px 16px rgba(255, 152, 0, 0.6);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 2px 8px rgba(255, 152, 0, 0.4);
  }
}

.player-info {
  font-size: 16px;
  color: white;
  display: flex;
  align-items: center;
  gap: 12px;
}

.player-name {
  font-weight: 600;
}

.ip-display {
  padding: 6px 12px;
  background: #4caf50;
  color: white;
  border-radius: 15px;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(76, 175, 80, 0.3);
}

.opponent-field,
.neutral-field,
.player-field {
  margin-bottom: 30px;
}

.opponent-field h3,
.neutral-field h3,
.player-field h3 {
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
  position: relative; /* 未実裁E��チE��の位置決め�Eため */
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

/* 未実裁E��果バチE�� */
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

/* アビリチE��詳細の未実裁E��チE�� */
.ability-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
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

/* アビリチE��ボタンの未実裁E��チE�� */
.ability-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.ability-btn.has-unimplemented {
  border: 2px solid #ff9800;
  box-shadow: 0 0 8px rgba(255, 152, 0, 0.3);
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

/* オークションパネルの未実裁E��チE�� */
.ability {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
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

/* メチE��ージログのスタイル */
.message-log {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 350px;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  transition: all 0.3s ease;
}

.message-log.minimized {
  height: 50px;
  overflow: hidden;
}

.message-header {
  padding: 12px 16px;
  background: linear-gradient(135deg, #6c5ce7, #a29bfe);
  color: white;
  font-weight: 600;
  border-radius: 10px 10px 0 0;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}

.message-header:hover {
  background: linear-gradient(135deg, #5f4fcf, #9187fc);
}

.toggle-icon {
  font-size: 18px;
  transition: transform 0.3s ease;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

.messages {
  max-height: 400px;
  overflow-y: auto;
  padding: 8px;
}

.message {
  padding: 8px 12px;
  margin: 4px 0;
  border-radius: 6px;
  font-size: 14px;
  border-left: 4px solid transparent;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.message.info {
  background: #e3f2fd;
  color: #1976d2;
  border-left-color: #2196f3;
}

.message.warning {
  background: #fff3e0;
  color: #e65100;
  border-left-color: #ff9800;
  font-weight: 500;
}

.message.success {
  background: #e8f5e8;
  color: #2e7d32;
  border-left-color: #4caf50;
}

.message.error {
  background: #ffebee;
  color: #c62828;
  border-left-color: #f44336;
}

.message.reaction {
  background: #f3e5f5;
  color: #7b1fa2;
  border-left-color: #9c27b0;
  font-weight: 500;
}

/* メチE��ージログのスクロールバ�E */
.messages::-webkit-scrollbar {
  width: 6px;
}

.messages::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.messages::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.messages::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* カードオプションメニューのスタイル */
.card-options-modal {
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

/* カード詳細モーダルのスタイル */
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
</style>
