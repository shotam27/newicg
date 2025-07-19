const CardEffects = require('./CardEffects');
const EventEmitter = require('events');

class GameEngine extends EventEmitter {

  constructor(gameId, players, cardPool) {
    super(); // EventEmitterの初期化
    this.id = gameId;

    // プレイヤーが2人いることを確認
    if (!players || players.length !== 2) {
      throw new Error('ゲームには正確に2人のプレイヤーが必要です');
    }

    this.players = players.map((p, index) => ({
      ...p,
      index: index,
      points: 10,
      ipIncrease: 10, // 増加IPの初期値を10に設定
      field: [],
      isReady: false,
      hasActed: false // プレイングフェーズで行動したかのフラグ
    }));
    this.cardPool = [...cardPool];
    this.neutralField = [];
    this.exileField = [];
    this.turn = 1;
    this.phase = 'waiting'; // waiting, auction, playing
    this.currentPlayerIndex = 0;
    this.auctionSelections = new Map();
    this.cardEffects = new CardEffects(this);

    this.setupNeutralField();
  }

  // 手動反応発動
  handleUseReaction(playerId, cardInstanceId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return;

    const card = player.field.find(c => c.instanceId === cardInstanceId);
    if (!card || card.isFatigued) return;

    // 反応アビリティを探す
    const reactionAbility = card.abilities.find(a => a.type === '反応');
    if (!reactionAbility) return;

    const result = this.cardEffects.executeAbility(player, card, reactionAbility);

    // 成功時は全員に通知
    if (result.success) {
      this.emit('reaction-triggered', {
        player: player.name,
        cardName: card.name,
        ability: reactionAbility.description,
        result: result.message,
        trigger: '手動発動'
      });
      this.broadcastGameState();
    }
  }

  setupNeutralField() {
    // number 1-12のカードから10枚をランダム選択
    const cardsNumber1to12 = this.cardPool.filter(card => card.number && card.number <= 12);
    const shuffled = [...cardsNumber1to12].sort(() => Math.random() - 0.5);
    this.neutralField = shuffled.slice(0, 10).map(card => ({
      ...card,
      fieldId: `neutral_${card.id}_${Date.now()}`,
      isFatigued: false,
      fatigueRemainingTurns: 0
    }));
    
    console.log('中立フィールド生成完了（number 1-12から選択）:', this.neutralField.map(card => `${card.number}.${card.name}`));
  }

  startGame() {
    // プレイヤーが2人いることを再確認
    if (this.players.length !== 2) {
      console.error('ゲーム開始エラー: プレイヤーが2人ではありません');
      return;
    }
    
    this.phase = 'auction';
    this.broadcastGameState();
    this.emit('message', {
      text: 'ゲーム開始！オークションフェーズです。',
      type: 'info'
    });
  }

  // オークション選択処理
  handleAuctionSelect(playerId, cardId, points) {
    console.log(`オークション選択: プレイヤー${playerId}, カード${cardId}, ポイント${points}`);
    
    if (this.phase !== 'auction') {
      console.log('オークションフェーズではありません');
      return;
    }
    
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.points < points) {
      console.log('プレイヤーが見つからないか、ポイントが不足しています');
      return;
    }

    // 疲労カードは選択不可
    const selectedCard = this.neutralField.find(c => c.fieldId === cardId);
    if (!selectedCard || selectedCard.isFatigued) {
      console.log('カードが見つからないか、疲労状態です');
      return;
    }

    this.auctionSelections.set(playerId, { cardId, points });
    console.log(`入札記録: ${this.auctionSelections.size}/2`);
    
