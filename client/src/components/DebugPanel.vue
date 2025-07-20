<template>
  <div class="debug-panel">
    <div class="debug-header">
      <h3>🔧 Debug Panel</h3>
    </div>
    
    <div class="debug-content">
      <!-- ゲーム状態情報 -->
      <div class="debug-section">
        <h4>🎮 Game State</h4>
        <div class="debug-info">
          <p><strong>Turn:</strong> {{ debugGameState.turn }}</p>
          <p><strong>Phase:</strong> {{ debugGameState.phase }}</p>
          <p><strong>Current Player:</strong> {{ debugGameState.currentPlayerIndex }}</p>
        </div>
      </div>

      <!-- プレイヤー情報 -->
      <div class="debug-section">
        <h4>👥 Players</h4>
        <div v-for="(player, index) in debugGameState.players" :key="player.id" class="player-info">
          <p><strong>{{ player.name }}:</strong> {{ player.points }}IP</p>
          <p>Field: {{ player.field.length }} cards</p>
        </div>
      </div>

      <!-- フィールド情報 -->
      <div class="debug-section">
        <h4>🃏 Fields</h4>
        <div class="debug-info">
          <p><strong>Neutral:</strong> {{ debugGameState.neutralField?.length || 0 }} cards</p>
          <p><strong>Exile:</strong> {{ debugGameState.exileField?.length || 0 }} cards</p>
        </div>
      </div>

      <!-- カード効果状態 -->
      <div class="debug-section">
        <h4>⚡ Card Effect States</h4>
        <div class="debug-info">
          <p><strong>Invasion Counts:</strong></p>
          <ul v-if="cardEffectStates.invasionCounts">
            <li v-for="(count, cardId) in cardEffectStates.invasionCounts" :key="cardId">
              {{ cardId }}: {{ count }}
            </li>
          </ul>
          <p v-else>No invasion counts</p>
        </div>
      </div>

      <!-- 勝利効果情報 -->
      <div class="debug-section victory-effects-section">
        <h4>🏆 Victory Effects (勝利効果)</h4>
        <div class="victory-summary">
          <p><strong>📊 Summary:</strong></p>
          <p>• Total Available: {{ availableVictoryEffects.length }}</p>
          <p>• Own Effects: <span class="own-count">{{ getPlayerVictoryEffects().length }}</span></p>
          <p>• Opponent Effects: <span class="opponent-count">{{ getOpponentVictoryEffects().length }}</span></p>
        </div>
        
        <div v-if="availableVictoryEffects.length > 0" class="victory-effects-list">
          <h5>📋 Available Victory Effects:</h5>
          <div v-for="(effect, index) in availableVictoryEffects" :key="index" class="victory-effect" :class="{ 'own-effect': effect.playerId === playerId }">
            <div class="effect-header">
              <strong>{{ effect.cardName }}</strong>
              <span class="player-badge" :class="effect.playerId === playerId ? 'own-badge' : 'opponent-badge'">
                {{ effect.playerId === playerId ? 'YOU' : 'OPP' }}
              </span>
            </div>
            <div class="effect-details">
              <p><strong>Condition:</strong> {{ effect.condition }}</p>
              <div class="technical-info">
                <small>Instance ID: {{ effect.cardInstanceId }}</small><br>
                <small>Ability Index: {{ effect.abilityIndex }}</small><br>
                <small>Player ID: {{ effect.playerId }}</small>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="no-victory-effects">
          <p>❌ No victory effects currently available</p>
          <small>Victory effects will appear here when conditions are met</small>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'DebugPanel',
  props: {
    debugGameState: {
      type: Object,
      default: () => ({})
    },
    cardEffectStates: {
      type: Object,
      default: () => ({})
    },
    availableVictoryEffects: {
      type: Array,
      default: () => []
    },
    playerId: {
      type: String,
      default: ''
    }
  },
  methods: {
    getPlayerVictoryEffects() {
      return this.availableVictoryEffects.filter(effect => effect.playerId === this.playerId);
    },
    getOpponentVictoryEffects() {
      return this.availableVictoryEffects.filter(effect => effect.playerId !== this.playerId);
    }
  }
}
</script>

