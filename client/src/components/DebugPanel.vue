<template>
  <div class="debug-panel" v-if="showDebug">
    <div class="debug-header">
      <h3>🔧 デバッグパネル</h3>
      <button @click="toggleDebug" class="close-btn">×</button>
    </div>

    <div class="debug-content">
      <!-- ゲーム状態表示 -->
      <div class="debug-section">
        <h4>現在の状態</h4>
        <div class="game-info">
          <p><strong>ターン:</strong> {{ gameState.turn }}</p>
          <p><strong>フェーズ:</strong> {{ gameState.phase }}</p>
          <p><strong>現在のプレイヤー:</strong> {{ getCurrentPlayerName() }}</p>
        </div>
      </div>

      <!-- クイック状態設定 -->
      <div class="debug-section">
        <h4>クイック状態設定</h4>
        <div class="quick-states">
          <button @click="setQuickState('early-game')" class="debug-btn">
            序盤
          </button>
          <button @click="setQuickState('mid-game')" class="debug-btn">
            中盤
          </button>
          <button @click="setQuickState('late-game')" class="debug-btn">
            終盤
          </button>
        </div>
      </div>

      <!-- 状態保存・復元 -->
      <div class="debug-section">
        <h4>状態管理</h4>
        <div class="state-controls">
          <div class="save-section">
            <input
              v-model="saveStateName"
              placeholder="状態名を入力"
              class="debug-input"
            />
            <button @click="saveCurrentState" class="debug-btn save-btn">
              保存
            </button>
          </div>

          <button @click="loadSavedStates" class="debug-btn">
            保存済み状態を表示
          </button>
          <button @click="testSaveFunction" class="debug-btn">
            保存テスト
          </button>
        </div>
      </div>

      <!-- 保存済み状態一覧 -->
      <div class="debug-section" v-if="savedStates.length > 0">
        <h4>保存済み状態</h4>
        <div class="saved-states">
          <div
            v-for="state in savedStates"
            :key="state.fileName"
            class="saved-state-item"
          >
            <div class="state-info">
              <strong>{{ state.stateName }}</strong>
              <span class="state-details">
                ターン{{ state.turn }} / {{ state.phase }} /
                {{ formatDate(state.savedAt) }}
              </span>
            </div>
            <div class="state-actions">
              <button
                @click="restoreState(state.fileName)"
                class="debug-btn restore-btn"
              >
                復元
              </button>
              <button
                @click="deleteState(state.fileName)"
                class="debug-btn delete-btn"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- JSON状態表示 -->
      <div class="debug-section">
        <h4>JSON状態</h4>
        <button @click="toggleJsonView" class="debug-btn">
          {{ showJson ? "隠す" : "表示" }}
        </button>
        <div v-if="showJson" class="json-display">
          <pre>{{ JSON.stringify(gameState, null, 2) }}</pre>
        </div>
      </div>

      <!-- ステータス表示 -->
      <div class="debug-section" v-if="debugMessage">
        <div class="debug-status" :class="debugStatus">
          {{ debugMessage }}
        </div>
      </div>
    </div>
  </div>

  <!-- デバッグボタン -->
  <button v-if="!showDebug" @click="toggleDebug" class="debug-toggle">
    🔧
  </button>
</template>

