import { createApp } from 'vue'
import App from './App.vue'
import { io } from 'socket.io-client'

// Socket.io接続設定
const socket = io(import.meta.env.PROD ? '' : 'http://localhost:3001', {
  transports: ['websocket', 'polling']
})

const app = createApp(App)

// グローバルプロパティとしてsocketを提供
app.config.globalProperties.$socket = socket
app.provide('socket', socket)

app.mount('#app')
