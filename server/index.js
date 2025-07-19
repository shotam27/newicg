const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();

const GameEngine = require('./game/GameEngine');
const CardEffectStatusDB = require('./database/cardEffectStatus');

// SQLiteデータベース接続
const dbPath = path.join(__dirname, 'database/icg.db');
console.log('Database path:', dbPath);
const db = new sqlite3.Database(dbPath);

// カードデータをDBから読み込む関数
function loadCardsFromDB() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM cards ORDER BY number ASC', (err, rows) => {
      if (err) {
        console.error('カードデータの読み込みエラー:', err);
        // フォールバックとしてJSONファイルを使用
        try {
          const cardData = require('../cards.json');
          console.log('フォールバック: cards.jsonから読み込み');
          resolve(cardData);
        } catch (fallbackErr) {
          reject(fallbackErr);
        }
        return;
      }
      
      const cards = rows.map(row => ({
        number: row.number,
        id: row.id,
        name: row.name,
        ...(row.traits ? { traits: JSON.parse(row.traits) } : {}),
        abilities: JSON.parse(row.abilities)
      }));
      
      const cardData = { cards };
      console.log(`データベースから${cards.length}枚のカードを読み込みました`);
      resolve(cardData);
    });
  });
}

// カードデータを初期化
let cardData = null;
loadCardsFromDB().then(data => {
  cardData = data;
}).catch(err => {
  console.error('カードデータの初期化に失敗:', err);
  process.exit(1);
});

// カードデータを再読み込みする関数
function reloadCardData() {
  loadCardsFromDB().then(data => {
    cardData = data;
    console.log('カードデータを再読み込みしました');
    // 接続中のクライアントに更新を通知
    io.emit('cardsUpdated', { message: 'カードデータが更新されました' });
  }).catch(err => {
    console.error('カードデータの再読み込みに失敗:', err);
  });
}

// カードデータを取得する関数（常に最新を返す）
function getCardData() {
  return cardData;
}

// DBファイルの監視を設定
const fs = require('fs');
let dbWatcher = null;
try {
  dbWatcher = fs.watchFile(dbPath, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
      console.log('データベースファイルが更新されました');
      setTimeout(reloadCardData, 100); // 少し遅延させて確実に書き込み完了を待つ
    }
  });
} catch (err) {
  console.log('DBファイル監視の設定に失敗:', err);
}

const app = express();
const server = http.createServer(app);

// 効果ステータスDB初期化
const effectStatusDB = new CardEffectStatusDB();

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

// カードデータ確認用API
app.get('/api/cards', (req, res) => {
  res.json(cardData);
});

// 特定のカードを検索するAPI
app.get('/api/cards/search/:name', (req, res) => {
  if (!cardData || !cardData.cards) {
    return res.status(500).json({ error: 'カードデータが読み込まれていません' });
  }
  
  const searchName = req.params.name;
  const foundCards = cardData.cards.filter(card => 
    card.name.includes(searchName)
  );
  
  res.json({ cards: foundCards });
});

// カード効果ステータス API
app.get('/api/effect-status/:cardId/:abilityIndex', (req, res) => {
  const { cardId, abilityIndex } = req.params;
  const status = effectStatusDB.getEffectStatus(cardId, parseInt(abilityIndex));
  res.json(status);
});