<script>
export default {
  name: "DebugPanel",
  props: {
    gameState: {
      type: Object,
      default: () => ({}),
    },
    socket: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      showDebug: false,
      showJson: false,
      saveStateName: "",
      savedStates: [],
      debugMessage: "",
      debugStatus: "info",
      apiBaseUrl: "http://localhost:3001", // APIサーバーのベースURL
    };
  },
  mounted() {
    this.setupSocketListeners();
  },
  methods: {
    toggleDebug() {
      this.showDebug = !this.showDebug;
      if (this.showDebug) {
        this.loadSavedStates();
      }
    },

    toggleJsonView() {
      this.showJson = !this.showJson;
    },

    getCurrentPlayerName() {
      if (
        !this.gameState.players ||
        !this.gameState.players[this.gameState.currentPlayerIndex]
      ) {
        return "不明";
      }
      return this.gameState.players[this.gameState.currentPlayerIndex].name;
    },

    setQuickState(stateType) {
      this.socket.emit("debug-quick-state", { stateType });
    },

    saveCurrentState() {
      if (!this.saveStateName.trim()) {
        this.showMessage("状態名を入力してください", "error");
        return;
      }

      // まずSocket.ioでゲーム状態を取得
      this.socket.emit("debug-save-state", {
        stateName: this.saveStateName,
      });
    },

    // Socket.ioからゲーム状態を受信したらファイルに保存
    async handleGameStateSaved(data) {
      console.log("debug-state-saved受信:", data);

      if (!data.success) {
        this.showMessage(data.message || "状態の取得に失敗しました", "error");
        return;
      }

      try {
        console.log("API呼び出し開始:", {
          gameId: data.gameState.id,
          stateName: this.saveStateName,
          gameStateKeys: Object.keys(data.gameState),
        });

        // APIを使ってファイルに保存
        const response = await fetch(
          "http://localhost:3001/api/debug/save-state",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              gameId: data.gameState.id,
              stateName: this.saveStateName,
              gameState: data.gameState,
            }),
          }
        );

        console.log("API レスポンス:", response.status, response.statusText);
        const result = await response.json();
        console.log("API 結果:", result);

        if (result.success) {
          this.showMessage("状態を保存しました", "success");
          this.saveStateName = "";
          this.loadSavedStates();
        } else {
          this.showMessage(result.error || "保存に失敗しました", "error");
        }
      } catch (error) {
        console.error("状態保存エラー:", error);
        this.showMessage("保存に失敗しました", "error");
      }
    },

    // テスト用保存機能
    async testSaveFunction() {
      try {
        const testGameState = {
          id: "test-game-" + Date.now(),
          turn: 1,
          phase: "playing",
          currentPlayerIndex: 0,
          players: [
            { id: "player1", name: "テストプレイヤー1", points: 10, field: [] },
            { id: "player2", name: "テストプレイヤー2", points: 10, field: [] },
          ],
          neutralField: [],
          exileField: [],
          description: "テスト状態",
        };

        console.log("テスト保存開始:", testGameState);

        const response = await fetch(
          "http://localhost:3001/api/debug/save-state",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              gameId: testGameState.id,
              stateName: "テスト状態",
              gameState: testGameState,
            }),
          }
        );

        const result = await response.json();
        console.log("テスト保存結果:", result);

        if (result.success) {
          this.showMessage("テスト保存成功！", "success");
          this.loadSavedStates();
        } else {
          this.showMessage(
            "テスト保存失敗: " + (result.error || "不明なエラー"),
            "error"
          );
        }
      } catch (error) {
        console.error("テスト保存エラー:", error);
        this.showMessage("テスト保存でエラーが発生しました", "error");
      }
    },

    async loadSavedStates() {
      try {
        console.log("保存状態の読み込み開始");
        const response = await fetch(
          "http://localhost:3001/api/debug/saved-states"
        );
        console.log("API レスポンス:", response.status, response.statusText);
        const data = await response.json();
        console.log("保存状態データ:", data);
        this.savedStates = data.savedStates || [];
        console.log("設定された保存状態:", this.savedStates.length, "件");
      } catch (error) {
        console.error("保存状態の読み込みエラー:", error);
        this.showMessage("保存状態の読み込みに失敗しました", "error");
      }
    },

    async restoreState(fileName) {
      try {
        const response = await fetch(
          `http://localhost:3001/api/debug/saved-states/${fileName}`
        );
        const gameState = await response.json();

        this.socket.emit("debug-restore-state", { gameState });
      } catch (error) {
        console.error("状態復元エラー:", error);
        this.showMessage("状態の復元に失敗しました", "error");
      }
    },

    async deleteState(fileName) {
      if (!confirm("この状態を削除しますか？")) {
        return;
      }

      try {
        const response = await fetch(
          `http://localhost:3001/api/debug/saved-states/${fileName}`,
          {
            method: "DELETE",
          }
        );
        const result = await response.json();

        if (result.success) {
          this.showMessage("状態を削除しました", "success");
          this.loadSavedStates();
        } else {
          this.showMessage("削除に失敗しました", "error");
        }
      } catch (error) {
        console.error("状態削除エラー:", error);
        this.showMessage("削除に失敗しました", "error");
      }
    },

    setupSocketListeners() {
      this.socket.on("debug-state-saved", (data) => {
        this.handleGameStateSaved(data);
      });

      this.socket.on("debug-state-restored", (data) => {
        if (data.success) {
          this.showMessage("状態を復元しました", "success");
        } else {
          this.showMessage(data.message || "復元に失敗しました", "error");
        }
      });

      this.socket.on("debug-quick-state-set", (data) => {
        if (data.success) {
          this.showMessage("クイック状態を設定しました", "success");
        } else {
          this.showMessage(data.message || "状態設定に失敗しました", "error");
        }
      });
    },

    showMessage(message, status = "info") {
      this.debugMessage = message;
      this.debugStatus = status;
      setTimeout(() => {
        this.debugMessage = "";
      }, 3000);
    },

    formatDate(dateString) {
      const date = new Date(dateString);
      return date.toLocaleString("ja-JP");
    },
  },
};
</script>