<style scoped>
.debug-panel {
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 15px;
  border-radius: 8px;
  max-width: 400px;
  font-size: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  max-height: 600px;
  overflow-y: auto;
}

.debug-header h3 {
  margin: 0 0 15px 0;
  color: #ffd700;
  font-size: 16px;
  text-align: center;
  border-bottom: 1px solid #444;
  padding-bottom: 8px;
}

.debug-section {
  margin-bottom: 15px;
  border-bottom: 1px solid #333;
  padding-bottom: 10px;
}

.debug-section:last-child {
  border-bottom: none;
}

.debug-section h4 {
  margin: 0 0 8px 0;
  color: #4caf50;
  font-size: 14px;
}

.debug-section h5 {
  margin: 10px 0 5px 0;
  color: #ffeb3b;
  font-size: 12px;
}

.debug-info {
  background: rgba(255, 255, 255, 0.05);
  padding: 8px;
  border-radius: 4px;
}

.debug-info p {
  margin: 4px 0;
  font-size: 11px;
}

.debug-info ul {
  margin: 5px 0;
  padding-left: 15px;
}

.debug-info li {
  margin: 2px 0;
  font-size: 11px;
}

.player-info {
  background: rgba(0, 255, 0, 0.1);
  padding: 8px;
  margin: 5px 0;
  border-radius: 4px;
  border: 1px solid #4caf50;
}

.player-info p {
  margin: 2px 0;
  font-size: 11px;
}

/* 勝利効果専用スタイル */
.victory-effects-section {
  border: 3px solid #ffd700;
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 215, 0, 0.05));
  border-radius: 8px;
}

.victory-effects-section h4 {
  color: #ffd700;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
  font-size: 16px;
  margin: 0 0 12px 0;
}

.victory-summary {
  background: rgba(255, 255, 255, 0.1);
  padding: 10px;
  border-radius: 6px;
  margin-bottom: 12px;
  border: 1px solid rgba(255, 215, 0, 0.3);
}

.victory-summary p {
  margin: 4px 0;
  font-weight: bold;
}

.own-count {
  color: #4caf50;
  font-weight: bold;
  text-shadow: 0 0 5px rgba(76, 175, 80, 0.5);
}

.opponent-count {
  color: #ff9800;
  font-weight: bold;
  text-shadow: 0 0 5px rgba(255, 152, 0, 0.5);
}

.victory-effects-list {
  max-height: 250px;
  overflow-y: auto;
}

.victory-effect {
  background: rgba(255, 255, 255, 0.1);
  padding: 12px;
  margin: 8px 0;
  border-radius: 6px;
  border-left: 4px solid #ff9800;
  transition: all 0.2s ease;
}

.victory-effect:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateX(2px);
}

.victory-effect.own-effect {
  border-left-color: #4caf50;
  background: rgba(76, 175, 80, 0.15);
  box-shadow: 0 0 10px rgba(76, 175, 80, 0.2);
}

.effect-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.effect-header strong {
  color: #fff;
  font-size: 13px;
}

.player-badge {
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
}

.own-badge {
  background: #4caf50;
  color: white;
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.4);
}

.opponent-badge {
  background: #ff9800;
  color: white;
  box-shadow: 0 0 8px rgba(255, 152, 0, 0.4);
}

.effect-details p {
  margin: 4px 0;
  font-weight: bold;
  color: #fff;
}

.technical-info {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.technical-info small {
  color: #ccc;
  font-size: 9px;
  line-height: 1.3;
}

.no-victory-effects {
  background: rgba(255, 255, 255, 0.05);
  padding: 16px;
  border-radius: 6px;
  text-align: center;
  color: #888;
  border: 1px dashed rgba(255, 255, 255, 0.3);
}

.no-victory-effects p {
  margin: 0 0 8px 0;
  font-weight: bold;
}

.no-victory-effects small {
  color: #666;
  font-style: italic;
}
</style>