app.post('/api/effect-status/:cardId/:abilityIndex', (req, res) => {
  const { cardId, abilityIndex } = req.params;
  const { status, reportedBy = 'manual' } = req.body;
  
  if (!['working', 'broken', 'unknown'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  
  const success = effectStatusDB.setEffectStatus(cardId, parseInt(abilityIndex), status, reportedBy);
  res.json({ success, status });
});

app.get('/api/effect-status/card/:cardId', (req, res) => {
  const { cardId } = req.params;
  const statuses = effectStatusDB.getCardEffectStatuses(cardId);
  res.json(statuses);
});

app.get('/api/effect-status/statistics', (req, res) => {
  const stats = effectStatusDB.getStatistics();
  res.json(stats);
});

app.get('/api/effect-status/all', (req, res) => {
  const allStatuses = effectStatusDB.getAllEffectStatuses();
  res.json(allStatuses);
});

// デバッグ機能: ゲーム状態管理API
app.get('/api/debug/games', (req, res) => {
  const gameStates = [];
  for (const [gameId, game] of games.entries()) {
    gameStates.push({
      gameId: gameId,
      players: game.players.map(p => ({ id: p.id, name: p.name })),
      turn: game.turn,
      phase: game.phase,
      currentPlayer: game.players[game.currentPlayerIndex]?.name
    });
  }
  res.json({ games: gameStates });
});

app.get('/api/debug/game/:gameId/state', (req, res) => {
  const { gameId } = req.params;
  const game = games.get(gameId);
  
  if (!game) {
    return res.status(404).json({ error: 'ゲームが見つかりません' });
  }
  
  const gameState = game.saveGameState();
  res.json(gameState);
});

app.post('/api/debug/game/:gameId/restore', (req, res) => {
  const { gameId } = req.params;
  const { gameState } = req.body;
  const game = games.get(gameId);
  
  if (!game) {
    return res.status(404).json({ error: 'ゲームが見つかりません' });
  }
  
  const result = game.restoreGameState(gameState);
  res.json(result);
});

app.post('/api/debug/game/:gameId/quick-state', (req, res) => {
  const { gameId } = req.params;
  const { stateType } = req.body;
  const game = games.get(gameId);
  
  if (!game) {
    return res.status(404).json({ error: 'ゲームが見つかりません' });
  }
  
  const result = game.setQuickDebugState(stateType);
  res.json(result);
});

// デバッグ機能: ゲーム状態の保存・読み込み用ファイルストレージ
const debugSavePath = path.join(__dirname, 'debug-saves');

// デバッグ保存ディレクトリを作成
if (!fs.existsSync(debugSavePath)) {
  fs.mkdirSync(debugSavePath, { recursive: true });
}

app.post('/api/debug/save-state', (req, res) => {
  const { gameId, stateName, gameState } = req.body;
  
  console.log('状態保存API呼び出し:', { gameId, stateName, gameStateKeys: Object.keys(gameState || {}) });
  
  if (!gameId || !stateName || !gameState) {
    console.log('必要なパラメータが不足:', { gameId: !!gameId, stateName: !!stateName, gameState: !!gameState });
    return res.status(400).json({ error: '必要なパラメータが不足しています' });
  }
  
  try {
    const fileName = `${stateName}_${gameId}_${Date.now()}.json`;
    const filePath = path.join(debugSavePath, fileName);
    
    console.log('保存先パス:', filePath);
    
    const saveData = {
      ...gameState,
      savedAt: new Date().toISOString(),
      stateName: stateName,
      gameId: gameId
    };
    
    fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));
    console.log('ファイル保存完了:', fileName);
    
    res.json({ 
      success: true, 
      message: `状態「${stateName}」を保存しました`,
      fileName: fileName 
    });
  } catch (error) {
    console.error('状態保存エラー:', error);
    res.status(500).json({ error: `保存エラー: ${error.message}` });
  }
});

app.get('/api/debug/saved-states', (req, res) => {
  try {
    const files = fs.readdirSync(debugSavePath);
    const savedStates = files
      .filter(file => file.endsWith('.json'))
      .map(file => {
        try {
          const filePath = path.join(debugSavePath, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          return {
            fileName: file,
            stateName: data.stateName || '名前なし',
            gameId: data.gameId,
            savedAt: data.savedAt,
            description: data.description,
            turn: data.turn,
            phase: data.phase,
            filePath: filePath
          };
        } catch (err) {
          console.error(`ファイル読み込みエラー: ${file}`, err);
          return null;
        }
      })
      .filter(state => state !== null)
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    
    res.json({ savedStates });
  } catch (error) {
    console.error('保存状態一覧取得エラー:', error);
    res.status(500).json({ error: `取得エラー: ${error.message}` });
  }
});

app.get('/api/debug/saved-states/:fileName', (req, res) => {
  const { fileName } = req.params;
  
  try {
    const filePath = path.join(debugSavePath, fileName);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'ファイルが見つかりません' });
    }
    
    const gameState = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(gameState);
  } catch (error) {
    console.error('状態読み込みエラー:', error);
    res.status(500).json({ error: `読み込みエラー: ${error.message}` });
  }
});

