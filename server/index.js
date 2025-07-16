const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const GameEngine = require('./game/GameEngine');
const cardData = require('../cards.json');

const app = express();
const server = http.createServer(app);

// 本番環境では静的ファイルを配信
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// ゲーム管理
const games = new Map();
const waitingPlayers = [];

io.on('connection', (socket) => {
  console.log('プレイヤー接続:', socket.id);

  // マッチメイキング
  socket.on('joinGame', (data) => {
    console.log('joinGameイベント受信:', data, 'socket ID:', socket.id);
    
    const player = {
      id: socket.id,
      name: data.playerName || `プレイヤー${socket.id.slice(-4)}`,
      socket: socket
    };

    if (waitingPlayers.length === 0) {
      // 待機リストに追加
      waitingPlayers.push(player);
      socket.emit('waiting-for-opponent');
      console.log(`プレイヤー待機中: ${player.name}`);
    } else {
      // ゲーム開始
      const opponent = waitingPlayers.pop();
      
      if (!opponent || !opponent.socket) {
        console.error('無効な対戦相手');
        waitingPlayers.push(player);
        socket.emit('waiting-for-opponent');
        return;
      }
      
      const gameId = uuidv4();
      
      try {
        const game = new GameEngine(gameId, [opponent, player], cardData.cards);
        games.set(gameId, game);

        // 両プレイヤーをゲームルームに参加
        opponent.socket.join(gameId);
        player.socket.join(gameId);

        // ゲーム開始通知
        game.startGame();
        
        console.log(`ゲーム開始: ${gameId} - ${opponent.name} vs ${player.name}`);
      } catch (error) {
        console.error('ゲーム作成エラー:', error.message);
        // エラーの場合は両プレイヤーを待機状態に戻す
        waitingPlayers.push(player);
        if (opponent) waitingPlayers.push(opponent);
        socket.emit('waiting-for-opponent');
        if (opponent.socket) opponent.socket.emit('waiting-for-opponent');
      }
    }
  });

  // オークション選択
  socket.on('auction-select', (data) => {
    const game = findGameByPlayerId(socket.id);
    if (game) {
      game.handleAuctionSelect(socket.id, data.cardId, data.points);
    }
  });

  // カードプレイ
  socket.on('play-card', (data) => {
    const game = findGameByPlayerId(socket.id);
    if (game) {
      game.handleCardPlay(socket.id, data.cardId, data.abilityIndex);
    }
  });

  // アビリティ使用（フロントエンド用）
  socket.on('useAbility', (data) => {
    console.log('useAbilityイベント受信:', data);
    const game = findGameByPlayerId(socket.id);
    if (game) {
      if (!data.cardInstanceId) {
        console.log('警告: cardInstanceIdが未定義です', data);
      }
      game.handleCardPlay(socket.id, data.cardInstanceId, data.abilityIndex);
    }
  });

  // 入札処理
  socket.on('placeBid', (data) => {
    console.log('placeBidイベント受信:', data);
    const game = findGameByPlayerId(socket.id);
    if (game) {
      game.handleAuctionSelect(socket.id, data.cardId, data.amount);
    } else {
      console.log('ゲームが見つかりません:', socket.id);
    }
  });

  // マッチングキャンセル
  socket.on('cancelMatching', () => {
    const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
      console.log(`マッチングキャンセル: ${socket.id}`);
    }
  });


  // ターンパス
  socket.on('pass-turn', () => {
    const game = findGameByPlayerId(socket.id);
    if (game) {
      game.handlePassTurn(socket.id);
    }
  });

  // 手動反応発動
  socket.on('useReaction', (data) => {
    const game = findGameByPlayerId(socket.id);
    if (game) {
      game.handleUseReaction(socket.id, data.cardInstanceId);
    }
  });

  // 対象選択
  socket.on('target-selected', (data) => {
    console.log('target-selectedイベント受信:', data);
    const game = findGameByPlayerId(socket.id);
    if (game) {
      console.log('ゲームでhandleTargetSelection呼び出し');
      game.handleTargetSelection(socket.id, data.targetFieldId);
    } else {
      console.log('ゲームが見つかりません');
    }
  });

  // 切断処理
  socket.on('disconnect', () => {
    console.log('プレイヤー切断:', socket.id);
    
    // 待機リストから削除
    const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }

    // ゲームから削除
    const game = findGameByPlayerId(socket.id);
    if (game) {
      game.handlePlayerDisconnect(socket.id);
      games.delete(game.id);
    }
  });
});

function findGameByPlayerId(playerId) {
  for (const game of games.values()) {
    if (game.players.some(p => p.id === playerId)) {
      return game;
    }
  }
  return null;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`サーバー起動: http://localhost:${PORT}`);
});