<style scoped>
.debug-panel {
  position: fixed;
  top: 10px;
  right: 10px;
  width: 350px;
  max-height: 80vh;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  border: 2px solid #00ff00;
  border-radius: 8px;
  z-index: 9999;
  overflow-y: auto;
  font-family: monospace;
  font-size: 12px;
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: #333;
  border-bottom: 1px solid #00ff00;
}

.debug-header h3 {
  margin: 0;
  color: #00ff00;
}

.close-btn {
  background: none;
  border: none;
  color: #ff0000;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 25px;
  height: 25px;
}

.debug-content {
  padding: 15px;
}

.debug-section {
  margin-bottom: 20px;
  border-bottom: 1px solid #444;
  padding-bottom: 15px;
}

.debug-section:last-child {
  border-bottom: none;
}

.debug-section h4 {
  margin: 0 0 10px 0;
  color: #00ff00;
  font-size: 14px;
}

.game-info p {
  margin: 5px 0;
  color: #ccc;
}

.quick-states {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.debug-btn {
  background: #333;
  color: white;
  border: 1px solid #666;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.2s;
}

.debug-btn:hover {
  background: #555;
  border-color: #00ff00;
}

.save-btn {
  background: #006600;
}

.restore-btn {
  background: #000066;
}

.delete-btn {
  background: #660000;
}

.debug-input {
  background: #222;
  color: white;
  border: 1px solid #666;
  padding: 5px;
  margin-right: 5px;
  border-radius: 4px;
  font-size: 11px;
  width: 150px;
}

.save-section {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.saved-states {
  max-height: 200px;
  overflow-y: auto;
}

.saved-state-item {
  background: #222;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 8px;
}

.state-info {
  margin-bottom: 5px;
}

.state-info strong {
  color: #00ff00;
  display: block;
}

.state-details {
  color: #aaa;
  font-size: 10px;
}

.state-actions {
  display: flex;
  gap: 5px;
}

.json-display {
  max-height: 300px;
  overflow-y: auto;
  background: #111;
  border: 1px solid #333;
  padding: 10px;
  border-radius: 4px;
  margin-top: 10px;
}

.json-display pre {
  margin: 0;
  font-size: 10px;
  white-space: pre-wrap;
  word-break: break-all;
}

.debug-status {
  padding: 8px;
  border-radius: 4px;
  text-align: center;
  font-weight: bold;
}

.debug-status.success {
  background: #006600;
  color: white;
}

.debug-status.error {
  background: #660000;
  color: white;
}

.debug-status.info {
  background: #000066;
  color: white;
}

.debug-toggle {
  position: fixed;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.8);
  color: #00ff00;
  border: 2px solid #00ff00;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  font-size: 20px;
  cursor: pointer;
  z-index: 9998;
  transition: all 0.2s;
}

.debug-toggle:hover {
  background: rgba(0, 255, 0, 0.2);
  transform: scale(1.1);
}
</style>