app.delete('/api/debug/saved-states/:fileName', (req, res) => {
  const { fileName } = req.params;
  
  try {
    const filePath = path.join(debugSavePath, fileName);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'ファイルが見つかりません' });
    }
    
    fs.unlinkSync(filePath);
    res.json({ success: true, message: `状態「${fileName}」を削除しました` });
  } catch (error) {
    console.error('状態削除エラー:', error);
    res.status(500).json({ error: `削除エラー: ${error.message}` });
  }
});

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
        const game = new GameEngine(gameId, [opponent, player], getCardData().cards);
        games.set(gameId, game);
        
        console.log('🎮 ゲーム作成完了:', {
          gameId: gameId,
          players: [opponent.name, player.name],
          playerIds: [opponent.id, player.id],
          totalGames: games.size
        });

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

  // デバッグ獲得処理
  socket.on('debug-acquire', (data) => {
    console.log('debug-acquireイベント受信:', data);
    const game = findGameByPlayerId(socket.id);
    if (game) {
      game.handleDebugAcquire(socket.id, data.fieldId || data.instanceId || data.id);
    } else {
      console.log('ゲームが見つかりません:', socket.id);
    }
  });

  // デバッグIP設定（テスト用）
  socket.on('debug-set-ip', (data) => {
    console.log('debug-set-ipイベント受信:', data);
    const game = findGameByPlayerId(socket.id);
    if (game) {
      const player = game.players.find(p => p.id === socket.id);
      if (player) {
        player.points = data.ip || 50;
        console.log(`デバッグ: ${player.name}のIPを${player.points}に設定`);
        game.broadcastGameState();
      }
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

  // 対象選択キャンセル
  socket.on('cancel-target-selection', () => {
    console.log('cancel-target-selectionイベント受信:', socket.id);
    const game = findGameByPlayerId(socket.id);
    if (game) {
      game.handleCancelTargetSelection(socket.id);
    } else {
      console.log('ゲームが見つかりません');
    }
  });

  // 複数対象選択
  socket.on('multiple-targets-selected', (data) => {
    console.log('multiple-targets-selectedイベント受信:', data);
    const game = findGameByPlayerId(socket.id);
    if (game) {
      console.log('ゲームでhandleMultipleTargetSelection呼び出し');
      game.handleMultipleTargetSelection(socket.id, data.selectedTargetIds);
    } else {
      console.log('ゲームが見つかりません');
    }
  });

  // 複数対象選択キャンセル
  socket.on('cancel-multiple-target-selection', () => {
    console.log('cancel-multiple-target-selectionイベント受信:', socket.id);
    const game = findGameByPlayerId(socket.id);
    if (game) {
      game.handleCancelMultipleTargetSelection(socket.id);
    } else {
      console.log('ゲームが見つかりません');
    }
  });

  // 反応カード選択
  socket.on('reaction-selected', (data) => {
    console.log('reaction-selectedイベント受信:', data);
    const game = findGameByPlayerId(socket.id);
    if (game) {
      game.handleReactionSelection(socket.id, data.reactionFieldId);
    } else {
      console.log('ゲームが見つかりません');
    }
  });

  // デバッグ機能: ゲーム状態保存
  socket.on('debug-save-state', (data) => {
    console.log('debug-save-stateイベント受信:', data);
    const game = findGameByPlayerId(socket.id);
    if (game) {
      const gameState = game.saveGameState();
      console.log('ゲーム状態取得成功:', { gameId: gameState.id, turn: gameState.turn, phase: gameState.phase });
      socket.emit('debug-state-saved', {
        success: true,
        gameState: gameState,
        message: 'ゲーム状態を保存しました'
      });
    } else {
      console.log('ゲームが見つかりません:', socket.id);
      socket.emit('debug-state-saved', {
        success: false,
        message: 'ゲームが見つかりません'
      });
    }
  });

  // デバッグ機能: ゲーム状態復元
  socket.on('debug-restore-state', (data) => {
    console.log('debug-restore-stateイベント受信:', data);
    const game = findGameByPlayerId(socket.id);
    if (game) {
      const result = game.restoreGameState(data.gameState);
      socket.emit('debug-state-restored', result);
    } else {
      socket.emit('debug-state-restored', {
        success: false,
        message: 'ゲームが見つかりません'
      });
    }
  });

  // デバッグ機能: クイック状態設定
  socket.on('debug-quick-state', (data) => {
    console.log('debug-quick-stateイベント受信:', data);
    const game = findGameByPlayerId(socket.id);
    if (game) {
      const result = game.setQuickDebugState(data.stateType);
      socket.emit('debug-quick-state-set', result);
    } else {
      socket.emit('debug-quick-state-set', {
        success: false,
        message: 'ゲームが見つかりません'
      });
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
      
      // 残っているプレイヤーをチェック
      const remainingPlayers = game.players.filter(p => p.socket && p.socket.connected);
      console.log('切断後の残プレイヤー数:', remainingPlayers.length);
      
      // 全プレイヤーが切断した場合のみゲームを削除
      if (remainingPlayers.length === 0) {
        console.log('全プレイヤーが切断したため、ゲームを削除:', game.id);
        games.delete(game.id);
      } else {
        console.log('他のプレイヤーが残っているため、ゲームを継続:', game.id);
      }
    }
  });
});

function findGameByPlayerId(playerId) {
  console.log('findGameByPlayerId呼び出し:', playerId);
  console.log('現在のゲーム数:', games.size);
  
  for (const [gameId, game] of games.entries()) {
    console.log(`ゲーム ${gameId} のプレイヤー:`, game.players.map(p => ({ id: p.id, name: p.name })));
    if (game.players.some(p => p.id === playerId)) {
      console.log('ゲーム発見:', gameId);
      return game;
    }
  }
  console.log('ゲームが見つかりませんでした');
  return null;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`サーバー起動: http://localhost:${PORT}`);
});
