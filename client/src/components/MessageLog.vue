<template>
  <div class="message-log" :class="{ minimized: isMinimized }">
    <div class="message-header" @click="$emit('toggle-log')">
      <span>メッセージ</span>
      <button class="minimize-btn" :class="{ rotated: isMinimized }">▼</button>
    </div>
    <div class="messages" v-show="!isMinimized">
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
</template>

<script>
export default {
  name: "MessageLog",
  props: {
    messages: {
      type: Array,
      required: true,
    },
    isMinimized: {
      type: Boolean,
      default: false,
    },
  },
};
</script>

<style scoped>
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

.minimize-btn {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  transition: transform 0.3s ease;
}

.minimize-btn.rotated {
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

/* メッセージログのスクロールバー */
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
</style>
