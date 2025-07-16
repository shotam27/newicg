<template>
  <div class="lobby">
    <div class="lobby-content">
      <h1>🎴 ICG カードゲーム</h1>
      <p>オークション型対戦カードゲーム</p>

      <!-- マッチング中の表示 -->
      <div v-if="isMatching" class="matching-status">
        <div class="matching-spinner"></div>
        <h2>マッチング中...</h2>
        <p>対戦相手を探しています。少々お待ちください。</p>
        <button @click="$emit('cancel-matching')" class="cancel-btn">
          キャンセル
        </button>
      </div>

      <!-- 通常のログイン画面 -->
      <div v-else class="join-form">
        <input
          v-model="playerName"
          placeholder="プレイヤー名を入力"
          @keyup.enter="handleJoinGame"
          maxlength="20"
        />
        <button @click="handleJoinGame" :disabled="!playerName.trim()">
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
</template>

<script>
export default {
  name: "Lobby",
  props: {
    isMatching: {
      type: Boolean,
      required: true,
    },
  },
  data() {
    return {
      playerName: "",
    };
  },
  methods: {
    handleJoinGame() {
      if (this.playerName.trim()) {
        this.$emit("join-game", this.playerName);
      }
    },
  },
};
</script>

<style scoped>
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
</style>
