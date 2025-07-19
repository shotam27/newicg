<template>
  <div class="game-board">
    <!-- ターン情報 -->
    <TurnInfo
      :current-turn="currentTurn"
      :current-phase="currentPhase"
      :player-name="playerName"
      :player-i-p="playerIP"
      :player-i-p-increase="playerIPIncrease"
      :opponent-name="opponentName"
      :opponent-i-p="opponentIP"
      :opponent-i-p-increase="opponentIPIncrease"
    />

    <!-- デバッグパネル -->
    <DebugPanel :game-state="debugGameState" :socket="socket" />

    <!-- 相手のフィールド -->
    <CardGrid
      :title="`${opponentName || '相手'}のフィールド`"
      :cards="opponentField"
      field-type="opponent-field"
      :selected-card="selectedCard"
      :current-phase="currentPhase"
      :is-my-turn="isMyTurn"
      :player-field="playerField"
      @card-click="$emit('card-click', $event)"
      @card-detail="$emit('card-detail', $event)"
      @use-ability="(card, ability) => $emit('use-ability', card, ability)"
    />

    <!-- 中立フィールド -->
    <CardGrid
      title="中立フィールド"
      :cards="neutralField"
      field-type="neutral-field"
      :selected-card="selectedCard"
      :current-phase="currentPhase"
      :is-my-turn="isMyTurn"
      :player-field="playerField"
      @card-click="$emit('card-click', $event)"
      @card-detail="$emit('card-detail', $event)"
      @use-ability="(card, ability) => $emit('use-ability', card, ability)"
    />

    <!-- 追放フィールド -->
    <CardGrid
      title="追放フィールド"
      :cards="exileField"
      field-type="exile-field"
      :selected-card="selectedCard"
      :current-phase="currentPhase"
      :is-my-turn="isMyTurn"
      :player-field="playerField"
      @card-click="$emit('card-click', $event)"
      @card-detail="$emit('card-detail', $event)"
      @use-ability="(card, ability) => $emit('use-ability', card, ability)"
    />

    <!-- オークションパネル（モーダル） -->
    <AuctionModal
      :show="showAuctionModal"
      :selected-card="selectedCard"
      :player-i-p="playerIP"
      :neutral-field="neutralField"
      @place-bid="handlePlaceBid"
      @debug-acquire="$emit('debug-acquire', $event)"
      @close="$emit('close-auction')"
    />

    <!-- 自分のフィールド -->
    <CardGrid
      title="自分のフィールド"
      :cards="playerField"
      field-type="player-field"
      :selected-card="selectedCard"
      :current-phase="currentPhase"
      :is-my-turn="isMyTurn"
      :player-field="playerField"
      :player-i-p="playerIP"
      @card-click="$emit('card-click', $event)"
      @card-detail="$emit('card-detail', $event)"
      @use-ability="(card, ability) => $emit('use-ability', card, ability)"
    />

    <!-- アクションボタン -->
    <ActionButtons
      :current-phase="currentPhase"
      :is-my-turn="isMyTurn"
      @pass-turn="$emit('pass-turn')"
      @end-turn="$emit('end-turn')"
      @debug-set-ip="$emit('debug-set-ip', $event)"
    />
  </div>
</template>

<script>
import TurnInfo from "./TurnInfo.vue";
import CardGrid from "./CardGrid.vue";
import AuctionModal from "./AuctionModal.vue";
import ActionButtons from "./ActionButtons.vue";
import DebugPanel from "./DebugPanel.vue";

export default {
  name: "GameBoard",
  components: {
    TurnInfo,
    CardGrid,
    AuctionModal,
    ActionButtons,
    DebugPanel,
  },
  props: {
    currentTurn: {
      type: Number,
      required: true,
    },
    currentPhase: {
      type: String,
      required: true,
    },
    playerName: {
      type: String,
      required: true,
    },
    playerIP: {
      type: Number,
      required: true,
    },
    playerIPIncrease: {
      type: Number,
      default: 10,
    },
    opponentName: {
      type: String,
      default: "",
    },
    opponentIP: {
      type: Number,
      default: 10,
    },
    opponentIPIncrease: {
      type: Number,
      default: 10,
    },
    playerField: {
      type: Array,
      required: true,
    },
    opponentField: {
      type: Array,
      required: true,
    },
    neutralField: {
      type: Array,
      required: true,
    },
    exileField: {
      type: Array,
      default: () => [],
    },
    selectedCard: {
      type: Object,
      default: null,
    },
    showAuctionModal: {
      type: Boolean,
      default: false,
    },
    isMyTurn: {
      type: Boolean,
      required: true,
    },
    socket: {
      type: Object,
      required: true,
    },
    debugGameState: {
      type: Object,
      default: () => ({}),
    },
  },
  methods: {
    handlePlaceBid(data) {
      this.$emit("place-bid", data);
    },
  },
  emits: [
    "card-click",
    "card-detail",
    "use-ability",
    "place-bid",
    "debug-acquire",
    "close-auction",
    "pass-turn",
    "end-turn",
  ],
};
</script>

<style scoped>
.game-board {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
</style>
