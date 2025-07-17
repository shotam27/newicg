<template>
  <div class="action-buttons">
    <!-- プレイングフェーズの場合 -->
    <div v-if="currentPhase === 'playing'" class="playing-actions">
      <div class="turn-status">
        <span v-if="isMyTurn" class="current-turn">あなたのターン</span>
        <span v-else class="waiting-turn">相手のターン</span>
      </div>
      <button
        @click="$emit('pass-turn')"
        :disabled="!isMyTurn"
        class="pass-btn"
      >
        ターンパス
      </button>
      <!-- デバッグボタン -->
      <button @click="debugSetIP" class="debug-btn">
        デバッグ: IP40にセット
      </button>
    </div>
    <!-- その他のフェーズの場合 -->
    <div v-else class="other-actions">
      <button
        @click="$emit('end-turn')"
        :disabled="currentPhase !== 'main'"
        class="end-turn-btn"
      >
        ターン終了
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: "ActionButtons",
  props: {
    currentPhase: {
      type: String,
      required: true,
    },
    isMyTurn: {
      type: Boolean,
      required: true,
    },
  },
  methods: {
    debugSetIP() {
      this.$emit("debug-set-ip", { ip: 50 });
    },
  },
};
</script>

<style scoped>
.action-buttons {
  margin-top: 20px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #dee2e6;
}

.playing-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.turn-status {
  font-size: 18px;
  font-weight: 600;
}

.current-turn {
  color: #28a745;
  background: #d4edda;
  padding: 8px 16px;
  border-radius: 20px;
  border: 2px solid #c3e6cb;
}

.waiting-turn {
  color: #6c757d;
  background: #f8f9fa;
  padding: 8px 16px;
  border-radius: 20px;
  border: 2px solid #dee2e6;
}

.pass-btn,
.end-turn-btn {
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.pass-btn {
  background: #17a2b8;
  color: white;
}

.pass-btn:hover:not(:disabled) {
  background: #138496;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(23, 162, 184, 0.3);
}

.pass-btn:disabled {
  background: #6c757d;
  cursor: not-allowed;
  opacity: 0.6;
}

.end-turn-btn {
  background: #fd7e14;
  color: white;
}

.end-turn-btn:hover:not(:disabled) {
  background: #e8650e;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(253, 126, 20, 0.3);
}

.end-turn-btn:disabled {
  background: #6c757d;
  cursor: not-allowed;
  opacity: 0.6;
}

.other-actions {
  text-align: center;
}
</style>
