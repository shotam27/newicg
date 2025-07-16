<template>
  <div class="connection-status" :class="{ connected: isConnected }">
    {{ isConnected ? "接続中" : "切断中" }}
  </div>
</template>

<script>
export default {
  name: "ConnectionStatus",
  props: {
    isConnected: {
      type: Boolean,
      required: true,
    },
  },
};
</script>

<style scoped>
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
</style>
