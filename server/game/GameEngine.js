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
      console.log('異なるカードを選択');
      // 異なるカードを選択
      this.resolveDifferentCards(player1, player2, p1Data, p2Data);
    } else {
      console.log('同じカードを選択');
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
    // ハイジャック判定
    const p1IsDouble = p1Data.points >= p2Data.points * 2;
    const p2IsDouble = p2Data.points >= p1Data.points * 2;

    if (p1IsDouble && !p2IsDouble) {
      // Player1がハイジャック
      this.awardCard(player1, p1Data.cardId, p2Data.points);
      const card = this.neutralField.find(c => c.fieldId === p1Data.cardId);
      
      // 各プレイヤーに個別の視点で結果を送信
      console.log('オークション結果送信（ハイジャック - Player1）:', {
        winner: player1.name,
        cardId: p1Data.cardId,
        cardInfo: card ? { name: card.name, type: card.type, manaCost: card.manaCost } : null
      });
      player1.socket.emit('auction-result', {
        type: 'hijack',
        winner: player1.name,
        cardId: p1Data.cardId,
        cardInfo: card ? { name: card.name, type: card.type, manaCost: card.manaCost } : null,
        pointsPaid: p2Data.points,
        playerBid: p1Data.points,
        opponentBid: p2Data.points
      });
      
      player2.socket.emit('auction-result', {
        type: 'hijack',
        winner: player1.name,
        cardId: p1Data.cardId,
        cardInfo: card ? { name: card.name, type: card.type, manaCost: card.manaCost } : null,
        pointsPaid: p2Data.points,
        playerBid: p2Data.points,
        opponentBid: p1Data.points
      });
    } else if (p2IsDouble && !p1IsDouble) {
      // Player2がハイジャック
      this.awardCard(player2, p2Data.cardId, p1Data.points);
      const card = this.neutralField.find(c => c.fieldId === p2Data.cardId);
      
      // 各プレイヤーに個別の視点で結果を送信
      player1.socket.emit('auction-result', {
        type: 'hijack',
        winner: player2.name,
        cardId: p2Data.cardId,
        cardInfo: card ? { name: card.name, type: card.type, manaCost: card.manaCost } : null,
        pointsPaid: p1Data.points,
        playerBid: p1Data.points,
        opponentBid: p2Data.points
      });
      
      player2.socket.emit('auction-result', {
        type: 'hijack',
        winner: player2.name,
        cardId: p2Data.cardId,
        cardInfo: card ? { name: card.name, type: card.type, manaCost: card.manaCost } : null,
        pointsPaid: p1Data.points,
        playerBid: p2Data.points,
        opponentBid: p1Data.points
      });
    } else {
      // 通常取得
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
    if (p1Data.points !== p2Data.points) {
      // ポイントが異なる場合、高い方が獲得
      const winner = p1Data.points > p2Data.points ? player1 : player2;
      const loser = p1Data.points > p2Data.points ? player2 : player1;
      const winnerData = p1Data.points > p2Data.points ? p1Data : p2Data;
      
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
    if (!card) return;

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

    console.log(`${player.name}が${card.name}を獲得。中立フィールドのカードが疲労状態になりました。`);

    // カード獲得時効果を発動
    this.cardEffects.triggerOnAcquire(player, cardCopy);
  }

  startPlayingPhase() {
    console.log('プレイフェーズ開始');
    this.phase = 'playing';
    
    // 所持ポイントが多い方が先行（同点の場合は最初のプレイヤー）
    this.currentPlayerIndex = this.players[0].points > this.players[1].points ? 0 : 
                             this.players[1].points > this.players[0].points ? 1 : 0;
    
    // プレイヤーの行動フラグをリセット
    this.players.forEach(player => {
      player.hasActed = false;
    });
    
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
    return description.includes('疲労させる') || 
           description.includes('追放する') || 
           description.includes('選択') ||
           (description.includes('相手') && (description.includes('カード') || description.includes('フィールド')));
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

  // 有効な対象を取得
  getValidTargets(ability, opponent) {
    const description = ability.description;
    let targets = [];
    
    if (description.includes('疲労させる') && (description.includes('一匹') || description.includes('一体'))) {
      // アクティブな相手カードが対象（条件付きも含む）
      targets = opponent.field.filter(card => !card.isFatigued);
    } else if (description.includes('追放する') && description.includes('疲労')) {
      // 疲労した相手カードが対象
      targets = opponent.field.filter(card => card.isFatigued);
    } else if (description.includes('相手') && description.includes('カード')) {
      // 相手の全カードが対象
      targets = [...opponent.field];
    }
    
    console.log('有効な対象を検索:', { 
      description, 
      opponentFieldCount: opponent.field.length,
      validTargetsCount: targets.length,
      targets: targets.map(t => ({ name: t.name, isFatigued: t.isFatigued }))
    });
    
    return targets;
  }

  // 対象選択処理
  handleTargetSelection(playerId, targetFieldId) {
    console.log('対象選択受信:', { playerId, targetFieldId });
    
    if (this.phase !== 'target-selection' || !this.pendingAbility) {
      console.log('対象選択フェーズではありません');
      return;
    }
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
      // まだパスしていないプレイヤーがいる場合、次のプレイヤーに交代
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

    // 対戦相手がいる場合のみ追加
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
    
    this.players.forEach(player => {
      if (!player.field) return;
      
      const enemyTurnStartCards = player.field.filter(card => 
        card.abilities && 
        card.abilities.some(ability => ability.type === '敵ターン開始時') &&
        !card.isFatigued
      );
      
      console.log(`${player.name}の敵ターン開始時効果を持つカード:`, enemyTurnStartCards.map(c => c.name));
      
      enemyTurnStartCards.forEach(card => {
        const enemyTurnStartAbilities = card.abilities.filter(ability => ability.type === '敵ターン開始時');
        
        enemyTurnStartAbilities.forEach(ability => {
          console.log('敵ターン開始時効果発動:', { 
            プレイヤー: player.name,
            カード: card.name, 
            効果: ability.description 
          });
          
          const result = this.cardEffects.executeAbility(player, card, ability);
          
          if (result.success) {
            this.emit('message', {
              text: `${player.name}の${card.name}: ${result.message}`,
              type: 'info'
            });
          }
        });
      });
    });
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
}

module.exports = GameEngine;
