import { ref } from 'vue';

export function useTurnPhaseNotification(addMessage) {
  const showTurnPhaseNotification = ref(false);
  const turnPhaseNotificationMessage = ref('');
  const turnPhaseNotificationTimer = ref(null);
  const pendingTurnPhaseNotification = ref(false);

  function getPhaseDisplayName(phase) {
    const phaseNames = {
      auction: 'オークション',
      playing: 'プレイング',
      'target-selection': '対象選択',
    };
    return phaseNames[phase] || phase;
  }

  function showTurnPhaseChangeNotification(newTurn, newPhase, turnChanged, phaseChanged, showAuctionResult) {
    let message = '';
    if (turnChanged && phaseChanged) {
      message = `ターン ${newTurn} - ${getPhaseDisplayName(newPhase)}フェーズ開始！`;
    } else if (turnChanged) {
      message = `ターン ${newTurn} 開始！`;
    } else if (phaseChanged) {
      message = `${getPhaseDisplayName(newPhase)}フェーズ開始！`;
    }
    turnPhaseNotificationMessage.value = message;
    if (!showAuctionResult) {
      showTurnPhaseNotification.value = true;
      if (turnPhaseNotificationTimer.value) {
        clearTimeout(turnPhaseNotificationTimer.value);
      }
      turnPhaseNotificationTimer.value = setTimeout(() => {
        showTurnPhaseNotification.value = false;
      }, 3000);
    } else {
      pendingTurnPhaseNotification.value = true;
    }
    addMessage(message, 'info');
  }

  return {
    showTurnPhaseNotification,
    turnPhaseNotificationMessage,
    turnPhaseNotificationTimer,
    pendingTurnPhaseNotification,
    showTurnPhaseChangeNotification,
  };
}
