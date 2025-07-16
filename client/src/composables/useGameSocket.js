import { ref } from 'vue';
import { io } from 'socket.io-client';

export function useGameSocket({
  addMessage,
  updateGameState,
  showAuctionResultModal,
  showTurnPhaseChangeNotification,
  showMatchingComplete,
  setOpponentField,
  setPlayerField,
  setNeutralField,
  setWinner,
  setIsMatching,
  setPlayerId,
  setPlayerIP,
  setOpponentName,
  setOpponentIP,
}) {
  const socket = ref(null);
  const isConnected = ref(false);

  function initializeSocket() {
    socket.value = io('http://localhost:3001');

    socket.value.on('connect', () => {
      isConnected.value = true;
      addMessage('サーバーに接続しました', 'info');
    });
    socket.value.on('disconnect', () => {
      isConnected.value = false;
      addMessage('サーバーから切断されました', 'warning');
    });
    socket.value.on('gameState', (state) => {
      updateGameState(state);
    });
    socket.value.on('waiting-for-opponent', () => {
      setIsMatching(true);
      addMessage('対戦相手を探しています..', 'info');
    });
    socket.value.on('message', (message) => {
      addMessage(message.text, message.type || 'info');
    });
    socket.value.on('auction-result', (data) => {
      showAuctionResultModal(data);
    });
    socket.value.on('gameEnd', (data) => {
      setWinner(data.winner);
      addMessage(`ゲーム終了 ${data.winner || '引き分け'}`, 'success');
    });
    socket.value.on('select-target', (data) => {
      addMessage(data.message, 'info');
    });
    socket.value.on('no-valid-targets', (data) => {
      addMessage(data.message, 'warning');
    });
    socket.value.on('reaction-triggered', (data) => {
      addMessage(
        `${data.player}の${data.cardName}が反応！${data.result}（${data.trigger}に対して）`,
        'reaction'
      );
    });
    socket.value.on('unimplemented-effect', (data) => {
      addMessage(
        `⚠️ ${data.player}の${data.cardName}: 未実装効果（${data.unimplementedInfo.feature}、優先度: ${data.unimplementedInfo.priority})`,
        'warning'
      );
      addMessage(`📝 理由: ${data.unimplementedInfo.reason}`, 'info');
    });
  }

  return {
    socket,
    isConnected,
    initializeSocket,
  };
}
