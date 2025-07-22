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
      :player-i-p-increase="playerIPIncrease"
      :opponent-name="opponentName"
      :opponent-i-p="opponentIP"
      :opponent-i-p-increase="opponentIPIncrease"
      :player-field="playerField"
      :opponent-field="opponentField"
      :neutral-field="neutralField"
      :exile-field="exileField"
      :selected-card="selectedCard"
      :show-auction-modal="showAuctionModal"
      :is-my-turn="isMyTurn"
      :socket="socket"
      :debug-game-state="debugGameState"
      :card-effect-states="cardEffectStates"
      :available-victory-effects="availableVictoryEffects"
      :player-id="playerId"
      @card-click="showCardOptionsMenu"
      @card-detail="showCardDetail"
      @use-ability="useAbility"
      @place-bid="placeBid"
      @debug-acquire="debugAcquire"
      @debug-set-ip="debugSetIP"
      @close-auction="closeAuction"
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
      :show-multiple-target-selection="showMultipleTargetSelection"
      :multiple-target-selection-message="multipleTargetSelectionMessage"
      :multiple-selection-targets="multipleSelectionTargets"
      :show-reaction-selection="showReactionSelection"
      :reaction-selection-message="reactionSelectionMessage"
      :valid-reaction-cards="validReactionCards"
      :show-card-options="showCardOptions"
      :selected-card-for-options="selectedCardForOptions"
      :detail-card="detailCard"
      :game-state="gameState"
      :winner="winner"
      :show-bid-completed="showBidCompleted"
      :bid-completed-data="bidCompletedData"
      @close-auction-result="closeAuctionResult"
      @select-target="selectTarget"
      @cancel-target-selection="cancelTargetSelection"
      @select-multiple-targets="selectMultipleTargets"
      @cancel-multiple-target-selection="cancelMultipleTargetSelection"
      @select-reaction-card="selectReactionCard"
      @cancel-reaction-selection="cancelReactionSelection"
      @hide-card-options="hideCardOptionsMenu"
      @show-detail="showDetailFromOptions"
      @select-for-bid="selectForBid"
      @hide-card-detail="hideCardDetail"
      @reset-game="resetGame"
      @close-bid-completed="closeBidCompleted"
    />

    <!-- メッセージログ -->
    <MessageLog
      :messages="messages"
      :is-minimized="isMessageLogMinimized"
      @toggle-log="toggleMessageLog"
    />

    <!-- IPアニメーション表示 -->
    <div v-if="ipAnimation.show" class="ip-animation" :class="ipAnimation.type">
      {{ ipAnimation.type === "gain" ? "+" : "-" }}{{ ipAnimation.amount }}IP
    </div>

    <!-- デバッグボタン -->
    <button
      v-if="gameState === 'playing'"
      class="debug-toggle-button"
      @click="toggleDebugPanel"
    >
      🔧
    </button>

    <!-- デバッグパネルモーダル -->
    <div
      v-if="showDebugPanel"
      class="debug-modal-overlay"
      @click="closeDebugPanel"
    >
      <div class="debug-modal-content" @click.stop>
        <button class="debug-close-button" @click="closeDebugPanel">×</button>
        <DebugPanel
          :debug-game-state="debugGameState"
          :card-effect-states="cardEffectStates"
          :available-victory-effects="availableVictoryEffects"
          :player-id="playerId"
        />
      </div>
    </div>

    <!-- モバイル UI 強化 -->
    <MobileUIEnhancements
      :debug-mode="true"
      @toggle-debug="toggleDebugPanel"
      @show-game-info="showGameInfo"
      @show-help="showHelp"
      @card-preview="handleCardPreview"
      @swipe-action="handleSwipeAction"
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
import DebugPanel from "./components/DebugPanel.vue";
import MobileUIEnhancements from "./components/MobileUIEnhancements.vue";