    // 両プレイヤーの選択が完了したら処理
    if (this.auctionSelections.size === 2) {
      console.log('両プレイヤーの入札完了、オークション解決開始');
      this.resolveAuction();
    }
  }

  resolveAuction() {
    console.log('オークション解決開始');
    
    const selections = Array.from(this.auctionSelections.entries());
    const [player1Selection, player2Selection] = selections;
    const [p1Id, p1Data] = player1Selection;
    const [p2Id, p2Data] = player2Selection;
    
    console.log(`プレイヤー1: ${p1Id}, カード: ${p1Data.cardId}, ポイント: ${p1Data.points}`);
    console.log(`プレイヤー2: ${p2Id}, カード: ${p2Data.cardId}, ポイント: ${p2Data.points}`);
    
    const player1 = this.players.find(p => p.id === p1Id);
    const player2 = this.players.find(p => p.id === p2Id);

    if (p1Data.cardId !== p2Data.cardId) {
      console.log('🎯 異なるカードを選択 -> ハイジャック判定実行');
      // 異なるカードを選択
      this.resolveDifferentCards(player1, player2, p1Data, p2Data);
    } else {
      console.log('🎯 同じカードを選択 -> 通常競売実行');
      // 同じカードを選択
      this.resolveSameCard(player1, player2, p1Data, p2Data);
    }

    this.auctionSelections.clear();
    console.log('オークション結果表示後、プレイフェーズに移行');
    
    // オークション結果を表示する時間を設けてからフェーズ移行
    setTimeout(() => {
      console.log('タイムアウト後、startPlayingPhase()を呼び出し');
      this.startPlayingPhase();
    }, 3000); // 3秒間オークション結果を表示
  }

  resolveDifferentCards(player1, player2, p1Data, p2Data) {
    console.log('=== 異なるカードへの入札解決 ===');
    console.log('Player1 (', player1.name, '):', p1Data.points, 'IP -> カード:', p1Data.cardId);
    console.log('Player2 (', player2.name, '):', p2Data.points, 'IP -> カード:', p2Data.cardId);
    
    // ハイジャック判定
    const p1IsDouble = p1Data.points >= p2Data.points * 2;
    const p2IsDouble = p2Data.points >= p1Data.points * 2;
    
    console.log('🔍 ハイジャック判定:');
    console.log('- Player1がハイジャック可能:', p1IsDouble, `(${p1Data.points} >= ${p2Data.points * 2})`);
    console.log('- Player2がハイジャック可能:', p2IsDouble, `(${p2Data.points} >= ${p1Data.points * 2})`);

    if (p1IsDouble && !p2IsDouble) {
      // Player1がハイジャック - 両方のカードを獲得
      console.log('🔥 ハイジャック発動！Player1 (', player1.name, ') が両方のカードを獲得');
      console.log('- 自分のカード:', p1Data.cardId, 'を', p1Data.points, 'IPで獲得');
      console.log('- 相手のカード:', p2Data.cardId, 'を', p2Data.points, 'IPで横取り');
      
      // 自分のカードを自分の入札額で獲得
      this.awardCard(player1, p1Data.cardId, p1Data.points);
      // 相手のカードを相手の入札額で横取り
      this.awardCard(player1, p2Data.cardId, p2Data.points);
      
      const card1 = this.neutralField.find(c => c.fieldId === p1Data.cardId);
      const card2 = this.neutralField.find(c => c.fieldId === p2Data.cardId);
      
      // 各プレイヤーに個別の視点で結果を送信
      console.log('オークション結果送信（ハイジャック - Player1）:', {
        winner: player1.name,
        selfCard: card1 ? card1.name : 'unknown',
        hijackedCard: card2 ? card2.name : 'unknown',
        totalCost: p1Data.points + p2Data.points
      });
      
      player1.socket.emit('auction-result', {
        type: 'hijack',
        winner: player1.name,
        selfCardId: p1Data.cardId,
        selfCardInfo: card1 ? { name: card1.name, type: card1.type, manaCost: card1.manaCost } : null,
        hijackedCardId: p2Data.cardId,
        hijackedCardInfo: card2 ? { name: card2.name, type: card2.type, manaCost: card2.manaCost } : null,
        selfPointsPaid: p1Data.points,
        hijackedPointsPaid: p2Data.points,
        playerBid: p1Data.points,
        opponentBid: p2Data.points
      });
      
      player2.socket.emit('auction-result', {
        type: 'hijack',
        winner: player1.name,
        selfCardId: p1Data.cardId,
        selfCardInfo: card1 ? { name: card1.name, type: card1.type, manaCost: card1.manaCost } : null,
        hijackedCardId: p2Data.cardId,
        hijackedCardInfo: card2 ? { name: card2.name, type: card2.type, manaCost: card2.manaCost } : null,
        selfPointsPaid: p1Data.points,
        hijackedPointsPaid: p2Data.points,
        playerBid: p2Data.points,
        opponentBid: p1Data.points
      });
    } else if (p2IsDouble && !p1IsDouble) {
      // Player2がハイジャック - 両方のカードを獲得
      console.log('🔥 ハイジャック発動！Player2 (', player2.name, ') が両方のカードを獲得');
      console.log('- 自分のカード:', p2Data.cardId, 'を', p2Data.points, 'IPで獲得');
      console.log('- 相手のカード:', p1Data.cardId, 'を', p1Data.points, 'IPで横取り');
      
      // 自分のカードを自分の入札額で獲得
      this.awardCard(player2, p2Data.cardId, p2Data.points);
      // 相手のカードを相手の入札額で横取り
      this.awardCard(player2, p1Data.cardId, p1Data.points);
      
      const card1 = this.neutralField.find(c => c.fieldId === p1Data.cardId);
      const card2 = this.neutralField.find(c => c.fieldId === p2Data.cardId);
      
      // 各プレイヤーに個別の視点で結果を送信
      player1.socket.emit('auction-result', {
        type: 'hijack',
        winner: player2.name,
        selfCardId: p2Data.cardId,
        selfCardInfo: card2 ? { name: card2.name, type: card2.type, manaCost: card2.manaCost } : null,
        hijackedCardId: p1Data.cardId,
        hijackedCardInfo: card1 ? { name: card1.name, type: card1.type, manaCost: card1.manaCost } : null,
        selfPointsPaid: p2Data.points,
        hijackedPointsPaid: p1Data.points,
        playerBid: p1Data.points,
        opponentBid: p2Data.points
      });
      
      player2.socket.emit('auction-result', {
        type: 'hijack',
        winner: player2.name,
        selfCardId: p2Data.cardId,
        selfCardInfo: card2 ? { name: card2.name, type: card2.type, manaCost: card2.manaCost } : null,
        hijackedCardId: p1Data.cardId,
        hijackedCardInfo: card1 ? { name: card1.name, type: card1.type, manaCost: card1.manaCost } : null,
        selfPointsPaid: p2Data.points,
        hijackedPointsPaid: p1Data.points,
        playerBid: p2Data.points,
        opponentBid: p1Data.points
      });
    } else {
      // 通常取得
      console.log('💰 通常取得（ハイジャック条件未達成）');
      console.log('- Player1:', player1.name, 'が', p1Data.cardId, 'を', p1Data.points, 'IPで獲得');
      console.log('- Player2:', player2.name, 'が', p2Data.cardId, 'を', p2Data.points, 'IPで獲得');
      
      this.awardCard(player1, p1Data.cardId, p1Data.points);
      this.awardCard(player2, p2Data.cardId, p2Data.points);
      const card1 = this.neutralField.find(c => c.fieldId === p1Data.cardId);
      const card2 = this.neutralField.find(c => c.fieldId === p2Data.cardId);
      
      console.log('オークション結果送信（通常取得）:', {
        player1: { name: player1.name, cardName: card1?.name },
        player2: { name: player2.name, cardName: card2?.name }
      });
      
      // プレイヤー1に対する結果を送信
      player1.socket.emit('auction-result', {
        type: 'normal',
        winner: player1.name,
        cardId: p1Data.cardId,
        cardInfo: card1 ? { name: card1.name, type: card1.type, manaCost: card1.manaCost } : null,
        pointsPaid: p1Data.points,
        playerBid: p1Data.points,
        opponentBid: p2Data.points
      });
      
      // プレイヤー2に対する結果を送信
      player2.socket.emit('auction-result', {
        type: 'normal',
        winner: player2.name,
        cardId: p2Data.cardId,
        cardInfo: card2 ? { name: card2.name, type: card2.type, manaCost: card2.manaCost } : null,
        pointsPaid: p2Data.points,
        playerBid: p2Data.points,
        opponentBid: p1Data.points
      });
    }
  }

  resolveSameCard(player1, player2, p1Data, p2Data) {
    console.log('=== 同じカードへの入札解決 ===');
    console.log('対象カード:', p1Data.cardId);
    console.log('Player1 (', player1.name, '):', p1Data.points, 'IP');
    console.log('Player2 (', player2.name, '):', p2Data.points, 'IP');
    
    if (p1Data.points !== p2Data.points) {
      console.log('📊 競売開始（ポイント差あり）');
      // ポイントが異なる場合、高い方が獲得
      const winner = p1Data.points > p2Data.points ? player1 : player2;
      const loser = p1Data.points > p2Data.points ? player2 : player1;
      const winnerData = p1Data.points > p2Data.points ? p1Data : p2Data;
      
      console.log('🏆 競売結果:', winner.name, 'が', winnerData.points, 'IPで勝利');
      
      this.awardCard(winner, winnerData.cardId, winnerData.points);
      const card = this.neutralField.find(c => c.fieldId === winnerData.cardId);
      
      // 勝者に送信
      winner.socket.emit('auction-result', {
        type: 'contested',
        winner: winner.name,
        cardId: winnerData.cardId,
        cardInfo: card ? { name: card.name, type: card.type, manaCost: card.manaCost } : null,
        pointsPaid: winnerData.points,
        playerBid: winner === player1 ? p1Data.points : p2Data.points,
        opponentBid: winner === player1 ? p2Data.points : p1Data.points
      });
      
      // 敗者に送信
      loser.socket.emit('auction-result', {
        type: 'contested',
        winner: winner.name,
        cardId: winnerData.cardId,
        cardInfo: card ? { name: card.name, type: card.type, manaCost: card.manaCost } : null,
        pointsPaid: winnerData.points,
        playerBid: loser === player1 ? p1Data.points : p2Data.points,
        opponentBid: loser === player1 ? p2Data.points : p1Data.points
      });
    } else {
      // 同じポイントの場合、カードを疲労
      const card = this.neutralField.find(c => c.fieldId === p1Data.cardId);
      if (card) {
        card.isFatigued = true;
        card.fatigueRemainingTurns = 2;
      }
      
      // 両プレイヤーに送信
      const resultData = {
        type: 'tie',
        cardId: p1Data.cardId,
        cardInfo: card ? { name: card.name, type: card.type, manaCost: card.manaCost } : null,
        message: 'カードが疲労しました',
        playerBid: p1Data.points,
        opponentBid: p2Data.points
      };
      
      player1.socket.emit('auction-result', resultData);
      player2.socket.emit('auction-result', resultData);
    }
  }

  awardCard(player, cardId, pointsCost) {
    const card = this.neutralField.find(c => c.fieldId === cardId);
    if (!card) {
      console.log('⚠️ カードが見つかりません:', cardId);
      return;
    }
    
    console.log('💳 カード獲得処理:', {
      player: player.name,
      cardName: card.name,
      pointsCost: pointsCost,
      playerPointsBefore: player.points
    });

    // カードのコピーを作成してプレイヤーフィールドに追加
    const cardCopy = {
      ...card,
      fieldId: `${card.fieldId}_${player.id}`, // ユニークなIDを生成
      instanceId: `${card.fieldId}_${player.id}`, // instanceIdも同じIDを設定
      owner: player.id,
      isFatigued: true, // 獲得時に疲労
      fatigueRemainingTurns: 1
    };
    
    player.field.push(cardCopy);
    player.points -= pointsCost;

    // 中立フィールドのカードを疲労状態にする
    card.isFatigued = true;
    card.fatigueRemainingTurns = 2; // 中立フィールドでは2ターン疲労

    console.log(`✅ ${player.name}が${card.name}を獲得完了。IP: ${player.points + pointsCost} -> ${player.points} (-${pointsCost})`);

    // カード獲得時効果を発動
    this.cardEffects.triggerOnAcquire(player, cardCopy);
  }

  startPlayingPhase() {
    console.log('プレイフェーズ開始');
    this.phase = 'playing';
    
    // 新ラウンド開始：侵略回数をリセット
    this.cardEffects.startNewRound();
    console.log('侵略回数カウンターをリセットしました');
    
    // 各プレイヤーの増加IPを10にリセット
    this.players.forEach(player => {
      player.ipIncrease = 10;
      console.log(`${player.name}の増加IPを10にリセット`);
    });
    
    // 所持ポイントが多い方が先行（同点の場合は最初のプレイヤー）
    this.currentPlayerIndex = this.players[0].points > this.players[1].points ? 0 : 
                             this.players[1].points > this.players[0].points ? 1 : 0;
    
    // プレイヤーの行動フラグをリセット
    this.players.forEach(player => {
      player.hasActed = false;
    });
    
    // 敵ターン開始時効果の処理済みカードをリセット
    this.processedEnemyTurnStartCards = new Set();
    
    console.log('現在のプレイヤー:', this.players[this.currentPlayerIndex].name);
    console.log('プレイヤー1 ポイント:', this.players[0].points);
    console.log('プレイヤー2 ポイント:', this.players[1].points);
    
    // 敵ターン開始時効果を自動発動
    this.triggerEnemyTurnStartEffects();
    
    console.log('phase-changeイベントを発行');
    this.emit('phase-change', {
      phase: 'playing',
      currentPlayer: this.players[this.currentPlayerIndex].name
    });
    
    console.log('ゲーム状態をブロードキャスト');
    this.broadcastGameState();
    console.log('startPlayingPhase完了');
  }

  handleCardPlay(playerId, cardInstanceId, abilityIndex) {
    console.log('handleCardPlay 呼び出し:', { playerId, cardInstanceId, abilityIndex, phase: this.phase });
    
    if (this.phase !== 'playing') {
      console.log('プレイングフェーズではありません');
      return;
    }
    
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      console.log('プレイヤーが見つかりません');
      return;
    }
    
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      console.log('現在のプレイヤーではありません', { current: this.players[this.currentPlayerIndex].name, requestPlayer: player.name });
      return;
    }

    let card = player.field.find(c => c.instanceId === cardInstanceId);
    
    // instanceIdが未定義の場合、代替手段でカードを検索
    if (!card && !cardInstanceId) {
      console.log('cardInstanceIdが未定義のため、使用可能なカードを検索中...');
      card = player.field.find(c => !c.isFatigued && c.abilities && c.abilities[abilityIndex]);
      if (card) {
        console.log('代替検索でカードを発見:', card.name, 'instanceId:', card.instanceId);
      }
    }
    
    if (!card) {
      console.log('カードが見つかりません:', cardInstanceId);
      console.log('プレイヤーフィールド:', player.field.map(c => ({ name: c.name, instanceId: c.instanceId, isFatigued: c.isFatigued })));
      return;
    }
    
    if (card.isFatigued) {
      console.log('疲労カードはプレイできません:', card.name);
      return;
    }

    const ability = card.abilities[abilityIndex];
    if (!ability) {
      console.log('アビリティが見つかりません:', abilityIndex);
      return;
    }

    // 同じカードの所持枚数をチェック
    const cardCount = player.field.filter(c => c.id === card.id).length;
    console.log('アビリティ使用チェック:', { cardName: card.name, ability: ability.description, cost: ability.cost, cardCount });
    
    if (cardCount < ability.cost) {
      console.log('カード枚数が不足しています');
      return;
    }

    // 相手カード選択が必要な効果かチェック
    if (this.needsTargetSelection(ability)) {
      console.log('対象選択が必要な効果です');
      this.startTargetSelection(player, card, ability, card.id, abilityIndex);
      return;
    }

    // 複数選択が必要な効果かチェック
    const multiSelectionResult = this.checkNeedsMultipleSelection(player, card, ability, card.id, abilityIndex);
    if (multiSelectionResult && multiSelectionResult.needsMultipleSelection) {
      console.log('複数対象選択が必要な効果です');
      this.startMultipleTargetSelection(player, card, ability, card.id, abilityIndex, multiSelectionResult.selectionTargets);
      return;
    }

    // 効果発動
    console.log('アビリティ実行開始:', { player: player.name, card: card.name, ability: ability.description });
    const result = this.cardEffects.executeAbility(player, card, ability, card.id, abilityIndex);
    console.log('アビリティ実行結果:', result);
    
    if (result.success) {
      card.isFatigued = true; // プレイしたカードは疲労する
      
      this.emit('card-played', {
        player: player.name,
        cardName: card.name,
        ability: ability.description,
        result: result.message
      });

      console.log('アビリティ使用成功:', { player: player.name, card: card.name, result: result.message });

      // 侵略効果の場合、相手の反応効果をトリガー
      if (ability.type === '侵略') {
        console.log('侵略効果成功後、反応効果をチェック開始（通常版）');
        const opponent = this.players.find(p => p.id !== player.id);
        console.log('対象相手プレイヤー:', opponent?.name);
        this.triggerReactionEffects(opponent, ability, player);
      }

      // 勝利条件チェック - 勝利効果使用時点で勝利
      if (ability.type === '勝利') {
        console.log('勝利条件発動!');
        this.endGame(player);
        return;
      }
    } else {
      console.log('アビリティ使用失敗:', result.message);
      
      // 未実装効果の場合、特別な通知を送信
      if (result.unimplemented) {
        console.warn('🚧 未実装効果が使用されました:', result.unimplemented);
        this.emit('unimplemented-effect', {
          player: player.name,
          cardName: card.name,
          ability: ability,
          unimplementedInfo: result.unimplemented,
          timestamp: new Date().toISOString()
        });
      }
    }

    this.broadcastGameState();
  }

  // 対象選択が必要かチェック
  needsTargetSelection(ability) {
    const description = ability.description;
    
    // ライオンの特殊効果は複数選択なので除外
    if (description.includes('追放されたカードを好きなだけ敵フィールドに置く')) {
      return false;
    }
    
    return description.includes('疲労させる') || 
           description.includes('追放する') || 
           description.includes('選択') ||
           (description.includes('相手') && (description.includes('カード') || description.includes('フィールド')));
  }

  // 複数選択が必要かチェック
  checkNeedsMultipleSelection(player, card, ability, cardId, abilityIndex) {
    // ライオンの特殊効果をチェック
    if (ability.description.includes('追放されたカードを好きなだけ敵フィールドに置く')) {
      // CardEffectsから選択対象情報を取得
      const testResult = this.cardEffects.executeAbilityWithTarget(player, card, ability, null, cardId, abilityIndex);
      
      if (testResult && testResult.needsMultipleSelection) {
        return {
          needsMultipleSelection: true,
          selectionTargets: testResult.selectionTargets
        };
      }
    }
    
    return null;
  }

  // 対象選択開始
  startTargetSelection(player, card, ability, cardId, abilityIndex) {
    this.phase = 'target-selection';
    this.pendingAbility = { player, card, ability, cardId, abilityIndex };
    
    const opponent = this.players.find(p => p.id !== player.id);
    const validTargets = this.getValidTargets(ability, opponent);
    
    if (validTargets.length === 0) {
      console.log('有効な対象がありません');
      this.phase = 'playing';
      this.pendingAbility = null;
      player.socket.emit('no-valid-targets', {
        message: '対象となるカードがありません'
      });
      return;
    }

    // プレイヤーに対象選択を要求
    player.socket.emit('select-target', {
      message: `${ability.description}の対象を選択してください`,
      ability: ability,
      validTargets: validTargets.map(target => ({
        fieldId: target.fieldId,
        name: target.name,
        isFatigued: target.isFatigued
      }))
    });
    
    console.log('対象選択開始:', { 
      ability: ability.description, 
      abilityType: ability.type,
      targetCount: validTargets.length,
      player: player.name
    });
  }

  // 複数対象選択開始
  startMultipleTargetSelection(player, card, ability, cardId, abilityIndex, selectionTargets) {
    this.phase = 'multiple-target-selection';
    this.pendingAbility = { player, card, ability, cardId, abilityIndex };
    
    console.log('複数対象選択開始:', {
      ability: ability.description,
      targetCount: selectionTargets ? selectionTargets.length : 0,
      player: player.name,
      targets: selectionTargets ? selectionTargets.map(t => t.name) : []
    });
    
    // プレイヤーに複数対象選択を要求
    player.socket.emit('select-multiple-targets', {
      message: `${ability.description}の対象を選択してください（複数選択可能）`,
      ability: ability,
      selectionTargets: selectionTargets || []
    });
    
    this.broadcastGameState();
  }

  // 有効な対象を取得
  getValidTargets(ability, opponent) {
    const description = ability.description;
    let targets = [];
    
    if (description.includes('敵のアリを疲労させる')) {
      // アリ（ant）かつアクティブなカードが対象
      targets = opponent.field.filter(card => card.id === 'ant' && !card.isFatigued);
    } else if (description.includes('疲労させる') && (description.includes('1匹') || description.includes('1体'))) {
      // アクティブな相手カードが対象（条件付きも含む）
      targets = opponent.field.filter(card => !card.isFatigued);
    } else if (description.includes('追放する') && description.includes('疲労')) {
      // 疲労した相手カードが対象
      targets = opponent.field.filter(card => card.isFatigued);
    } else if (description.includes('追放する') && (description.includes('1匹') || description.includes('1体'))) {
      // 敵の任意のカードが追放対象（疲労状態に関係なく）
      targets = [...opponent.field];
    } else if (description.includes('相手') && description.includes('カード')) {
      // 相手の全カードが対象
      targets = [...opponent.field];
    }
    
    console.log('有効な対象を検索:', { 
      description, 
      opponentFieldCount: opponent.field.length,
      validTargetsCount: targets.length,
      targets: targets.map(t => ({ name: t.name, id: t.id, isFatigued: t.isFatigued }))
    });
    
    return targets;
  }

  // 対象選択処理
  handleTargetSelection(playerId, targetFieldId) {
    console.log('対象選択受信:', { playerId, targetFieldId });
    
    // 通常の対象選択（侵略・強化効果等）
    if (this.phase === 'target-selection' && this.pendingAbility) {
      return this.handleNormalTargetSelection(playerId, targetFieldId);
    }
    
    // 敵ターン開始時効果の対象選択
    if (this.pendingTargetSelection && this.pendingTargetSelection.type === 'enemyTurnStart') {
      return this.handleEnemyTurnStartTargetSelection(playerId, targetFieldId);
    }
    
    console.log('対象選択処理対象外です');
  }

  // 対象選択キャンセル処理
  handleCancelTargetSelection(playerId) {
    console.log('対象選択キャンセル受信:', { playerId });
    
    // 通常の対象選択のキャンセル
    if (this.phase === 'target-selection' && this.pendingAbility) {
      const { player } = this.pendingAbility;
      if (player.id === playerId) {
        console.log('対象選択をキャンセルしました');
        this.phase = 'playing';
        this.pendingAbility = null;
        this.broadcastGameState();
        
        player.socket.emit('target-selection-cancelled', {
          message: '対象選択をキャンセルしました'
        });
        return;
      }
    }
    
    // 敵ターン開始時効果の対象選択のキャンセル
    if (this.pendingTargetSelection && this.pendingTargetSelection.type === 'enemyTurnStart') {
      const { playerId: expectedPlayerId } = this.pendingTargetSelection;
      if (playerId === expectedPlayerId) {
        console.log('敵ターン開始時効果の対象選択をキャンセルしました');
        this.pendingTargetSelection = null;
        
        // 残りの敵ターン開始時効果があれば継続処理
        this.triggerEnemyTurnStartEffects();
        this.broadcastGameState();
        return;
      }
    }
    
    console.log('キャンセル対象の対象選択が見つかりません');
  }

  // 複数対象選択キャンセル処理
  handleCancelMultipleTargetSelection(playerId) {
    console.log('複数対象選択キャンセル受信:', { playerId });
    
    if (this.phase === 'multiple-target-selection' && this.pendingAbility) {
      const { player } = this.pendingAbility;
      if (player.id === playerId) {
        console.log('複数対象選択をキャンセルしました');
        this.phase = 'playing';
        this.pendingAbility = null;
        this.broadcastGameState();
        
        player.socket.emit('multiple-target-selection-cancelled', {
          message: '複数対象選択をキャンセルしました'
        });
        return;
      }
    }
    
    console.log('キャンセル対象の複数対象選択が見つかりません');
  }

  // 通常の対象選択処理
  handleNormalTargetSelection(playerId, targetFieldId) {
    const { player, card, ability, cardId, abilityIndex } = this.pendingAbility;
    
    if (player.id !== playerId) {
      console.log('対象選択権限がありません');
      return;
    }

    const opponent = this.players.find(p => p.id !== player.id);
    const targetCard = opponent.field.find(c => c.fieldId === targetFieldId);

    if (!targetCard) {
      console.log('対象カードが見つかりません');
      return;
    }

    // 対象が有効かチェック
    const validTargets = this.getValidTargets(ability, opponent);
    if (!validTargets.find(t => t.fieldId === targetFieldId)) {
      console.log('無効な対象です');
      return;
    }

    console.log('対象選択完了:', { target: targetCard.name });

    // 効果を実行（対象指定付き）
    const result = this.cardEffects.executeAbilityWithTarget(player, card, ability, targetCard, cardId, abilityIndex);
    console.log('対象指定効果実行結果:', result);
    
    if (result.success) {
      card.isFatigued = true;
      
      this.emit('card-played', {
        player: player.name,
        cardName: card.name,
        ability: ability.description,
        target: targetCard.name,
        result: result.message
      });
      
      console.log('対象指定効果使用成功:', { 
        player: player.name, 
        card: card.name, 
        target: targetCard.name,
        result: result.message 
      });

      // 侵略効果の場合、相手の反応効果をトリガー
      if (ability.type === '侵略') {
        console.log('侵略効果成功後、反応効果をチェック開始（対象指定版）');
        const opponent = this.players.find(p => p.id !== player.id);
        console.log('対象相手プレイヤー:', opponent?.name);
        this.triggerReactionEffects(opponent, ability, player);
      }
    } else {
      console.log('対象指定効果使用失敗:', result.message);
      
      // 未実装効果の場合、特別な通知を送信
      if (result.unimplemented) {
        console.warn('🚧 未実装効果が使用されました（対象指定版）:', result.unimplemented);
        this.emit('unimplemented-effect', {
          player: player.name,
          cardName: card.name,
          ability: ability,
          target: targetCard.name,
          unimplementedInfo: result.unimplemented,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // フェーズを戻す
    this.phase = 'playing';
    this.pendingAbility = null;
    
    this.broadcastGameState();
  }

  // 敵ターン開始時効果の対象選択処理
  handleEnemyTurnStartTargetSelection(playerId, targetFieldId) {
    console.log('敵ターン開始時効果の対象選択処理:', { playerId, targetFieldId });
    
    const { playerId: expectedPlayerId, card, ability, validTargets } = this.pendingTargetSelection;
    
    if (playerId !== expectedPlayerId) {
      console.log('対象選択権限がありません（敵ターン開始時）');
      return;
    }

    // 対象カードを探す
    let targetCard = null;
    for (const player of this.players) {
      const foundCard = player.field.find(c => c.fieldId === targetFieldId);
      if (foundCard) {
        targetCard = foundCard;
        break;
      }
    }

    if (!targetCard) {
      console.log('対象カードが見つかりません（敵ターン開始時）');
      return;
    }

    // 対象が有効かチェック
    if (!validTargets.find(t => t.fieldId === targetFieldId)) {
      console.log('無効な対象です（敵ターン開始時）');
      return;
    }

    console.log('敵ターン開始時効果の対象選択完了:', { target: targetCard.name });

    // 効果を実行（対象指定付き）
    const player = this.players.find(p => p.id === playerId);
    const result = this.cardEffects.executeAbilityWithTarget(player, card, ability, targetCard);
    console.log('敵ターン開始時効果実行結果:', result);
    
    if (result.success) {
      this.emit('message', {
        text: `${player.name}の${card.name}: ${result.message}`,
        type: 'info'
      });
      
      console.log('敵ターン開始時効果使用成功:', { 
        player: player.name, 
        card: card.name, 
        target: targetCard.name,
        result: result.message 
      });
      
      // 処理済みとしてマーク
      if (!this.processedEnemyTurnStartCards) {
        this.processedEnemyTurnStartCards = new Set();
      }
      this.processedEnemyTurnStartCards.add(card.fieldId);
    } else {
      console.log('敵ターン開始時効果使用失敗:', result.message);
    }
    
    // 対象選択完了、待機状態を解除
    this.pendingTargetSelection = null;
    
    // 残りの敵ターン開始時効果があれば継続処理
    this.triggerEnemyTurnStartEffects();
    
    this.broadcastGameState();
  }

  // 複数対象選択処理
  handleMultipleTargetSelection(playerId, selectedTargetIds) {
    console.log('複数対象選択受信:', { playerId, selectedTargetIds });
    
    if (this.phase !== 'multiple-target-selection' || !this.pendingAbility) {
      console.log('複数対象選択フェーズではありません');
      return;
    }
    
    const { player, card, ability, cardId, abilityIndex } = this.pendingAbility;
    
    if (player.id !== playerId) {
      console.log('複数対象選択権限がありません');
      return;
    }
    
    if (!selectedTargetIds || selectedTargetIds.length === 0) {
      console.log('選択された対象がありません');
      return;
    }
    
    // 選択された対象を検証して取得
    const selectedTargets = [];
    selectedTargetIds.forEach(targetId => {
      if (this.exileField) {
        const exiledCard = this.exileField.find(card => 
          card.instanceId === targetId || 
          card.fieldId === targetId || 
          card.id === targetId
        );
        if (exiledCard) {
          selectedTargets.push({
            id: targetId,
            name: exiledCard.name,
            type: 'exile',
            card: exiledCard
          });
        }
      }
    });
    
    console.log('選択対象検証完了:', {
      requestedCount: selectedTargetIds.length,
      validCount: selectedTargets.length,
      targets: selectedTargets.map(t => t.name)
    });

    // 効果を実行（複数対象選択付き）
    const result = this.cardEffects.executeAbilityWithMultipleTargets(
      player, card, ability, selectedTargets, cardId, abilityIndex
    );
    console.log('複数対象選択効果実行結果:', result);
    
    if (result.success) {
      card.isFatigued = true;
      
      this.emit('card-played', {
        player: player.name,
        cardName: card.name,
        ability: ability.description,
        targets: selectedTargets.map(t => t.name),
        result: result.message
      });
      
      console.log('複数対象選択効果使用成功:', { 
        player: player.name, 
        card: card.name, 
        targets: selectedTargets.map(t => t.name),
        result: result.message 
      });
    } else {
      console.log('複数対象選択効果使用失敗:', result.message);
    }
    
    // フェーズを戻す
    this.phase = 'playing';
    this.pendingAbility = null;
    
    this.broadcastGameState();
  }

  // 反応カード選択処理
  handleReactionSelection(playerId, reactionFieldId) {
    console.log('反応カード選択受信:', { playerId, reactionFieldId });
    
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      console.log('プレイヤーが見つかりません');
      return;
    }

    // 反応カードを探す
    const reactionCard = player.field.find(c => 
      (c.fieldId === reactionFieldId || c.instanceId === reactionFieldId) && 
      !c.isFatigued && 
      c.abilities && 
      c.abilities.some(a => a.type === '反応')
    );

    if (!reactionCard) {
      console.log('反応カードが見つかりません:', reactionFieldId);
      return;
    }

    // 反応アビリティを実行
    const reactionAbility = reactionCard.abilities.find(a => a.type === '反応');
    if (reactionAbility) {
      console.log('反応効果実行:', { cardName: reactionCard.name, ability: reactionAbility.description });
      
      const result = this.cardEffects.executeAbility(player, reactionCard, reactionAbility);
      
      if (result.success) {
        // 反応カードを疲労させる
        reactionCard.isFatigued = true;
        
        this.emit('reaction-triggered', {
          player: player.name,
          cardName: reactionCard.name,
          ability: reactionAbility.description,
          result: result.message,
          trigger: '手動発動'
        });
        
        console.log('手動反応発動成功:', { player: player.name, card: reactionCard.name, result: result.message });
      } else {
        console.log('手動反応発動失敗:', result.message);
      }
    }

    this.broadcastGameState();
  }

  handlePassTurn(playerId) {
    console.log('=== handlePassTurn 開始 ===');
    console.log('フェーズ:', this.phase);
    console.log('playerId:', playerId);
    console.log('現在のプレイヤーIndex:', this.currentPlayerIndex);
    console.log('現在のプレイヤーID:', this.players[this.currentPlayerIndex]?.id);
    
    if (this.phase !== 'playing') {
      console.log('プレイングフェーズではないためパス無効');
      return;
    }
    
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      console.log('プレイヤーが見つかりません');
      return;
    }
    
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      console.log('現在のプレイヤーではないためパス無効');
      return;
    }

    console.log(`${player.name}がパスしました`);
    
    // プレイヤーがパスしたことをマーク
    player.hasActed = true;
    
    // 両プレイヤーがパスしたかチェック
    const allPassed = this.players.every(p => p.hasActed);
    console.log('パス状況:', this.players.map(p => ({ name: p.name, hasActed: p.hasActed })));
    
    if (allPassed) {
      // 両プレイヤーがパスした場合、ターン終了してオークションフェーズへ
      console.log('両プレイヤーがパス。ターン終了してオークションフェーズへ');
      this.endTurn();
    } else {
      // まだパスしていないプレイヤーががいる場合、次のプレイヤーに交代
      console.log('次のプレイヤーに交代');
      this.nextPlayerTurn();
    }
  }

  // デバッグ獲得処理
  handleDebugAcquire(playerId, cardId) {
    console.log('デバッグ獲得処理:', { playerId, cardId });
    
    if (this.phase !== 'auction') {
      console.log('オークションフェーズではないためデバッグ獲得無効');
      return;
    }
    
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      console.log('プレイヤーが見つかりません');
      return;
    }

    // 中立フィールドからカードを探す
    const neutralCard = this.neutralField.find(c => c.fieldId === cardId);
    if (!neutralCard) {
      console.log('中立フィールドにカードが見つかりません:', cardId);
      return;
    }

    // 新しいインスタンスを作成
    const newCard = {
      ...neutralCard,
      instanceId: `${neutralCard.id}_${Date.now()}_${player.id}`,
      fieldId: `${neutralCard.id}_${Date.now()}_${player.id}`,
      isFatigued: false // デバッグ獲得時は疲労しない
    };

    // プレイヤーのフィールドに追加
    player.field.push(newCard);

    // 獲得時効果をチェック
    const onAcquireAbilities = newCard.abilities?.filter(ability => ability.type === '獲得時') || [];
    onAcquireAbilities.forEach(ability => {
      console.log('獲得時効果チェック:', { cardName: newCard.name, isFatigued: newCard.isFatigued, abilities: onAcquireAbilities.length });
      
      // IP獲得効果をチェック
      if (ability.description.includes('IP') || ability.description.includes('ポイント')) {
        const ipMatch = ability.description.match(/[＋+](\d+)IP/) || 
                       ability.description.match(/IP[＋+](\d+)/) || 
                       ability.description.match(/(\d+)IP獲得/);
        if (ipMatch) {
          const ipGain = parseInt(ipMatch[1]);
          player.points += ipGain;
          console.log(`デバッグ獲得時効果: ${player.name}が${ipGain}IP獲得`);
        }
      }
    });

    console.log(`デバッグ獲得完了: ${player.name}が${newCard.name}を獲得`);
    
    // 全プレイヤーに結果を送信
    this.emit('auction-result', {
      type: 'debug-acquire',
      player: player.name,
      cardName: newCard.name
    });

    this.broadcastGameState();
  }

  nextPlayerTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 2;
    
    console.log(`ターン交代: ${this.players[this.currentPlayerIndex].name}のターン開始`);
    
    // 敵ターン開始時効果をトリガー（処理済みカードをリセットしてから）
    this.processedEnemyTurnStartCards = new Set();
    this.triggerEnemyTurnStartEffects();
    
    this.emit('turn-change', {
      currentPlayer: this.players[this.currentPlayerIndex].name
    });
    this.broadcastGameState();
  }

  endTurn() {
    console.log('endTurn呼び出し - ターン終了処理開始');
    this.turn++;
    
    // ターン開始時処理
    this.players.forEach(player => {
      // 増加IPに基づいてポイント支給
      player.points += player.ipIncrease || 10;
      player.hasActed = false; // 行動フラグをリセット
      
      // 増加IPを10にリセット
      player.ipIncrease = 10;
      console.log(`${player.name}の増加IPを10にリセット`);
      
      // カード疲労回復
      player.field.forEach(card => {
        if (card.isFatigued) {
          card.isFatigued = false;
        }
      });
    });

    // 中立カード疲労回復
    this.neutralField.forEach(card => {
      if (card.isFatigued) {
        card.fatigueRemainingTurns--;
        if (card.fatigueRemainingTurns <= 0) {
          card.isFatigued = false;
        }
      }
    });

    console.log(`ターン${this.turn}終了。オークションフェーズに移行`);
    this.phase = 'auction';
    this.emit('turn-end', {
      turn: this.turn,
      message: 'ターン終了。オークションフェーズが始まります。'
    });
    
    this.broadcastGameState();
  }

  endGame(winner) {
    console.log('🏁 ゲーム終了処理開始:', { 
      winnerName: winner.name, 
      winnerId: winner.id,
      currentPhase: this.phase 
    });
    
    this.phase = 'ended';
    
    console.log('📡 gameEndイベント送信:', { 
      winner: winner.name, 
      message: `${winner.name}の勝利！` 
    });
    
    this.emit('gameEnd', {
      winner: winner.name,
      message: `${winner.name}の勝利！`
    });
    
    console.log('✅ ゲーム終了処理完了');
  }

  handlePlayerDisconnect(playerId) {
    const disconnectedPlayer = this.players.find(p => p.id === playerId);
    const remainingPlayer = this.players.find(p => p.id !== playerId);
    
    if (remainingPlayer) {
      remainingPlayer.socket.emit('opponent-disconnected', {
        message: '相手プレイヤーが切断しました。'
      });
    }
  }

  broadcastGameState() {
    console.log('ゲーム状態配信開始 - フェーズ:', this.phase);
    this.players.forEach(player => {
      const gameState = this.getGameStateForPlayer(player);
      console.log(`${player.name}にゲーム状態送信:`, {
        status: gameState.status,
        phase: gameState.phase,
        turn: gameState.turn
      });
      player.socket.emit('gameState', gameState);
    });
  }

  getGameStateForPlayer(player) {
    const opponent = this.players.find(p => p.id !== player.id);
    
    const gameState = {
      status: this.phase === 'waiting' ? 'waiting' : 'playing',
      turn: this.turn,
      phase: this.phase,
      currentPlayer: this.phase === 'playing' ? this.players[this.currentPlayerIndex].name : null,
      players: {
        [player.id]: {
          name: player.name,
          ip: player.points,
          ipIncrease: 10, // 毎ターンの増加IP
          field: player.field
        }
      },
      neutralField: this.neutralField,
      exileField: this.exileField
    };

    // 対戦相手ががいる場合のみ追加
    if (opponent) {
      gameState.players[opponent.id] = {
        name: opponent.name,
        ip: opponent.points,
        ipIncrease: 10, // 相手の増加IP
        field: opponent.field.map(card => ({
          ...card,
          abilities: [] // 相手のカード詳細は隠す
        }))
      };
    }

    return gameState;
  }

  emit(event, data) {
    this.players.forEach(player => {
      player.socket.emit(event, data);
    });
  }

  // 敵ターン開始時効果を自動発動
  triggerEnemyTurnStartEffects() {
    console.log('敵ターン開始時効果チェック開始');
    
    // 現在のプレイヤー（ターンプレイヤー）を取得
    const currentPlayer = this.players[this.currentPlayerIndex];
    const opponent = this.players.find(p => p.id !== currentPlayer.id);
    
    console.log(`現在のターン: ${currentPlayer.name}, 敵ターン開始時効果を持つプレイヤー: ${opponent.name}`);
    
    if (!opponent || !opponent.field) return;
    
    // 処理済みカードを追跡するプロパティを初期化（ターン開始時のみ）
    if (!this.processedEnemyTurnStartCards) {
      this.processedEnemyTurnStartCards = new Set();
    }
    
    // 相手プレイヤーの敵ターン開始時効果のみをチェック（未処理のもの）
    const enemyTurnStartCards = opponent.field.filter(card => 
      card.abilities && 
      card.abilities.some(ability => ability.type === '敵ターン開始時') &&
      !card.isFatigued &&
      !this.processedEnemyTurnStartCards.has(card.fieldId)
    );
    
    console.log(`${opponent.name}の敵ターン開始時効果を持つカード:`, enemyTurnStartCards.map(c => c.name));
    
    // 対象選択が必要な効果が見つかった場合、最初の1つだけ処理
    for (let card of enemyTurnStartCards) {
      const enemyTurnStartAbilities = card.abilities.filter(ability => ability.type === '敵ターン開始時');
      
      for (let ability of enemyTurnStartAbilities) {
        console.log('敵ターン開始時効果発動:', { 
          プレイヤー: opponent.name,
          カード: card.name, 
          効果: ability.description 
        });
        
        const result = this.cardEffects.executeAbility(opponent, card, ability);
        
        if (result.success) {
          this.emit('message', {
            text: `${opponent.name}の${card.name}: ${result.message}`,
            type: 'info'
          });
          
          // 処理済みとしてマーク
          this.processedEnemyTurnStartCards.add(card.fieldId);
        } else if (result.needsTarget) {
          // 対象選択が必要な場合、待機状態に設定
          console.log('敵ターン開始時効果で対象選択が必要:', {
            playerName: opponent.name,
            cardName: card.name,
            abilityDescription: ability.description,
            validTargets: result.validTargets
          });
          
          this.pendingTargetSelection = {
            playerId: opponent.id,
            card: card,
            ability: ability,
            validTargets: result.validTargets,
            type: 'enemyTurnStart'
          };
          
          // プレイヤーに対象選択を要求
          console.log('🎯 対象選択要求送信:', { 
            playerId: opponent.id, 
            socketId: opponent.socket?.id,
            message: result.message,
            validTargetsCount: result.validTargets?.length 
          });
          
          opponent.socket.emit('request-target-selection', {
            message: result.message,
            validTargets: result.validTargets,
            cardName: card.name,
            abilityDescription: ability.description
          });
          
          console.log('✅ request-target-selectionイベント送信完了');
          
          return; // 対象選択待ちのため、他の処理は一時停止
        } else if (!result.success) {
          console.log('敵ターン開始時効果実行失敗:', result.message);
          // 失敗した場合も処理済みとしてマーク
          this.processedEnemyTurnStartCards.add(card.fieldId);
        }
      }
    }
  }

  // 反応効果をトリガー
  triggerReactionEffects(player, invasionAbility, attacker) {
    if (!player || !player.field) return;

    console.log('反応効果チェック開始:', { 
      player: player.name, 
      侵略効果: invasionAbility.description,
      攻撃者: attacker.name 
    });

    // プレイヤーのフィールドから反応効果を持つカードを検索
    const reactionCards = player.field.filter(card => 
      card.abilities && 
      card.abilities.some(ability => ability.type === '反応') &&
      !card.isFatigued // 疲労していないカードのみ
    );

    console.log('反応効果を持つカード:', reactionCards.map(c => c.name));

    reactionCards.forEach(card => {
      const reactionAbilities = card.abilities.filter(ability => ability.type === '反応');
      
      reactionAbilities.forEach(ability => {
        console.log('反応効果発動:', { 
          カード: card.name, 
          効果: ability.description,
          発動者: player.name 
        });

        // 反応効果を実行
        const result = this.cardEffects.executeAbility(player, card, ability);
        
        if (result.success) {
          // 反応効果は疲労しない（カードの説明による）
          if (!ability.description.includes('疲労')) {
            card.isFatigued = false;
          }

          this.emit('reaction-triggered', {
            player: player.name,
            cardName: card.name,
            ability: ability.description,
            result: result.message,
            trigger: `${attacker.name}の${invasionAbility.description}`
          });

          console.log('反応効果発動成功:', { 
            プレイヤー: player.name, 
            カード: card.name, 
            結果: result.message 
          });
        }
      });
    });

    // 反応効果発動後にゲーム状態をブロードキャスト
    if (reactionCards.length > 0) {
      this.broadcastGameState();
    }
  }

  // デバッグ機能: ゲーム状態の保存
  saveGameState() {
    const gameState = {
      id: this.id,
      players: this.players.map(player => ({
        id: player.id,
        name: player.name,
        index: player.index,
        points: player.points,
        ipIncrease: player.ipIncrease,
        field: player.field.map(card => ({
          // カードの完全な情報を保存
          ...card,
          instanceId: card.instanceId,
          fieldId: card.fieldId,
          isFatigued: card.isFatigued,
          fatigueRemainingTurns: card.fatigueRemainingTurns || 0,
          // 基本情報も確実に保存
          id: card.id,
          name: card.name,
          number: card.number,
          abilities: card.abilities,
          traits: card.traits || []
        })),
        isReady: player.isReady,
        hasActed: player.hasActed,
        // プレイヤー詳細情報の追加
        socketId: player.socket ? player.socket.id : null,
        connectionTime: player.connectionTime || new Date().toISOString(),
        playerType: player.playerType || 'human' // human / ai / debug
      })),
      neutralField: this.neutralField.map(card => ({
        ...card,
        fieldId: card.fieldId,
        isFatigued: card.isFatigued,
        fatigueRemainingTurns: card.fatigueRemainingTurns || 0,
        // 中立カードの詳細情報
        nextRecoveryTurn: card.isFatigued ? (this.turn + (card.fatigueRemainingTurns || 1)) : null,
        wasAcquiredThisTurn: card.wasAcquiredThisTurn || false,
        auctionHistory: card.auctionHistory || [],
        // 基本情報も確実に保存
        id: card.id,
        name: card.name,
        number: card.number,
        abilities: card.abilities,
        traits: card.traits || []
      })),
      exileField: this.exileField.map(card => ({
        ...card,
        fieldId: card.fieldId,
        isFatigued: card.isFatigued,
        fatigueRemainingTurns: card.fatigueRemainingTurns || 0,
        // 追放カードの詳細情報
        exiledTurn: card.exiledTurn || this.turn,
        exiledBy: card.exiledBy || null,
        originalOwner: card.originalOwner || null,
        // 基本情報も確実に保存
        id: card.id,
        name: card.name,
        number: card.number,
        abilities: card.abilities,
        traits: card.traits || []
      })),
      turn: this.turn,
      phase: this.phase,
      currentPlayerIndex: this.currentPlayerIndex,
      auctionSelections: Array.from(this.auctionSelections.entries()),
      
      // ゲーム詳細情報の追加
      gameMode: this.gameMode || 'standard',
      gameStartTime: this.gameStartTime || new Date().toISOString(),
      lastActivityTime: new Date().toISOString(),
      
      // ラウンド・ターン情報
      roundInfo: {
        currentRound: Math.ceil(this.turn / 2), // 2ターンで1ラウンド
        turnsInCurrentRound: this.turn % 2 === 0 ? 2 : 1,
        totalTurnsPlayed: this.turn
      },
      
      // カード効果状態情報
      cardEffectStates: {
        invasionCounts: this.cardEffects ? this.cardEffects.invasionCount || {} : {},
        processedEnemyTurnStartCards: this.processedEnemyTurnStartCards ? Array.from(this.processedEnemyTurnStartCards) : [],
        pendingTargetSelection: this.pendingTargetSelection ? {
          playerId: this.pendingTargetSelection.playerId,
          cardId: this.pendingTargetSelection.card?.fieldId,
          abilityDescription: this.pendingTargetSelection.ability?.description,
          selectionType: this.pendingTargetSelection.type
        } : null
      },
      
      // フィールド統計情報
      fieldStatistics: {
        totalCardsInGame: (this.players[0]?.field?.length || 0) + (this.players[1]?.field?.length || 0) + this.neutralField.length + this.exileField.length,
        fatigueStatus: {
          player1Fatigued: this.players[0]?.field?.filter(c => c.isFatigued).length || 0,
          player2Fatigued: this.players[1]?.field?.filter(c => c.isFatigued).length || 0,
          neutralFatigued: this.neutralField.filter(c => c.isFatigued).length,
          exileFatigued: this.exileField.filter(c => c.isFatigued).length
        }
      },
      
      timestamp: new Date().toISOString(),
      description: `Turn ${this.turn}, Phase: ${this.phase}, Current Player: ${this.players[this.currentPlayerIndex]?.name}`,
      
      debugInfo: {
        saveMethod: 'enhanced_debug_save',
        totalSaveSize: JSON.stringify({}).length,  // Will be calculated below
        detailedStateIncluded: true,
        neutralCardRecoveryTracking: true,
        enhancedPlayerPersistence: true,
        fatigueDetailsAvailable: true
      }
    };

    // サイズ計算（自分自身を含まないように）
    gameState.debugInfo.totalSaveSize = JSON.stringify(gameState).length;

    // デバッグ用のサマリー情報をログ出力
    console.log('=== デバッグ保存 詳細情報 ===');
    console.log(`ゲームID: ${this.id}`);
    console.log(`現在のターン: ${this.turn} (ラウンド ${Math.ceil(this.turn / 2)})`);
    console.log(`フェーズ: ${this.phase}`);
    console.log(`現在のプレイヤー: ${this.players[this.currentPlayerIndex]?.name || 'なし'}`);
    
    // 中立カードの回復ターン情報
    const fatiggedNeutralCards = this.neutralField.filter(c => c.isFatigued);
    if (fatiggedNeutralCards.length > 0) {
      console.log('--- 中立カードの疲労状態と回復ターン ---');
      fatiggedNeutralCards.forEach(card => {
        const recoveryTurn = this.turn + (card.fatigueRemainingTurns || 1);
        console.log(`${card.name} (${card.number}): ターン${recoveryTurn}に回復予定 (残り${card.fatigueRemainingTurns || 1}ターン)`);
      });
    } else {
      console.log('--- 中立カードの疲労状態 ---');
      console.log('疲労している中立カードはありません');
    }
    
    // プレイヤーカードの疲労状態
    this.players.forEach((player, idx) => {
      const fatigdPlayerCards = player.field.filter(c => c.isFatigued);
      if (fatigdPlayerCards.length > 0) {
        console.log(`--- ${player.name}の疲労カード ---`);
        fatigdPlayerCards.forEach(card => {
          const recoveryTurn = this.turn + (card.fatigueRemainingTurns || 1);
          console.log(`${card.name} (${card.number}): ターン${recoveryTurn}に回復予定 (残り${card.fatigueRemainingTurns || 1}ターン)`);
        });
      }
    });
    
    // 侵略カウント情報
    if (this.cardEffects && this.cardEffects.invasionCount) {
      console.log('--- 侵略カウント ---');
      Object.entries(this.cardEffects.invasionCount).forEach(([playerId, count]) => {
        const player = this.players.find(p => p.id === playerId);
        console.log(`${player?.name || playerId}: ${count}回`);
      });
    }
    
    console.log(`保存データサイズ: ${(gameState.debugInfo.totalSaveSize / 1024).toFixed(2)} KB`);
    console.log('========================');

    return gameState;
  }

  // デバッグ機能: ゲーム状態の復元
  restoreGameState(savedState) {
    try {
      const isEnhancedSave = savedState.debugInfo?.detailedStateIncluded || false;
      
      console.log('🔄 ゲーム状態復元開始:', {
        savedGameId: savedState.id,
        savedTurn: savedState.turn,
        savedPhase: savedState.phase,
        playersCount: savedState.players.length,
        neutralFieldCount: savedState.neutralField.length,
        exileFieldCount: savedState.exileField.length,
        enhancedSave: isEnhancedSave,
        saveSize: savedState.debugInfo?.totalSaveSize ? `${(savedState.debugInfo.totalSaveSize / 1024).toFixed(2)} KB` : 'Unknown'
      });

      this.id = savedState.id;
      this.turn = savedState.turn;
      this.phase = 'auction'; // 復元後は常にオークションフェーズに設定
      this.currentPlayerIndex = savedState.currentPlayerIndex;
      
      // 拡張ゲーム情報の復元
      if (savedState.gameMode) {
        this.gameMode = savedState.gameMode;
      }
      if (savedState.gameStartTime) {
        this.gameStartTime = savedState.gameStartTime;
      }
      
      // カード効果状態の復元
      if (savedState.cardEffectStates) {
        if (this.cardEffects && savedState.cardEffectStates.invasionCounts) {
          this.cardEffects.invasionCount = savedState.cardEffectStates.invasionCounts;
          console.log('✅ 侵略カウント復元:', this.cardEffects.invasionCount);
        }
        if (savedState.cardEffectStates.processedEnemyTurnStartCards) {
          this.processedEnemyTurnStartCards = new Set(savedState.cardEffectStates.processedEnemyTurnStartCards);
        }
      }
      
      // プレイヤー状態の復元（プレイヤー名を統一）
      savedState.players.forEach((savedPlayer, index) => {
        if (this.players[index]) {
          const currentPlayer = this.players[index];
          
          // socketなどの参照を保持しつつ、状態を復元
          currentPlayer.id = savedPlayer.id;
          currentPlayer.name = `player${index + 1}`; // プレイヤー名を統一
          currentPlayer.index = savedPlayer.index || index;
          currentPlayer.points = savedPlayer.points;
          currentPlayer.ipIncrease = savedPlayer.ipIncrease;
          currentPlayer.isReady = false; // 復元後は再度準備状態にリセット
          currentPlayer.hasActed = false; // 行動フラグもリセット
          
          // 拡張プレイヤー情報の復元
          if (savedPlayer.playerType) {
            currentPlayer.playerType = savedPlayer.playerType;
          }
          if (savedPlayer.connectionTime) {
            currentPlayer.connectionTime = savedPlayer.connectionTime;
          }
          
          // フィールドの完全復元
          currentPlayer.field = savedPlayer.field.map(card => ({
            ...card,
            instanceId: card.instanceId,
            fieldId: card.fieldId,
            isFatigued: card.isFatigued,
            fatigueRemainingTurns: card.fatigueRemainingTurns || 0,
            // 基本情報も確実に復元
            id: card.id,
            name: card.name,
            number: card.number,
            abilities: card.abilities,
            traits: card.traits || []
          }));
          
          console.log(`プレイヤー${index + 1} (${currentPlayer.name}) フィールド復元:`, {
            cardCount: currentPlayer.field.length,
            cards: currentPlayer.field.map(c => c.name)
          });
        }
      });

      // フィールド状態の復元
      this.neutralField = savedState.neutralField.map(card => ({
        ...card,
        fieldId: card.fieldId,
        isFatigued: card.isFatigued,
        fatigueRemainingTurns: card.fatigueRemainingTurns || 0,
        // 拡張情報の復元
        nextRecoveryTurn: card.nextRecoveryTurn,
        wasAcquiredThisTurn: card.wasAcquiredThisTurn || false,
        auctionHistory: card.auctionHistory || [],
        // 基本情報も確実に復元
        id: card.id,
        name: card.name,
        number: card.number,
        abilities: card.abilities,
        traits: card.traits || []
      }));

      this.exileField = savedState.exileField.map(card => ({
        ...card,
        fieldId: card.fieldId,
        isFatigued: card.isFatigued || false,
        fatigueRemainingTurns: card.fatigueRemainingTurns || 0,
        // 拡張情報の復元
        exiledTurn: card.exiledTurn,
        exiledBy: card.exiledBy,
        originalOwner: card.originalOwner,
        // 基本情報も確実に復元
        id: card.id,
        name: card.name,
        number: card.number,
        abilities: card.abilities,
        traits: card.traits || []
      }));

      // オークション選択の復元
      this.auctionSelections = new Map(savedState.auctionSelections);

      console.log('🔄 ゲーム状態復元完了:', {
        gameId: this.id,
        turn: this.turn,
        phase: this.phase,
        currentPlayer: this.players[this.currentPlayerIndex]?.name,
        player1Field: this.players[0]?.field.length || 0,
        player2Field: this.players[1]?.field.length || 0,
        neutralField: this.neutralField.length,
        exileField: this.exileField.length
      });

      // 詳細な復元情報を表示
      console.log('📋 復元されたフィールド詳細:');
      this.players.forEach((player, index) => {
        console.log(`  Player ${index + 1} (${player.name}): ${player.field.length}枚`);
        player.field.forEach(card => {
          const fatigueInfo = card.isFatigued ? ` [疲労: 残り${card.fatigueRemainingTurns}ターン]` : '';
          console.log(`    - ${card.name} (${card.fieldId})${fatigueInfo}`);
        });
      });
      
      console.log(`  中立フィールド: ${this.neutralField.length}枚`);
      this.neutralField.forEach(card => {
        const fatigueInfo = card.isFatigued ? ` [疲労: 残り${card.fatigueRemainingTurns}ターン, 回復予定ターン${card.nextRecoveryTurn || '不明'}]` : '';
        console.log(`    - ${card.name} (${card.fieldId})${fatigueInfo}`);
      });
      
      console.log(`  追放フィールド: ${this.exileField.length}枚`);
      this.exileField.forEach(card => {
        const exileInfo = card.exiledTurn ? ` [ターン${card.exiledTurn}に追放]` : '';
        const exilerInfo = card.exiledBy ? ` [${card.exiledBy}により]` : '';
        console.log(`    - ${card.name} (${card.fieldId})${exileInfo}${exilerInfo}`);
      });

      // 拡張情報のサマリー
      if (isEnhancedSave) {
        console.log('=== 拡張復元情報 ===');
        
        // 中立カードの回復予定
        const fatiggedNeutralCards = this.neutralField.filter(c => c.isFatigued);
        if (fatiggedNeutralCards.length > 0) {
          console.log('📅 中立カードの回復スケジュール:');
          fatiggedNeutralCards.forEach(card => {
            const recoveryTurn = card.nextRecoveryTurn || (this.turn + (card.fatigueRemainingTurns || 1));
            console.log(`  ${card.name}: ターン${recoveryTurn}に回復予定`);
          });
        }
        
        // プレイヤーカードの回復予定
        this.players.forEach((player, idx) => {
          const fatigdPlayerCards = player.field.filter(c => c.isFatigued);
          if (fatigdPlayerCards.length > 0) {
            console.log(`📅 ${player.name}のカード回復スケジュール:`);
            fatigdPlayerCards.forEach(card => {
              const recoveryTurn = this.turn + (card.fatigueRemainingTurns || 1);
              console.log(`  ${card.name}: ターン${recoveryTurn}に回復予定`);
            });
          }
        });
        
        // 侵略カウント
        if (this.cardEffects && this.cardEffects.invasionCount) {
          console.log('⚔️ 復元された侵略カウント:');
          Object.entries(this.cardEffects.invasionCount).forEach(([playerId, count]) => {
            const player = this.players.find(p => p.id === playerId);
            console.log(`  ${player?.name || playerId}: ${count}回`);
          });
        }
        
        console.log('===================');
      }

      // 状態復元後にクライアントに通知
      this.broadcastGameState();
      
      // 拡張情報を含むメッセージ
      let restoreMessage = `ゲーム状態を復元しました: ${savedState.description}`;
      if (isEnhancedSave) {
        const fatiggedCount = this.neutralField.filter(c => c.isFatigued).length + 
                              this.players.reduce((sum, p) => sum + p.field.filter(c => c.isFatigued).length, 0);
        restoreMessage += ` (拡張保存データ、疲労カード${fatiggedCount}枚の回復ターン情報を含む)`;
      }
      
      this.emit('message', {
        text: restoreMessage,
        type: 'info'
      });

      return { success: true, message: 'ゲーム状態が正常に復元されました' };
    } catch (error) {
      console.error('ゲーム状態復元エラー:', error);
      return { success: false, message: `復元エラー: ${error.message}` };
    }
  }

  // デバッグ機能: クイック状態設定
  setQuickDebugState(stateType) {
    try {
      switch (stateType) {
        case 'early-game':
          this.turn = 2;
          this.phase = 'playing';
          this.currentPlayerIndex = 0;
          this.players[0].points = 15;
          this.players[1].points = 12;
          this.players[0].field = this.neutralField.slice(0, 2).map(card => ({
            ...card,
            fieldId: `player0_${card.id}_${Date.now()}`,
            instanceId: `instance_${card.id}_${Date.now()}`
          }));
          this.players[1].field = this.neutralField.slice(2, 4).map(card => ({
            ...card,
            fieldId: `player1_${card.id}_${Date.now()}`,
            instanceId: `instance_${card.id}_${Date.now()}`
          }));
          this.neutralField = this.neutralField.slice(4);
          break;

        case 'mid-game':
          this.turn = 5;
          this.phase = 'playing';
          this.currentPlayerIndex = 1;
          this.players[0].points = 25;
          this.players[1].points = 30;
          this.players[0].field = this.neutralField.slice(0, 4).map(card => ({
            ...card,
            fieldId: `player0_${card.id}_${Date.now()}`,
            instanceId: `instance_${card.id}_${Date.now()}`,
            isFatigued: Math.random() > 0.5
          }));
          this.players[1].field = this.neutralField.slice(4, 7).map(card => ({
            ...card,
            fieldId: `player1_${card.id}_${Date.now()}`,
            instanceId: `instance_${card.id}_${Date.now()}`,
            isFatigued: Math.random() > 0.5
          }));
          this.neutralField = this.neutralField.slice(7);
          break;

        case 'late-game':
          this.turn = 8;
          this.phase = 'playing';
          this.currentPlayerIndex = 0;
          this.players[0].points = 50;
          this.players[1].points = 45;
          this.players[0].field = this.neutralField.slice(0, 5).map(card => ({
            ...card,
            fieldId: `player0_${card.id}_${Date.now()}`,
            instanceId: `instance_${card.id}_${Date.now()}`,
            isFatigued: Math.random() > 0.3
          }));
          this.players[1].field = this.neutralField.slice(5, 9).map(card => ({
            ...card,
            fieldId: `player1_${card.id}_${Date.now()}`,
            instanceId: `instance_${card.id}_${Date.now()}`,
            isFatigued: Math.random() > 0.3
          }));
          this.neutralField = this.neutralField.slice(9);
          break;

        default:
          throw new Error('未知の状態タイプ');
      }

      this.broadcastGameState();
      this.emit('message', {
        text: `デバッグ状態「${stateType}」を設定しました`,
        type: 'info'
      });

      return { success: true, message: `${stateType} 状態に設定されました` };
    } catch (error) {
      console.error('デバッグ状態設定エラー:', error);
      return { success: false, message: `状態設定エラー: ${error.message}` };
    }
  }
}

module.exports = GameEngine;
