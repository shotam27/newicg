<template>
  <div class="game-container">
    <!-- 接続状態表示 -->
    <ConnectionStatus :is-connected="isConnected" />

    <!-- ゲーム開始前 -->
    <Lobby
      v-if="gameState === 'waiting'"
      :is-matching="isMatching"
      @join-game="joinGame"
      @cancel-matching="cancelMatching"
    />

    <!-- ゲーム中 -->
    <GameBoard
      v-else-if="gameState === 'playing'"
      :current-turn="currentTurn"
      :current-phase="currentPhase"
      :player-name="playerName"
      :player-i-p="playerIP"
      :opponent-name="opponentName"
      :opponent-i-p="opponentIP"
      :player-field="playerField"
      :opponent-field="opponentField"
      :neutral-field="neutralField"
      :selected-card="selectedCard"
      :is-my-turn="isMyTurn"
      @card-click="showCardOptionsMenu"
      @card-detail="showCardDetail"
      @use-ability="useAbility"
      @place-bid="placeBid"
      @pass-turn="passTurn"
      @end-turn="endTurn"
    />

    <!-- 各種モーダル -->
    <GameModals
      :show-match-result="showMatchResult"
      :opponent-name="opponentName"
      :show-auction-result="showAuctionResult"
      :auction-result-data="auctionResultData"
      :player-name="playerName"
      :show-turn-phase-notification="showTurnPhaseNotification"
      :turn-phase-notification-message="turnPhaseNotificationMessage"
      :current-turn="currentTurn"
      :current-phase="currentPhase"
      :show-target-selection="showTargetSelection"
      :target-selection-message="targetSelectionMessage"
      :valid-targets="validTargets"
      :show-card-options="showCardOptions"
      :selected-card-for-options="selectedCardForOptions"
      :detail-card="detailCard"
      :game-state="gameState"
      :winner="winner"
      @close-auction-result="closeAuctionResult"
      @select-target="selectTarget"
      @cancel-target-selection="cancelTargetSelection"
      @hide-card-options="hideCardOptionsMenu"
      @show-detail="showDetailFromOptions"
      @select-for-bid="selectForBid"
      @hide-card-detail="hideCardDetail"
      @reset-game="resetGame"
    />

    <!-- メッセージログ -->
    <MessageLog
      :messages="messages"
      :is-minimized="isMessageLogMinimized"
      @toggle-log="toggleMessageLog"
    />
  </div>
</template>

<script>
import { io } from "socket.io-client";
import ConnectionStatus from "./components/ConnectionStatus.vue";
import Lobby from "./components/Lobby.vue";
import GameBoard from "./components/GameBoard.vue";
import GameModals from "./components/GameModals.vue";
import MessageLog from "./components/MessageLog.vue";

export default {
  name: "App",
  components: {
    ConnectionStatus,
    Lobby,
    GameBoard,
    GameModals,
    MessageLog,
  },
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

      // 勝者
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
        this.addMessage("サーバーに接続しました", "info");
      });

      this.socket.on("disconnect", () => {
        this.isConnected = false;
        this.addMessage("サーバーから切断されました", "warning");
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

      // 反応効果発動の通知
      this.socket.on("reaction-triggered", (data) => {
        console.log("反応効果発動", data);
        this.addMessage(
          `${data.player}の${data.cardName}が反応！${data.result}（${data.trigger}に対して）`,
          "reaction"
        );
      });

      // 未実装効果の通知
      this.socket.on("unimplemented-effect", (data) => {
        console.warn("🚧 未実装効果が使用されました:", data);
        this.addMessage(
          `⚠️ ${data.player}の${data.cardName}: 未実装効果（${data.unimplementedInfo.feature}、優先度: ${data.unimplementedInfo.priority})`,
          "warning"
        );
        this.addMessage(`📝 理由: ${data.unimplementedInfo.reason}`, "info");
      });
    },

    joinGame(playerName) {
      this.playerName = playerName;
      this.isMatching = true;
      this.socket.emit("joinGame", { playerName: this.playerName });
      this.addMessage("マッチング開始..", "info");
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
        "ゲーム状態:",
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
          instanceId: card.instanceId || card.fieldId, // instanceIdまたはfieldIdを使用
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
              instanceId: card.instanceId || card.fieldId, // instanceIdまたはfieldIdを使用
            })
          );
          this.opponentName = state.players[opponentId].name || "対戦相手";
          this.opponentIP = state.players[opponentId].ip || 10;

          // 初回マッチング時にマッチング完了画面を表示
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

    placeBid(data) {
      const { selectedCard, bidAmount } = data;
      if (selectedCard && bidAmount > 0) {
        console.log("入札開始", {
          cardId: selectedCard.fieldId || selectedCard.instanceId,
          amount: bidAmount,
          selectedCard: selectedCard,
        });

        this.socket.emit("placeBid", {
          cardId: selectedCard.fieldId || selectedCard.instanceId,
          amount: bidAmount,
        });
        this.addMessage(`${selectedCard.name}に${bidAmount}IP入札`, "info");
      } else {
        console.log("入札失敗", {
          selectedCard: selectedCard,
          bidAmount: bidAmount,
        });
      }
    },

    useAbility(card, ability) {
      // プレイングフェーズで自分のターンでのみ使用可能
      if (this.currentPhase !== "playing" || !this.isMyTurn) {
        this.addMessage("現在はアビリティを使用できません", "warning");
        return;
      }

      console.log("=== useAbility 呼び出し ===");
      console.log("カード情報:", card);
      console.log("card.instanceId:", card.instanceId);
      console.log("card.fieldId:", card.fieldId);
      console.log("ability:", ability);

      const cardCount = this.getCardCount(card.id);
      if (cardCount >= ability.cost && !card.isFatigued) {
        console.log("アビリティ使用:", {
          card: card.name,
          ability: ability.description,
          instanceId: card.instanceId,
          fieldId: card.fieldId,
        });

        const payload = {
          cardInstanceId: card.instanceId,
          abilityIndex: card.abilities.indexOf(ability),
        };
        console.log("サーバーに送信するpayload:", payload);

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
        this.hideCardOptionsMenu();
      }
    },

    endTurn() {
      this.socket.emit("endTurn");
    },

    passTurn() {
      console.log("=== passTurn 呼び出し ===");
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
      console.log("selectTarget呼び出し", {
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

      // オークション結果が表示されている間は表示しない
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

      // メッセージログにも追加
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

      // 5秒後に自動で閉じる
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

      // 保留中のフェーズ通知がある場合は表示する
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
        }, 500); // 少し遅延してスムーズに表示
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

<style>
/* Import global styles */
@import url("./styles/global.css");
@import url("./styles/unimplemented.css");

.game-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}
</style>