export default {
  name: "App",
  components: {
    ConnectionStatus,
    Lobby,
    GameBoard,
    GameModals,
    MessageLog,
    DebugPanel,
    MobileUIEnhancements,
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
      playerIPIncrease: 10, // 毎ターンの増加IP
      currentTurn: 1,
      currentPhase: "auction", // auction, playing
      currentPlayer: "", // 現在のプレイヤー名

      // フィールド
      playerField: [],
      opponentField: [],
      neutralField: [],
      exileField: [],
      opponentName: "", // 対戦相手の名前
      opponentIP: 10, // 対戦相手のポイント
      opponentIPIncrease: 10, // 対戦相手の増加IP

      // オークション
      selectedCard: null,
      showAuctionModal: false, // オークションモーダル表示状態
      showBidCompleted: false, // 入札完了状態表示
      bidCompletedData: null, // 入札完了データ

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

      // 複数対象選択
      showMultipleTargetSelection: false,
      multipleTargetSelectionMessage: "",
      multipleSelectionTargets: [],

      // 反応カード選択
      showReactionSelection: false,
      reactionSelectionMessage: "",
      validReactionCards: [],

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

      // カード効果状態
      cardEffectStates: {
        invasionCounts: {},
      },

      // 勝利効果の状態管理
      availableVictoryEffects: [], // 使用可能な勝利効果のリスト

      // IPアニメーション
      ipAnimation: {
        show: false,
        amount: 0,
        type: "gain", // 'gain' or 'loss'
      },

      // デバッグ用ゲーム状態
      debugGameState: {},

      // デバッグパネルの表示状態
      showDebugPanel: false,
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
      // 本番環境では同じホストを使用、開発環境ではlocalhost:3001
      const socketUrl =
        process.env.NODE_ENV === "production"
          ? window.location.origin
          : "http://localhost:3001";

      console.log("Socket.IO connecting to:", socketUrl);
      this.socket = io(socketUrl);

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

      this.socket.on("select-multiple-targets", (data) => {
        console.log("select-multiple-targetsイベント受信:", data);
        this.showMultipleTargetSelection = true;
        this.multipleTargetSelectionMessage = data.message;
        this.multipleSelectionTargets = data.selectionTargets;
        console.log("複数対象選択UI表示:", {
          showMultipleTargetSelection: this.showMultipleTargetSelection,
          multipleSelectionTargets: this.multipleSelectionTargets,
        });
        this.addMessage(data.message, "info");
      });

      this.socket.on("no-valid-targets", (data) => {
        this.addMessage(data.message, "warning");
      });

      // 対象選択キャンセル通知
      this.socket.on("target-selection-cancelled", (data) => {
        console.log("target-selection-cancelledイベント受信:", data);
        this.addMessage(data.message, "info");
      });

      // 複数対象選択キャンセル通知
      this.socket.on("multiple-target-selection-cancelled", (data) => {
        console.log("multiple-target-selection-cancelledイベント受信:", data);
        this.addMessage(data.message, "info");
      });

      // 反応カード選択の通知
      this.socket.on("select-reaction-card", (data) => {
        console.log("select-reaction-cardイベント受信:", data);
        this.showReactionSelection = true;
        this.reactionSelectionMessage = data.message;
        this.validReactionCards = data.validTargets;
        this.addMessage(data.message, "info");
      });

      // 反応効果発動の通知
      this.socket.on("reaction-triggered", (data) => {
        console.log("反応効果発動", data);
        this.addMessage(
          `${data.player}の${data.cardName}が反応！${data.result}（${data.trigger}に対して）`,
          "reaction"
        );
      });

      // 敵ターン開始時効果など、汎用的な対象選択の要求
      this.socket.on("request-target-selection", (data) => {
        console.log("🎯 request-target-selectionイベント受信:", data);
        console.log("対象選択UI表示開始...");

        this.showTargetSelection = true;
        this.targetSelectionMessage = data.message;
        this.validTargets = data.validTargets;
        this.pendingAbility = {
          cardName: data.cardName,
          abilityDescription: data.abilityDescription,
          type: "enemyTurnStart", // 敵ターン開始時効果
        };

        console.log("対象選択状態設定完了:", {
          showTargetSelection: this.showTargetSelection,
          validTargetsCount: this.validTargets?.length,
          pendingAbility: this.pendingAbility,
        });

        this.addMessage(data.message, "info");
      });

      // カード効果状態の即座更新を受信
      this.socket.on("cardEffectStates", (effectStates) => {
        console.log("🔄 cardEffectStates即座更新受信:", effectStates);
        this.cardEffectStates = {
          invasionCounts: effectStates.invasionCounts || {},
          ...effectStates,
        };
        console.log("🔄 カード効果状態即座更新完了:", this.cardEffectStates);
      });

      // 勝利効果が使用可能になった時の通知を受信
      this.socket.on("victory-effects-available", (availableEffects) => {
        console.log("🏆=== 勝利効果使用可能通知受信 ===");
        console.log("📨 受信データ:", availableEffects);
        console.log("📊 受信データ詳細:", {
          effectsCount: availableEffects?.length || 0,
          effects: availableEffects,
          currentPlayerId: this.playerId,
          socketId: this.socket?.id,
        });

        this.availableVictoryEffects = availableEffects || [];
        console.log("💾 状態更新後:", this.availableVictoryEffects);

        // プレイヤーに関連する勝利効果のみフィルタリング
        const playerEffects = availableEffects.filter((effect) => {
          console.log("🔍 効果フィルタリング:", {
            effectPlayerId: effect.playerId,
            currentPlayerId: this.playerId,
            match: effect.playerId === this.playerId,
          });
          return effect.playerId === this.playerId;
        });

        console.log("👤 プレイヤー関連効果:", {
          playerEffectsCount: playerEffects.length,
          playerEffects: playerEffects,
        });

        if (playerEffects.length > 0) {
          const message = `🏆 勝利効果が使用可能になりました！（${playerEffects.length}個）`;
          console.log("📢 メッセージ表示:", message);
          this.addMessage(message, "victory");

          // 各効果の詳細をログ出力
          playerEffects.forEach((effect, index) => {
            console.log(`🎯 勝利効果 ${index + 1}:`, {
              cardName: effect.cardName,
              cardInstanceId: effect.cardInstanceId,
              abilityIndex: effect.abilityIndex,
              condition: effect.condition,
            });
          });
        } else {
          console.log("⚠️ 自分用の勝利効果がありません");
        }

        console.log("🔄 勝利効果状態更新完了:", this.availableVictoryEffects);
        console.log("🏆=== 勝利効果処理完了 ===");
      });
    },

    joinGame(playerName) {
      this.playerName = playerName;
      this.isMatching = true;
      this.socket.emit("joinGame", { playerName: this.playerName });
      this.addMessage("マッチング開始..", "info");
    },

    updateGameState(state) {
      console.log("🔄=== ゲーム状態更新開始 ===");
      console.log("📨 受信状態:", state);

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

      console.log("🎮 ゲーム状態更新:", {
        currentPhase: this.currentPhase,
        gameState: this.gameState,
        currentPlayer: this.currentPlayer,
        isMyTurn: this.isMyTurn,
      });

      // ゲームが開始されたらマッチング状態を解除
      if (state.status === "playing") {
        this.isMatching = false;
      }

      if (state.players && state.players[this.socket.id]) {
        const playerData = state.players[this.socket.id];
        this.playerId = this.socket.id;

        console.log("� プレイヤーID設定詳細:", {
          socketId: this.socket.id,
          playerId: this.playerId,
          socketIdType: typeof this.socket.id,
          socketIdLength: this.socket.id?.length,
          playerDataExists: !!playerData,
          allPlayerIds: Object.keys(state.players || {}),
        });

        // IPアニメーション付きで更新
        this.updatePlayerIP(playerData.ip);

        // 増加IPの更新
        if (playerData.ipIncrease !== undefined) {
          this.playerIPIncrease = playerData.ipIncrease;
        }

        this.playerField = (playerData.field || []).map((card) => ({
          ...card,
          instanceId: card.instanceId || card.fieldId, // instanceIdまたはfieldIdを使用
        }));

        // プレイヤーフィールドの勝利効果をチェック
        const victoryCards = this.playerField.filter(
          (card) =>
            card.abilities &&
            card.abilities.some((ability) => ability.type === "勝利")
        );

        if (victoryCards.length > 0) {
          console.log("🏆 プレイヤーフィールドの勝利カード:", {
            victoryCardsCount: victoryCards.length,
            victoryCards: victoryCards.map((card) => ({
              name: card.name,
              instanceId: card.instanceId,
              victoryAbilities: card.abilities.filter(
                (ability) => ability.type === "勝利"
              ),
            })),
            currentAvailableEffects: this.availableVictoryEffects,
          });
        }

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

          // 相手の増加IPの更新
          if (state.players[opponentId].ipIncrease !== undefined) {
            this.opponentIPIncrease = state.players[opponentId].ipIncrease;
          }

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

      if (state.exileField) {
        this.exileField = state.exileField.map((card) => ({
          ...card,
          instanceId:
            card.fieldId || card.instanceId || `exile_${card.id}_${Date.now()}`, // fieldIdをinstanceIdとしても使用
        }));
      }

      // カード効果状態を更新
      if (state.cardEffectStates) {
        this.cardEffectStates = {
          invasionCounts: state.cardEffectStates.invasionCounts || {},
          ...state.cardEffectStates,
        };
        console.log("🔄 カード効果状態更新:", this.cardEffectStates);
      }

      // デバッグ用ゲーム状態を更新
      this.debugGameState = {
        turn: this.currentTurn,
        phase: this.currentPhase,
        currentPlayerIndex: state.currentPlayerIndex || 0,
        players: Object.keys(state.players || {}).map((playerId, index) => ({
          id: playerId,
          name: state.players[playerId].name || `プレイヤー${index + 1}`,
          points: state.players[playerId].ip || 0,
          field: state.players[playerId].field || [],
        })),
        neutralField: this.neutralField,
        exileField: this.exileField,
        availableVictoryEffects: this.availableVictoryEffects,
      };

      console.log("🔄=== ゲーム状態更新完了 ===");
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

        // 入札後にモーダルを閉じて、入札完了状態を表示
        this.showAuctionModal = false;
        this.showBidCompleted = true;
        this.bidCompletedData = {
          cardName: selectedCard.name,
          bidAmount: bidAmount,
        };
      } else {
        console.log("入札失敗", {
          selectedCard: selectedCard,
          bidAmount: bidAmount,
        });
      }
    },

    useAbility(card, ability) {
      // パラメータの検証
      if (!card) {
        console.error("useAbility: card parameter is undefined");
        this.addMessage("カード情報が不正です", "error");
        return;
      }
      if (!ability) {
        console.error("useAbility: ability parameter is undefined");
        this.addMessage("アビリティ情報が不正です", "error");
        return;
      }

      // プレイングフェーズで自分のターンでのみ使用可能
      if (this.currentPhase !== "playing" || !this.isMyTurn) {
        this.addMessage("現在はアビリティを使用できません", "warning");
        return;
      }

      console.log("🎮=== useAbility 呼び出し ===");
      console.log("📋 カード情報:", card);
      console.log("🔹 card.instanceId:", card.instanceId);
      console.log("🔹 card.fieldId:", card.fieldId);
      console.log("⚡ ability:", ability);
      console.log("🎯 ability.type:", ability.type);

      // 勝利効果の場合は詳細ログ
      if (ability.type === "勝利") {
        console.log("🏆=== 勝利効果使用開始 ===");
        console.log("🎯 勝利効果詳細:", {
          cardName: card.name,
          abilityDescription: ability.description,
          abilityCost: ability.cost,
          cardInstanceId: card.instanceId,
          abilityIndex: card.abilities.indexOf(ability),
        });

        // 使用可能な勝利効果リストと照合
        const matchingEffect = this.availableVictoryEffects.find(
          (effect) =>
            effect.cardInstanceId === card.instanceId &&
            effect.abilityIndex === card.abilities.indexOf(ability)
        );

        console.log("🔍 勝利効果照合結果:", {
          availableEffectsCount: this.availableVictoryEffects.length,
          availableEffects: this.availableVictoryEffects,
          matchingEffect: matchingEffect,
          isAvailable: !!matchingEffect,
        });

        if (!matchingEffect) {
          console.warn("⚠️ この勝利効果は使用可能リストにありません");
          this.addMessage("この勝利効果は現在使用できません", "warning");
          return;
        } else {
          console.log("✅ 勝利効果使用可能確認済み");
        }
      }

      const cardCount = this.getCardCount(card.id);
      console.log("📊 カード枚数チェック:", {
        cardId: card.id,
        cardCount: cardCount,
        requiredCost: ability.cost,
        isFatigued: card.isFatigued,
      });

      if (cardCount >= ability.cost && !card.isFatigued) {
        console.log("✅ アビリティ使用条件クリア");
        console.log("📤 アビリティ使用:", {
          card: card.name,
          ability: ability.description,
          instanceId: card.instanceId,
          fieldId: card.fieldId,
        });

        const payload = {
          cardInstanceId: card.instanceId,
          abilityIndex: card.abilities.indexOf(ability),
        };
        console.log("📨 サーバーに送信するpayload:", payload);

        this.socket.emit("useAbility", payload);
        this.addMessage(`${card.name}の${ability.type}を使用`, "info");

        if (ability.type === "勝利") {
          console.log("🏆 勝利効果送信完了");
        }
      } else if (card.isFatigued) {
        console.log("❌ 疲労しているため使用不可");
        this.addMessage("疲労しているカードはプレイできません", "warning");
      } else {
        console.log("❌ カード枚数不足");
        this.addMessage("カード枚数が不足しています", "warning");
      }

      console.log("🎮=== useAbility 処理完了 ===");
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
        // 入札ボタン押下時に競売カードとしてセットし、モーダルを表示
        this.selectedCard = this.selectedCardForOptions;
        this.hideCardOptionsMenu();
        // GameBoardのshowAuctionModalForCardメソッドを呼び出すためのイベントを発火
        this.$nextTick(() => {
          // GameBoard経由でAuctionModalを表示
          this.showAuctionModal = true;
        });
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
      this.exileField = [];
      this.selectedCard = null;
      this.detailCard = null;
      this.opponentName = "";
      this.opponentIP = 10;
      this.showMatchResult = false;
      this.showCardOptions = false;
      this.selectedCardForOptions = null;

      // 勝利効果の状態をリセット
      this.availableVictoryEffects = [];

      // カード効果状態をリセット
      this.cardEffectStates = {
        invasionCounts: {},
      };

      // デバッグ用ゲーム状態をリセット
      this.debugGameState = {};

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

    // デバッグ用カード獲得機能
    debugAcquire(card) {
      console.log("デバッグ獲得:", card);

      // サーバーにデバッグ獲得イベントを送信
      this.socket.emit("debug-acquire", {
        fieldId: card.fieldId || card.instanceId || card.id,
        cardId: card.id,
        cardName: card.name,
      });

      this.addMessage(`デバッグ獲得要求: ${card.name}`, "info");
      this.selectedCard = null; // 選択解除
    },

    // デバッグ用IP設定機能
    debugSetIP(data) {
      console.log("デバッグIP設定:", data);

      // サーバーにデバッグIP設定イベントを送信
      this.socket.emit("debug-set-ip", data);

      this.addMessage(`デバッグIP設定要求: ${data.ip}`, "info");
    },

    // オークション閉じる
    closeAuction() {
      this.selectedCard = null;
      this.showAuctionModal = false;
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

      // サーバーにキャンセルを通知
      this.socket.emit("cancel-target-selection");
    },

    selectMultipleTargets(selectedTargetIds) {
      console.log("selectMultipleTargets呼び出し", { selectedTargetIds });
      if (this.showMultipleTargetSelection) {
        this.socket.emit("multiple-targets-selected", {
          selectedTargetIds: selectedTargetIds,
        });
        console.log("multiple-targets-selectedイベント送信:", {
          selectedTargetIds,
        });
        this.cancelMultipleTargetSelection();
      }
    },

    cancelMultipleTargetSelection() {
      this.showMultipleTargetSelection = false;
      this.multipleTargetSelectionMessage = "";
      this.multipleSelectionTargets = [];

      // サーバーにキャンセルを通知
      this.socket.emit("cancel-multiple-target-selection");
    },

    selectReactionCard(reactionFieldId) {
      console.log("selectReactionCard呼び出し", { reactionFieldId });
      if (this.showReactionSelection) {
        this.socket.emit("reaction-selected", {
          reactionFieldId: reactionFieldId,
        });
        console.log("reaction-selectedイベント送信:", { reactionFieldId });
        this.cancelReactionSelection();
      }
    },

    cancelReactionSelection() {
      this.showReactionSelection = false;
      this.reactionSelectionMessage = "";
      this.validReactionCards = [];
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

    // IPアニメーション表示
    showIPAnimation(amount, type = "gain") {
      this.ipAnimation.amount = Math.abs(amount);
      this.ipAnimation.type = type;
      this.ipAnimation.show = true;

      setTimeout(() => {
        this.ipAnimation.show = false;
      }, 2000); // 2秒後に非表示
    },

    // IPを更新してアニメーション表示
    updatePlayerIP(newIP) {
      const oldIP = this.playerIP;
      const diff = newIP - oldIP;

      if (diff !== 0) {
        this.showIPAnimation(diff, diff > 0 ? "gain" : "loss");
      }

      this.playerIP = newIP;
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

      // 入札完了状態をリセット
      this.showBidCompleted = false;
      this.bidCompletedData = null;

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

    closeBidCompleted() {
      this.showBidCompleted = false;
      this.bidCompletedData = null;
    },

    // デバッグパネルの表示/非表示切り替え
    toggleDebugPanel() {
      this.showDebugPanel = !this.showDebugPanel;
    },

    closeDebugPanel() {
      this.showDebugPanel = false;
    },

    // モバイル UI 関連メソッド
    showGameInfo() {
      // ゲーム情報表示（今後実装）
      this.addMessage("ゲーム情報機能は今後実装予定です", "info");
    },

    showHelp() {
      // ヘルプ表示（今後実装）
      this.addMessage("ヘルプ機能は今後実装予定です", "info");
    },

    handleCardPreview(card) {
      // カードプレビュー処理
      console.log("Card preview:", card);
    },

    handleSwipeAction(direction) {
      // スワイプアクション処理
      if (direction === 'left') {
        this.addMessage("左スワイプ検出", "info");
      } else if (direction === 'right') {
        this.addMessage("右スワイプ検出", "info");
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

.game-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
  position: relative;
}

/* IPアニメーション */
.ip-animation {
  position: fixed;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 24px;
  font-weight: bold;
  z-index: 2000;
  animation: ipBounce 2s ease-out;
  pointer-events: none;
}

.ip-animation.gain {
  background: linear-gradient(135deg, #28a745, #20c997);
  box-shadow: 0 4px 20px rgba(40, 167, 69, 0.4);
}

.ip-animation.loss {
  background: linear-gradient(135deg, #dc3545, #fd7e14);
  box-shadow: 0 4px 20px rgba(220, 53, 69, 0.4);
}

@keyframes ipBounce {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px) scale(0.8);
  }
  20% {
    opacity: 1;
    transform: translateX(-50%) translateY(0px) scale(1.1);
  }
  40% {
    opacity: 1;
    transform: translateX(-50%) translateY(-5px) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateX(-50%) translateY(-30px) scale(0.9);
  }
}

/* デバッグボタン */
.debug-toggle-button {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 50px;
  height: 50px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #333, #555);
  color: white;
  font-size: 20px;
  cursor: pointer;
  z-index: 1000;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
}

.debug-toggle-button:hover {
  background: linear-gradient(135deg, #555, #777);
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}

.debug-toggle-button:active {
  transform: scale(0.95);
}

/* デバッグモーダル */
.debug-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  backdrop-filter: blur(3px);
}

.debug-modal-content {
  position: relative;
  background: transparent;
  border-radius: 12px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: auto;
  animation: debugModalFadeIn 0.3s ease-out;
}

.debug-close-button {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: rgba(220, 53, 69, 0.9);
  color: white;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  z-index: 2001;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.debug-close-button:hover {
  background: rgba(220, 53, 69, 1);
  transform: scale(1.1);
}

@keyframes debugModalFadeIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
