import { ref } from 'vue';

export function useMessageLog() {
  const messages = ref([]);
  const isMessageLogMinimized = ref(false);

  function addMessage(text, type = 'info') {
    messages.value.push({ text, type, timestamp: Date.now() });
    if (messages.value.length > 50) {
      messages.value.shift();
    }
  }

  function toggleMessageLog() {
    isMessageLogMinimized.value = !isMessageLogMinimized.value;
  }

  return {
    messages,
    isMessageLogMinimized,
    addMessage,
    toggleMessageLog,
  };
}
