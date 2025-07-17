<template>
  <div class="turn-info">
    <div class="turn-display">
      <span class="turn-label">ターン {{ currentTurn }}</span>
      <span class="phase-label">{{ currentPhase }}</span>
    </div>
    <div class="players-info">
      <div class="player-info">
        <span class="player-name">{{ playerName }}</span>
        <div class="ip-section">
          <span class="ip-display">IP: {{ playerIP }}</span>
          <span class="ip-increase">+{{ playerIPIncrease }}/ターン</span>
        </div>
      </div>
      <div v-if="opponentName" class="opponent-info">
        <span class="vs-label">vs</span>
        <span class="opponent-name">{{ opponentName }}</span>
        <div class="ip-section">
          <span class="opponent-ip">IP: {{ opponentIP }}</span>
          <span class="ip-increase">+{{ opponentIPIncrease }}/ターン</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "TurnInfo",
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
  },
};
</script>

<style scoped>
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

.ip-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ip-display {
  padding: 6px 12px;
  background: #4caf50;
  color: white;
  border-radius: 15px;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(76, 175, 80, 0.3);
}

.ip-increase {
  padding: 4px 8px;
  background: rgba(76, 175, 80, 0.7);
  color: white;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.players-info {
  display: flex;
  align-items: center;
  gap: 20px;
}

.opponent-info {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
}

.vs-label {
  font-weight: bold;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 8px;
}

.opponent-name {
  font-weight: 600;
}

.opponent-ip {
  padding: 6px 12px;
  background: #ff5722;
  color: white;
  border-radius: 15px;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(255, 87, 34, 0.3);
}

.opponent-info .ip-increase {
  background: rgba(255, 87, 34, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.3);
}
</style>
