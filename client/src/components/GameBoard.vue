<template>
  <div class="game-board">
    <!-- ターン情報 -->
    <TurnInfo
      :current-turn="currentTurn"
      :current-phase="currentPhase"
      :player-name="playerName"
      :player-i-p="playerIP"
      :opponent-name="opponentName"
      :opponent-i-p="opponentIP"
    />

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
      @use-ability="$emit('use-ability', $event)"
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
      @use-ability="$emit('use-ability', $event)"
    />

    <!-- オークションパネル -->
    <AuctionPanel
      :current-phase="currentPhase"
      :selected-card="selectedCard"
      :player-i-p="playerIP"
      @place-bid="$emit('place-bid', $event)"
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
      @card-click="$emit('card-click', $event)"
      @card-detail="$emit('card-detail', $event)"
      @use-ability="$emit('use-ability', $event)"
    />

    <!-- アクションボタン -->
    <ActionButtons
      :current-phase="currentPhase"
      :is-my-turn="isMyTurn"
      @pass-turn="$emit('pass-turn')"
      @end-turn="$emit('end-turn')"
    />
  </div>
</template>

<script>
import TurnInfo from "./TurnInfo.vue";
import CardGrid from "./CardGrid.vue";
import AuctionPanel from "./AuctionPanel.vue";
import ActionButtons from "./ActionButtons.vue";

export default {
  name: "GameBoard",
  components: {
    TurnInfo,
    CardGrid,
    AuctionPanel,
    ActionButtons,
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
    opponentName: {
      type: String,
      default: "",
    },
    opponentIP: {
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
    selectedCard: {
      type: Object,
      default: null,
    },
    isMyTurn: {
      type: Boolean,
      required: true,
    },
  },
  emits: [
    "card-click",
    "card-detail",
    "use-ability",
    "place-bid",
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
