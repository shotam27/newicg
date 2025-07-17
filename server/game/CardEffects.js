const CardEffectStatusDB = require('../database/cardEffectStatus');

// エラーコード定義
const ERROR_CODES = {
  INSUFFICIENT_COST: 'COST_ERROR',
  INVALID_TARGET: 'TARGET_ERROR',
  CONDITION_NOT_MET: 'CONDITION_ERROR',
  RESOURCE_NOT_FOUND: 'RESOURCE_ERROR',
  ALREADY_FATIGUED: 'FATIGUE_ERROR',
  FIELD_FULL: 'FIELD_ERROR'
};

class CardEffects {
  constructor(gameEngine) {
    this.game = gameEngine;
    // 侵略回数追跡用（ラウンドごとにリセット）
    this.invasionCount = {};
    // 効果ステータスDB
    this.statusDB = new CardEffectStatusDB();
  }

  // 詳細エラーレスポンス生成
  createErrorResponse(errorCode, message, details = {}) {
    return {
      success: false,
      errorCode: errorCode,
      message: message,
      details: details,
      timestamp: Date.now()
    };
  }

  // 成功レスポンス生成
  createSuccessResponse(message, data = {}) {
    return {
      success: true,
      message: message,
      data: data,
      timestamp: Date.now()
    };
  }

  startNewRound() {
    this.invasionCount = {};
  }

  incrementInvasion(playerId) {
    if (!this.invasionCount[playerId]) this.invasionCount[playerId] = 0;
    this.invasionCount[playerId]++;
  }

  getInvasionCount(playerId) {
    return this.invasionCount[playerId] || 0;
  }

  // カード獲得時効果（疲労状態に関係なく発動）
  triggerOnAcquire(player, card) {
    const onAcquireAbilities = card.abilities.filter(ability => ability.type === '獲得時');
    
    console.log('獲得時効果チェック:', { 
      cardName: card.name, 
      isFatigued: card.isFatigued,
      abilities: onAcquireAbilities.length 
    });
    
    onAcquireAbilities.forEach(ability => {
      // コストチェック（獲得時効果でもコストが必要）
      if (ability.cost && player.points < ability.cost) {
        console.log('獲得時効果 - コスト不足:', { 
          cardName: card.name, 
          requiredCost: ability.cost,
          currentPoints: player.points
        });
        return; // コスト不足で発動しない
      }
      
      // コスト消費
      if (ability.cost) {
        player.points -= ability.cost;
        console.log('獲得時効果 - コスト消費:', { 
          cardName: card.name, 
          costPaid: ability.cost,
          remainingPoints: player.points
        });
      }
      
      console.log('獲得時効果実行:', { 
        cardName: card.name, 
        description: ability.description,
        cost: ability.cost,
        note: '疲労状態に関係なく実行' 
      });
      const abilityIndex = card.abilities.indexOf(ability);
      this.executeAbility(player, card, ability, card.id, abilityIndex);
    });
  }

  // 能力実行
  executeAbility(player, card, ability, cardId, abilityIndex) {
    console.log('CardEffects.executeAbility 開始:', { 
      playerName: player.name, 
      cardName: card.name, 
      abilityType: ability.type, 
      description: ability.description 
    });
    
    // 獲得時効果以外のコスト管理（獲得時効果は別途管理）
    if (ability.type !== '獲得時' && ability.cost) {
      if (player.points < ability.cost) {
        console.log('コスト不足:', { 
          cardName: card.name, 
          requiredCost: ability.cost,
          currentPoints: player.points,
          abilityType: ability.type
        });
        return this.createErrorResponse(
          ERROR_CODES.INSUFFICIENT_COST,
          `コストが不足しています（${ability.cost}IP必要、現在${player.points}IP）`,
          { required: ability.cost, current: player.points, cardName: card.name }
        );
      }
      
      // コスト消費
      player.points -= ability.cost;
      console.log('コスト消費:', { 
        cardName: card.name, 
        costPaid: ability.cost,
        remainingPoints: player.points,
        abilityType: ability.type
      });
    }
    
    try {
      let result;
      switch (ability.type) {
        case '侵略':
          result = this.executeInvasion(player, card, ability);
          // 侵略回数追跡
          this.incrementInvasion(player.id);
          break;
        case '強化':
          result = this.executeEnhancement(player, card, ability);
          break;
        case '反応':
          result = this.executeReaction(player, card, ability);
          break;
        case '獲得時':
          result = this.executeOnAcquire(player, card, ability);
          break;
        case '追放時':
          result = this.executeOnExile(player, card, ability);
          break;
        case '永続':
          result = this.executePermanent(player, card, ability);
          break;
        case '敵ターン開始時':
          result = this.executeEnemyTurnStart(player, card, ability);
          break;
        case '水棲':
          result = this.executeAquatic(player, card, ability);
          break;
        case '勝利':
          result = this.checkVictoryCondition(player, ability, card);
          break;
        default:
          result = { success: false, message: '未知の能力タイプです' };
          break;
      }
      
      console.log('CardEffects.executeAbility 結果:', result);
      
      // 効果実行結果をDBに記録
      const abilityIndex = card.abilities.indexOf(ability);
      if (abilityIndex !== -1) {
        const status = result.success ? 'working' : 'broken';
        this.statusDB.setEffectStatus(card.id, abilityIndex, status, player.name);
        console.log(`効果ステータス記録: ${card.name} (${abilityIndex}) -> ${status}`);
      }
      
      // 疲労回避効果のチェック（獲得時効果以外）
      if (ability.type !== '獲得時' && result.success) {
        if (ability.description.includes('この効果で疲労しない')) {
          console.log('疲労回避効果:', { cardName: card.name, ability: ability.description });
          // 疲労しない
        } else {
          // 通常は効果使用後に疲労
          card.isFatigued = true;
          console.log('効果使用後疲労:', card.name);
        }
      }
      
      return result;
    } catch (error) {
      console.error('能力実行エラー:', error);
      return { success: false, message: 'エラーが発生しました' };
    }
  }

  // 対象指定版の能力実行
  executeAbilityWithTarget(player, card, ability, target, cardId, abilityIndex) {
    console.log('CardEffects.executeAbilityWithTarget 開始:', { 
      playerName: player.name, 
      cardName: card.name, 
      abilityType: ability.type, 
      description: ability.description,
      targetName: target.name
    });

    try {
      let result;
      switch (ability.type) {
        case '侵略':
          result = this.executeInvasionWithTarget(player, card, ability, target);
          break;
        case '強化':
          result = this.executeEnhancementWithTarget(player, card, ability, target);
          break;
        default:
          // 対象指定が不要な効果は通常実行
          result = this.executeAbility(player, card, ability, cardId, abilityIndex);
          break;
      }
      
      console.log('CardEffects.executeAbilityWithTarget 結果:', result);
      return result;
    } catch (error) {
      console.error('対象指定能力実行エラー:', error);
      return { success: false, message: 'エラーが発生しました' };
    }
  }

  // 侵略効果
  executeInvasion(player, card, ability) {
    console.log('侵略効果実行:', { description: ability.description });
    const opponent = this.getOpponent(player);
    
    // ハイエナの条件付き侵略効果
    if (ability.description.includes('自分が他に侵略持ちを所持している場合')) {
      // プレイヤーが他の侵略持ちカードを所持しているかチェック
      const otherInvasionCards = player.field.filter(c => 
        c.id !== card.id && // 使用中のカード以外
        c.abilities.some(a => a.type === '侵略') && // 侵略持ち
        !c.isFatigued // 疲労していない
      );
      
      console.log('侵略持ちチェック:', { 
        cardName: card.name,
        otherInvasionCards: otherInvasionCards.map(c => c.name),
        count: otherInvasionCards.length
      });
      
      if (otherInvasionCards.length === 0) {
        console.log('他に侵略持ちを所持していません');
        return { success: false, message: '他に侵略持ちを所持していません' };
      }
      
      // 条件を満たす場合、対象指定で相手を疲労させる
      console.log('条件を満たしました。対象選択が必要です。');
      return { success: false, message: '対象選択が必要です', needsTarget: true };
    }
    
    // 基本的な侵略効果（句点の有無も考慮）
    if (ability.description.includes('一匹疲労させる') || 
        ability.description.includes('一体疲労させる') ||
        ability.description.includes('一匹疲労させる。') || 
        ability.description.includes('一体疲労させる。')) {
      const targetCard = this.selectTargetCard(opponent.field, 'active');
      if (targetCard) {
        targetCard.isFatigued = true;
        console.log('相手のカードを疲労させました:', targetCard.name);
        return { success: true, message: `${targetCard.name}を疲労させました` };
      } else {
        console.log('疲労させる対象がありません');
        return { success: false, message: '疲労させる対象がありません' };
      }
    }

    // IP消費系（統一）
    if (ability.description.includes('IP消費') || 
        (ability.description.includes('IP') && ability.description.includes('消費'))) {
      const ipCostMatch = ability.description.match(/(\d+)IP消費/) || 
                         ability.description.match(/IPを(\d+)消費/) ||
                         ability.description.match(/自分のIPを(\d+)消費/);
      if (ipCostMatch) {
        const ipCost = parseInt(ipCostMatch[1]);
        console.log('IP消費チェック:', { required: ipCost, current: player.points });
        if (player.points >= ipCost) {
          player.points -= ipCost;
          console.log('IP消費しました:', { cost: ipCost, remaining: player.points });
          
          // 疲労済追放の対応
          if (ability.description.includes('疲労済を追放する')) {
            return this.executeExile(player, opponent, ability, 'fatigued');
          }
          
          if (ability.description.includes('追放する')) {
            return this.executeExile(player, opponent, ability);
          }
          
          // 自身疲労回復効果
          if (ability.description.includes('自身の疲労取り除く') || 
              ability.description.includes('自身の疲労を取り除く')) {
            card.isFatigued = false;
            console.log('侵略効果で自身疲労回復:', card.name);
          }
        } else {
          console.log('IPが不足しています');
          return { success: false, message: 'IPが不足しています' };
        }
      }
    }

    // 特殊効果
    if (ability.description.includes('フントークン')) {
      return this.handlePoop(player, opponent, ability);
    }

    console.log('侵略効果処理完了');
    return { success: true, message: `${ability.description}を実行しました` };
  }

  // 対象指定侵略効果
  executeInvasionWithTarget(player, card, ability, target) {
    console.log('対象指定侵略効果実行:', { 
      description: ability.description, 
      targetName: target.name, 
      targetFatigue: target.isFatigued 
    });
    
    // ハイエナの条件付き侵略効果
    if (ability.description.includes('自分が他に侵略持ちを所持している場合')) {
      // プレイヤーが他の侵略持ちカードを所持しているかチェック
      const otherInvasionCards = player.field.filter(c => 
        c.id !== card.id && // 使用中のカード以外
        c.abilities.some(a => a.type === '侵略') && // 侵略持ち
        !c.isFatigued // 疲労していない
      );
      
      console.log('条件チェック（対象指定）:', { 
        cardName: card.name,
        otherInvasionCards: otherInvasionCards.map(c => c.name),
        count: otherInvasionCards.length
      });
      
      if (otherInvasionCards.length === 0) {
        console.log('他に侵略持ちを所持していません');
        return { success: false, message: '他に侵略持ちを所持していません' };
      }
      
      // 条件を満たし、対象を疲労させる
      if (!target.isFatigued) {
        target.isFatigued = true;
        console.log('条件を満たして対象を疲労させました:', target.name);
        return { success: true, message: `${target.name}を疲労させました` };
      } else {
        console.log('対象は既に疲労しています:', target.name);
        return { success: false, message: `${target.name}は既に疲労しています` };
      }
    }
    
    // 基本的な疲労させる効果（句点の有無も考慮）
    if (ability.description.includes('一匹疲労させる') || 
        ability.description.includes('一体疲労させる') ||
        ability.description.includes('一匹疲労させる。') || 
        ability.description.includes('一体疲労させる。')) {
      if (!target.isFatigued) {
        target.isFatigued = true;
        console.log('対象を疲労させました:', target.name);
        return { success: true, message: `${target.name}を疲労させました` };
      } else {
        console.log('対象は既に疲労しています:', target.name);
        return { success: false, message: `${target.name}は既に疲労しています` };
      }
    }
    
    // 増加IP消費系の追放効果
    if (ability.description.includes('増加IP2消費し、一匹追放する')) {
      // 増加IPから2消費する
      if (player.ipIncrease >= 12) { // 通常10 + 必要2
        player.ipIncrease -= 2;
        
        // 対象を追放
        const targetOwner = this.game.players.find(p => p.field.includes(target));
        if (targetOwner) {
          const cardIndex = targetOwner.field.indexOf(target);
          targetOwner.field.splice(cardIndex, 1);
          this.game.exileField.push(target);
          console.log('増加IP2消費して対象を追放しました:', target.name);
          return { success: true, message: `増加IP2消費して${target.name}を追放しました` };
        }
      } else {
        return { success: false, message: '増加IPが不足しています（12以上必要）' };
      }
    }
    
    // IP消費系の追放効果（統一パターンで対応）
    if ((ability.description.includes('IP消費') || 
         (ability.description.includes('IP') && ability.description.includes('消費'))) && 
        ability.description.includes('追放')) {
      const ipCostMatch = ability.description.match(/(\d+)IP消費/) || 
                         ability.description.match(/IPを(\d+)消費/) ||
                         ability.description.match(/自分のIPを(\d+)消費/);
      if (ipCostMatch) {
        const ipCost = parseInt(ipCostMatch[1]);
        if (player.points >= ipCost) {
          player.points -= ipCost;
          
          // 対象を追放
          const targetOwner = this.game.players.find(p => p.field.includes(target));
          if (targetOwner) {
            const cardIndex = targetOwner.field.indexOf(target);
            targetOwner.field.splice(cardIndex, 1);
            this.game.exileField.push(target);
            console.log('対象を追放しました:', target.name);
            return { success: true, message: `${ipCost}IP消費して${target.name}を追放しました` };
          }
        } else {
          return { success: false, message: 'IPが不足しています' };
        }
      }
    }
    
    return { success: true, message: `${target.name}に対して${ability.description}を実行しました` };
  }

  // 強化効果
  executeEnhancement(player, card, ability) {
    // 共通効果を優先チェック
    const commonResult = this.processCommonEffects(player, card, ability);
    if (commonResult) return commonResult;

    // 手動反応発動システム
    if (ability.description.includes('自分の反応持ちカードの効果を発動できる')) {
      const reactionCards = player.field.filter(c => 
        !c.isFatigued && c.abilities && c.abilities.some(a => a.type === '反応')
      );
      
      if (reactionCards.length === 0) {
        return { success: false, message: '発動可能な反応持ちカードがありません' };
      }

      // プレイヤーに反応カード選択を要求
      const validTargets = reactionCards.map(reactionCard => ({
        fieldId: reactionCard.fieldId || reactionCard.instanceId,
        name: reactionCard.name,
        abilities: reactionCard.abilities.filter(a => a.type === '反応')
      }));

      player.socket.emit('select-reaction-card', {
        message: '発動する反応持ちカードを選択してください',
        validTargets: validTargets
      });

      // 反応選択の処理は別途handleReactionSelectionで行う
      return { success: true, message: '反応カード選択待ち' };
    }

    // 同種を一枚疲労させる効果（条件処理）
    if (ability.description.includes('同種を一枚疲労させ')) {
      const sameTypeCards = player.field.filter(c => 
        c.id === card.id && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (sameTypeCards.length > 0) {
        sameTypeCards[0].isFatigued = true;
        console.log('同種カードを疲労させました:', sameTypeCards[0].name);
        console.log('条件達成 - 効果を継続実行');
        // 条件達成したので効果を継続
      } else {
        console.log('同種疲労条件未達成:', { 
          cardName: card.name, 
          availableSameType: sameTypeCards.length 
        });
        return this.createErrorResponse(
          ERROR_CODES.CONDITION_NOT_MET,
          '疲労させる同種カードがありません',
          { cardName: card.name, requiredCondition: '疲労していない同種' }
        );
      }
    }

    // 同種生成（統一）
    if (ability.description.includes('同種を生成') || ability.description.includes('同種を一枚生成')) {
      const newCard = this.createCardCopy(card, true); // 疲労状態で生成
      if (newCard) {
        player.field.push(newCard);
        return { success: true, message: `${card.name}を生成しました（疲労状態）` };
      }
    }

    // 追放から獲得
    if (ability.description.includes('追放から') && ability.description.includes('獲得')) {
      const exileCard = this.selectTargetCard(this.game.exileField);
      if (exileCard) {
        const cardIndex = this.game.exileField.indexOf(exileCard);
        this.game.exileField.splice(cardIndex, 1);
        player.field.push(exileCard);
        return { success: true, message: `${exileCard.name}を追放から獲得しました` };
      }
    }

    // 複数条件・複数効果の複合強化効果
    if (ability.description.includes('自フィールドに反応持ちがいる場合、5IP消費してブナシメジを生成する')) {
      // 条件1: 自フィールドに反応持ちがいるかチェック
      const hasReactionCard = player.field.some(fieldCard => 
        fieldCard.abilities && fieldCard.abilities.some(a => a.type === '反応')
      );
      
      if (!hasReactionCard) {
        return { success: false, message: '自フィールドに反応持ちカードがいません' };
      }
      
      // 条件2: 5IP以上あるかチェック
      if (player.points < 5) {
        return { success: false, message: 'IPが不足しています（5IP必要）' };
      }
      
      // 効果実行: IP消費 + ブナシメジ生成
      player.points -= 5;
      const fieldId = `bunashimeji_${Date.now()}_${Math.random()}`;
      const bunashimejiCard = {
        id: 'mushroom',
        name: 'ブナシメジ',
        fieldId: fieldId,
        instanceId: fieldId,
        abilities: [
          {
            type: '強化',
            cost: 1,
            description: '自フィールドに反応持ちがいる場合、5IP消費してブナシメジを生成する'
          },
          {
            type: '永続',
            cost: 2,
            description: '１ラウンドにつき一度のみ、自分の反応持ちが追放された場合、自分のブナシメジを一体追放しなければならない'
          }
        ],
        isFatigued: false
      };
      player.field.push(bunashimejiCard);
      console.log('ブナシメジ生成:', { player: player.name, card: bunashimejiCard.name });
      return { success: true, message: '5IP消費してブナシメジを生成しました' };
    }

    // 増加IP+1効果
    if (ability.description.includes('増加IP+1') || ability.description.includes('増加IP＋1')) {
      player.ipIncrease = (player.ipIncrease || 10) + 1;
      console.log(`${player.name}の増加IPが${player.ipIncrease}になりました`);
      return { success: true, message: '増加IP+1効果を発動しました。次のターンから毎ターンのIP獲得量が1増加します' };
    }

    // 一般的なIP消費系（統一パターンで対応）
    if (ability.description.includes('IP消費') || 
        (ability.description.includes('IP') && ability.description.includes('消費'))) {
      const ipCostMatch = ability.description.match(/(\d+)IP消費/) || 
                         ability.description.match(/IPを(\d+)消費/) ||
                         ability.description.match(/自分のIPを(\d+)消費/);
      if (ipCostMatch) {
        const ipCost = parseInt(ipCostMatch[1]);
        if (player.points >= ipCost) {
          player.points -= ipCost;
          return { success: true, message: `${ipCost}IP消費して効果を発動しました` };
        } else {
          return { success: false, message: 'IPが不足しています' };
        }
      }
    }

    // 中立フィールドの同種を回復する
    if (ability.description.includes('中立フィールドの同種を回復する') || 
        ability.description.includes('中立フィールドの同種を回復させる')) {
      const neutralField = this.game.neutralField || [];
      let count = 0;
      for (const nc of neutralField) {
        if (nc.id === card.id && nc.isFatigued) {
          nc.isFatigued = false;
          nc.fatigueRemainingTurns = 0;
          count++;
          console.log('中立フィールドの同種を回復:', nc.name);
        }
      }
      
      if (count > 0) {
        return { success: true, message: `中立フィールドの同種${count}枚を回復しました` };
      } else {
        return { success: false, message: '中立フィールドに疲労した同種がありません' };
      }
    }

    // ハチを獲得する
    if (ability.description.includes('ハチを獲得する')) {
      const cardPool = this.game.cardPool || [];
      const beeCard = cardPool.find(c => c.name === 'ハチ' || c.id === 'bee');
      
      if (beeCard) {
        const newCard = this.createCardCopy(beeCard, true); // 疲労状態で獲得
        if (newCard) {
          player.field.push(newCard);
          console.log('ハチを獲得（疲労状態）:', { player: player.name, card: newCard.name });
          return { success: true, message: 'ハチを獲得しました（疲労状態）' };
        }
      }
      
      return { success: false, message: 'ハチが見つかりません' };
    }

    // 複数体疲労させる
    const multiFatigueMatch = ability.description.match(/(\d+)体疲労させる/);
    if (multiFatigueMatch) {
      const count = parseInt(multiFatigueMatch[1]);
      let fatigued = 0;
      for (const c of player.field) {
        if (!c.isFatigued && fatigued < count) {
          c.isFatigued = true;
          fatigued++;
        }
      }
      return { success: true, message: `${fatigued}体疲労させました` };
    }

    // 中立フィールドの全カードを回復する
    if (ability.description.includes('中立フィールドの全カードを回復する')) {
      const neutralField = this.game.neutralField || [];
      let count = 0;
      for (const nc of neutralField) {
        if (nc.isFatigued) {
          nc.isFatigued = false;
          nc.fatigueRemainingTurns = 0;
          count++;
          console.log('中立フィールドのカードを回復:', nc.name);
        }
      }
      
      if (count > 0) {
        return { success: true, message: `中立フィールドの全カード${count}枚を回復しました` };
      } else {
        return { success: false, message: '中立フィールドに疲労したカードがありません' };
      }
    }

    // 中立フィールドの指定カードを回復する
    if (ability.description.includes('中立フィールドの') && ability.description.includes('を回復する')) {
      const targetMatch = ability.description.match(/中立フィールドの(\w+)を回復する/);
      if (targetMatch) {
        const targetName = targetMatch[1];
        const neutralField = this.game.neutralField || [];
        let count = 0;
        
        for (const nc of neutralField) {
          if (nc.name.includes(targetName) && nc.isFatigued) {
            nc.isFatigued = false;
            nc.fatigueRemainingTurns = 0;
            count++;
            console.log('中立フィールドの指定カードを回復:', nc.name);
          }
        }
        
        if (count > 0) {
          return { success: true, message: `中立フィールドの${targetName}${count}枚を回復しました` };
        } else {
          return { success: false, message: `中立フィールドに疲労した${targetName}がありません` };
        }
      }
    }

    // 中立フィールドから同種を獲得する
    if (ability.description.includes('中立フィールドから同種を獲得する')) {
      const neutralField = this.game.neutralField || [];
      const sameTypeCard = neutralField.find(nc => nc.id === card.id && !nc.isFatigued);
      
      if (sameTypeCard) {
        // 中立フィールドから削除
        const index = neutralField.indexOf(sameTypeCard);
        neutralField.splice(index, 1);
        
        // プレイヤーのフィールドに追加
        const newCard = this.createCardCopy(sameTypeCard);
        if (newCard) {
          player.field.push(newCard);
          return { success: true, message: `中立フィールドから${card.name}を獲得しました` };
        }
      } else {
        return { success: false, message: '中立フィールドに回復状態の同種がありません' };
      }
    }

    // 中立フィールドのカードを疲労させる
    if (ability.description.includes('中立フィールドの') && ability.description.includes('を疲労させる')) {
      const neutralField = this.game.neutralField || [];
      let count = 0;
      
      if (ability.description.includes('全カードを疲労させる')) {
        // 全カードを疲労
        for (const nc of neutralField) {
          if (!nc.isFatigued) {
            nc.isFatigued = true;
            count++;
            console.log('中立フィールドのカードを疲労:', nc.name);
          }
        }
        return { success: true, message: `中立フィールドの全カード${count}枚を疲労させました` };
      } else if (ability.description.includes('同種を疲労させる')) {
        // 同種のみ疲労
        for (const nc of neutralField) {
          if (nc.id === card.id && !nc.isFatigued) {
            nc.isFatigued = true;
            count++;
            console.log('中立フィールドの同種を疲労:', nc.name);
          }
        }
        return { success: true, message: `中立フィールドの同種${count}枚を疲労させました` };
      }
    }

    // 条件付き効果: 自フィールドに同種がいない場合、同種を獲得する
    if (ability.description.includes('自フィールドに同種がいない場合')) {
      const hasSameType = player.field.some(c => c.id === card.id);
      if (!hasSameType) {
        const newCard = this.createCardCopy(card, true); // 疲労状態で獲得
        player.field.push(newCard);
        return { success: true, message: `${card.name}を獲得しました（同種がいなかったため・疲労状態）` };
      }
    }

    return { success: true, message: `${ability.description}を実行しました` };
  }

  // 対象指定強化効果
  executeEnhancementWithTarget(player, card, ability, target) {
    console.log('対象指定強化効果実行:', { 
      description: ability.description, 
      targetName: target.name 
    });
    
    // とりあえず基本実装
    return { success: true, message: `${target.name}に対して${ability.description}を実行しました` };
  }

  // 反応効果
  executeReaction(player, card, ability) {
    // 共通効果を優先チェック
    const commonResult = this.processCommonEffects(player, card, ability);
    if (commonResult) return commonResult;

    console.log('反応効果実行:', { 
      player: player.name, 
      card: card.name, 
      ability: ability.description 
    });

    // IP増加
    const ipGainMatch = ability.description.match(/IP[＋+](\d+)/);
    if (ipGainMatch) {
      const ipGain = parseInt(ipGainMatch[1]);
      player.points += ipGain;
      
      console.log(`${player.name}が反応効果で${ipGain}IP獲得`);
      return { success: true, message: `反応効果で${ipGain}IP獲得しました` };
    }

    // その他の反応効果
    if (ability.description.includes('疲労を取り除く')) {
      card.isFatigued = false;
      return { success: true, message: '疲労を取り除きました' };
    }

    return { success: true, message: `反応効果: ${ability.description}を実行しました` };
  }

  // 獲得時効果（疲労状態に関係なく発動）
  executeOnAcquire(player, card, ability) {
    // 共通効果を優先チェック
    const commonResult = this.processCommonEffects(player, card, ability);
    if (commonResult) return commonResult;

    console.log('獲得時効果実行:', { 
      cardName: card.name, 
      description: ability.description,
      playerName: player.name,
      cardFatigued: card.isFatigued
    });

    // 自分自身の回復効果
    if (ability.description.includes('このカードを回復する')) {
      card.isFatigued = false;
      console.log('カードを回復しました:', card.name);
      return { success: true, message: `${card.name}を回復しました` };
    }

    // 中立フィールドの条件付き生成効果
    if (ability.description.includes('中立に') && ability.description.includes('がいない場合')) {
      console.log('条件付き中立生成効果発動:', { 
        cardName: card.name, 
        description: ability.description,
        playerName: player.name
      });
      const result = this.generateToNeutral(ability);
      console.log('条件付き中立生成結果:', result);
      return result;
    }

    // 中立フィールドの同種回復効果
    if (ability.description.includes('中立フィールドの同種を回復する')) {
      const neutralField = this.game.neutralField || [];
      const sameTypeCards = neutralField.filter(nc => nc.id === card.id);
      
      if (sameTypeCards.length > 0) {
        // 疲労している同種カードを回復
        const fatigueCards = sameTypeCards.filter(nc => nc.isFatigued);
        if (fatigueCards.length > 0) {
          fatigueCards.forEach(fc => fc.isFatigued = false);
          console.log('中立フィールドの同種を回復しました:', fatigueCards.map(fc => fc.name));
          return { success: true, message: `中立フィールドの${card.name}を回復しました` };
        } else {
          console.log('中立フィールドに疲労した同種カードがありません');
          return { success: false, message: '中立フィールドに疲労した同種カードがありません' };
        }
      } else {
        console.log('中立フィールドに同種カードがありません');
        return { success: false, message: '中立フィールドに同種カードがありません' };
      }
    }

    // 特定カード獲得効果
    if (ability.description.includes('ハチを獲得する')) {
      const templateCard = this.game.cardPool.find(c => c.id === 'bee');
      if (templateCard) {
        const newCard = this.createCardCopy(templateCard, true); // 疲労状態で獲得
        if (newCard) {
          player.field.push(newCard);
          console.log('ハチを獲得しました:', newCard.name);
          return { success: true, message: 'ハチを獲得しました' };
        }
      }
      return { success: false, message: 'ハチの獲得に失敗しました' };
    }

    // IP獲得効果
    const ipGainMatch = ability.description.match(/IP[＋+](\d+)/);
    if (ipGainMatch) {
      const ipGain = parseInt(ipGainMatch[1]);
      player.points += ipGain;
      console.log('IP獲得:', { gain: ipGain, newTotal: player.points });
      return { success: true, message: `${ipGain}IP獲得しました` };
    }

    // 増加IP獲得効果
    if (ability.description.includes('増加IP＋')) {
      const ipMatch = ability.description.match(/増加IP[＋+](\d+)/);
      if (ipMatch) {
        const ipGain = parseInt(ipMatch[1]);
        // 増加IPシステムの実装（仮実装）
        player.bonusPoints = (player.bonusPoints || 0) + ipGain;
        console.log('増加IP獲得:', { gain: ipGain, newBonus: player.bonusPoints });
        return { success: true, message: `増加IP${ipGain}を獲得しました` };
      }
    }

    // 中立フィールドへの一般的なカード生成
    if (ability.description.includes('中立に') && ability.description.includes('生成')) {
      console.log('獲得時効果で中立生成:', ability.description);
      return this.generateToNeutral(ability);
    }

    console.log('獲得時効果（汎用）実行:', ability.description);
    return { success: true, message: `${ability.description}を実行しました` };
  }

  // 追放時効果
  executeOnExile(player, card, ability) {
    const ipGainMatch = ability.description.match(/IP[＋+](\d+)/);
    if (ipGainMatch) {
      const ipGain = parseInt(ipGainMatch[1]);
      player.points += ipGain;
      return { success: true, message: `${ipGain}IP獲得しました` };
    }

    return { success: true, message: `${ability.description}を実行しました` };
  }

  // 永続効果
  executePermanent(player, card, ability) {
    // 永続効果は状態管理で処理
    return { success: true, message: '永続効果が適用されています' };
  }

  // 敵ターン開始時効果
  executeEnemyTurnStart(player, card, ability) {
    return { success: true, message: '敵ターン開始時効果を実行しました' };
  }

  // 水棲効果
  executeAquatic(player, card, ability) {
    if (ability.description.includes('中立に') && ability.description.includes('生成')) {
      return this.generateToNeutral(ability);
    }

    return { success: true, message: '水棲効果を実行しました' };
  }

  // 勝利条件チェック
  checkVictoryCondition(player, ability, card) {
    console.log('🏆 勝利条件チェック開始:', { 
      playerName: player.name, 
      cardName: card.name, 
      cardId: card.id,
      abilityDescription: ability.description,
      playerPoints: player.points,
      abilityCost: ability.cost 
    });
    
    const opponent = this.getOpponent(player);

    // 基本条件：コスト数のカードを所持しているか
    const cardCount = player.field.filter(fieldCard => fieldCard.id === card.id).length;
    console.log('📋 基本条件チェック:', { 
      cardId: card.id, 
      requiredCount: ability.cost, 
      actualCount: cardCount 
    });
    
    if (cardCount < ability.cost) {
      console.log('❌ 基本条件不満足: カード枚数不足');
      return { success: false, message: `勝利条件を満たしていません（${card.name}が${ability.cost}体必要、現在${cardCount}体）` };
    }

    // 累計IPが40を超えている場合の勝利条件
    if (ability.description.includes('累計IPが40を超えている場合')) {
      console.log('🔍 IP超過条件チェック:', { playerPoints: player.points, required: 40 });
      if (player.points > 40) {
        console.log('🎉 勝利条件達成！IP超過で勝利');
        // 勝利条件を満たしているので、ゲーム終了処理を行う
        this.game.endGame(player);
        return { success: true, message: `${player.name}の勝利！累計IPが40を超えました！`, victory: true };
      } else {
        console.log('❌ IP超過条件不満足');
        return { success: false, message: `勝利条件を満たしていません（現在IP: ${player.points}/40必要）` };
      }
    }

    // 従来のIP系勝利条件（統一）
    if (ability.description.includes('IP40以上') || ability.description.includes('IP40')) {
      console.log('🔍 IP40以上条件チェック:', { playerPoints: player.points, required: 40 });
      if (player.points >= 40) {
        console.log('🎉 勝利条件達成！IP40以上で勝利');
        this.game.endGame(player);
        return { success: true, message: `${player.name}の勝利！`, victory: true };
      } else {
        console.log('❌ IP40以上条件不満足');
        return { success: false, message: `勝利条件を満たしていません（現在IP: ${player.points}/40必要）` };
      }
    }

    // 条件なしの勝利条件
    if (ability.description.includes('条件なし')) {
      console.log('🎉 勝利条件達成！条件なしで勝利');
      this.game.endGame(player);
      return { success: true, message: `${player.name}の勝利！`, victory: true };
    }

    // 追放枚数系勝利条件
    if (ability.description.includes('追放が10体になった時')) {
      const exileCount = this.game.exileField ? this.game.exileField.length : 0;
      if (exileCount >= 10) {
        this.game.endGame(player);
        return { success: true, message: `${player.name}の勝利！追放が10体達成！`, victory: true };
      } else {
        return { success: false, message: `勝利条件を満たしていません（現在追放: ${exileCount}/10必要）` };
      }
    }

    // フィールド枚数系
    const fieldCountMatch = ability.description.match(/自フィールドが?(\d+)枚以上/);
    if (fieldCountMatch) {
      const requiredCount = parseInt(fieldCountMatch[1]);
      if (player.field.length >= requiredCount) {
        this.game.endGame(player);
        return { success: true, message: `${player.name}の勝利！`, victory: true };
      } else {
        return { success: false, message: `勝利条件を満たしていません（現在フィールド: ${player.field.length}/${requiredCount}必要）` };
      }
    }

    // 侵略回数系
    if (ability.description.includes('侵略した回数が') || ability.description.includes('１ラウンドで侵略した回数が')) {
      const invasionCountMatch = ability.description.match(/侵略した回数が(\d+)を?超えていた場合/);
      if (invasionCountMatch) {
        const requiredCount = parseInt(invasionCountMatch[1]);
        if (this.getInvasionCount(player.id) > requiredCount) {
          this.game.endGame(player);
          return { success: true, message: `${player.name}の勝利！`, victory: true };
        } else {
          return { success: false, message: `勝利条件を満たしていません（現在侵略回数: ${this.getInvasionCount(player.id)}/${requiredCount}必要）` };
        }
      }
    }

    // 水棲系
    if (ability.description.includes('水棲持ちが8体')) {
      const aquaticCount = player.field.filter(card => 
        card.traits && card.traits.includes('水棲')
      ).length;
      return aquaticCount >= 8;
    }

    // 条件なし
    if (ability.description.includes('条件なし')) {
      return true;
    }

    return false;
  }

  // 共通効果処理関数（最適化版）
  processCommonEffects(player, card, ability) {
    const description = ability.description;
    
    // 同種を一枚疲労させる条件チェック（最優先）
    if (description.includes('同種を一枚疲労させ')) {
      const sameTypeCards = player.field.filter(c => 
        c.id === card.id && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (sameTypeCards.length === 0) {
        console.log('同種疲労条件未達成:', { 
          cardName: card.name, 
          availableSameType: sameTypeCards.length 
        });
        return this.createErrorResponse(
          ERROR_CODES.CONDITION_NOT_MET,
          '疲労させる同種カードがありません',
          { cardName: card.name, requiredCondition: '疲労していない同種' }
        );
      }
      
      // 条件達成：同種を疲労させる
      sameTypeCards[0].isFatigued = true;
      console.log('同種カードを疲労させました:', sameTypeCards[0].name);
      console.log('条件達成 - 効果を継続実行');
      // 条件達成したので効果を継続（returnしない）
    }
    
    // 早期リターン用パターンマッチング
    const patterns = {
      selfRecover: /このカードを回復|自身の疲労取り除く|自身の疲労を取り除く/,
      ipGain: /[＋+](\d+)IP|IP[＋+](\d+)|(\d+)IP獲得/,
      neutralRecover: /中立フィールドの同種を回復する|中立フィールドの同種を回復させる/,
      beeAcquire: /ハチを獲得する/
    };

    // 自身回復効果（最優先）
    if (patterns.selfRecover.test(description)) {
      if (card.isFatigued) {
        card.isFatigued = false;
        console.log('自身回復効果:', card.name);
        return this.createSuccessResponse(`${card.name}を回復しました`);
      } else {
        return this.createErrorResponse(
          ERROR_CODES.ALREADY_FATIGUED,
          'カードは既に回復状態です',
          { cardName: card.name }
        );
      }
    }

    // IP獲得効果
    const ipMatch = description.match(patterns.ipGain);
    if (ipMatch) {
      const ipGain = parseInt(ipMatch[1] || ipMatch[2] || ipMatch[3]);
      player.points += ipGain;
      console.log('IP獲得効果:', { player: player.name, gain: ipGain });
      
      // 「同種を一枚疲労させ」が含まれている場合は複合効果として処理
      if (description.includes('同種を一枚疲労させ')) {
        return this.createSuccessResponse(`同種を疲労させて${ipGain}IP獲得しました`, { 
          ipGain: ipGain,
          condition: '同種疲労'
        });
      } else {
        return this.createSuccessResponse(`${ipGain}IP獲得しました`, { ipGain: ipGain });
      }
    }

    // 中立フィールドの同種を回復する
    if (patterns.neutralRecover.test(description)) {
      const result = this.processNeutralFieldRecover(card);
      
      // 「同種を一枚疲労させ」が含まれている場合は複合効果として処理
      if (description.includes('同種を一枚疲労させ') && result.success) {
        result.message = `同種を疲労させて${result.message}`;
        result.data = { ...result.data, condition: '同種疲労' };
      }
      
      return result;
    }

    // ハチを獲得する
    if (patterns.beeAcquire.test(description)) {
      const result = this.processBeeAcquire(player);
      
      // 「同種を一枚疲労させ」が含まれている場合は複合効果として処理
      if (description.includes('同種を一枚疲労させ') && result.success) {
        result.message = `同種を疲労させて${result.message}`;
        result.data = { ...result.data, condition: '同種疲労' };
      }
      
      return result;
    }

    return null; // 共通効果に該当なし
  }

  // 中立フィールド回復処理（分離）
  processNeutralFieldRecover(card) {
    const neutralField = this.game.neutralField || [];
    let count = 0;
    
    for (const nc of neutralField) {
      if (nc.id === card.id && nc.isFatigued) {
        nc.isFatigued = false;
        nc.fatigueRemainingTurns = 0;
        count++;
        console.log('中立フィールドの同種を回復:', nc.name);
      }
    }
    
    if (count > 0) {
      return this.createSuccessResponse(`中立フィールドの同種${count}枚を回復しました`, { recoveredCount: count });
    } else {
      return this.createErrorResponse(
        ERROR_CODES.CONDITION_NOT_MET,
        '中立フィールドに疲労した同種がありません',
        { cardId: card.id }
      );
    }
  }

  // ハチ獲得処理（分離）
  processBeeAcquire(player) {
    const cardPool = this.game.cardPool || [];
    const beeCard = cardPool.find(c => c.name === 'ハチ' || c.id === 'bee');
    
    if (!beeCard) {
      return this.createErrorResponse(
        ERROR_CODES.RESOURCE_NOT_FOUND,
        'ハチが見つかりません',
        { requestedCard: 'ハチ' }
      );
    }
    
    // フィールド容量チェック（最大20枚と仮定）
    if (player.field.length >= 20) {
      return this.createErrorResponse(
        ERROR_CODES.FIELD_FULL,
        'フィールドが満杯です',
        { currentCount: player.field.length }
      );
    }
    
    const newCard = this.createCardCopy(beeCard, true); // 疲労状態で獲得
    if (newCard) {
      player.field.push(newCard);
      console.log('ハチを獲得（疲労状態）:', { player: player.name, card: newCard.name });
      return this.createSuccessResponse('ハチを獲得しました（疲労状態）', { acquiredCard: newCard.name });
    }
    
    return this.createErrorResponse(
      ERROR_CODES.RESOURCE_NOT_FOUND,
      'ハチの生成に失敗しました'
    );
  }

  // ヘルパーメソッド
  getOpponent(player) {
    return this.game.players.find(p => p.id !== player.id);
  }

  selectTargetCard(cardArray, filter = 'any') {
    let candidates = cardArray;
    
    if (filter === 'active') {
      candidates = cardArray.filter(card => !card.isFatigued);
    }
    
    if (candidates.length === 0) return null;
    
    // ランダム選択（実際のゲームでは選択UIが必要）
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  createCardCopy(originalCard, isFatigued = false) {
    const fieldId = `${originalCard.id}_${Date.now()}_${Math.random()}`;
    return {
      ...originalCard,
      fieldId: fieldId,
      instanceId: fieldId, // instanceIdも同じIDを設定
      isFatigued: isFatigued
    };
  }

  // 疲労済カード限定追放の実装
  executeExile(player, opponent, ability, filter = 'any') {
    let candidates = opponent.field;
    
    if (filter === 'fatigued') {
      candidates = opponent.field.filter(card => card.isFatigued);
    }
    
    const targetCard = this.selectTargetCard(candidates);
    if (targetCard) {
      const cardIndex = opponent.field.indexOf(targetCard);
      opponent.field.splice(cardIndex, 1);
      this.game.exileField.push(targetCard);
      return { success: true, message: `${targetCard.name}を追放しました` };
    }
    
    const filterMessage = filter === 'fatigued' ? '疲労済の' : '';
    return { success: false, message: `追放できる${filterMessage}カードがありません` };
  }

  handlePoop(player, opponent, ability) {
    // フントークン処理（簡略化）
    if (ability.description.includes('フントークンを生成')) {
      const fieldId = `poop_${Date.now()}`;
      const poopToken = {
        id: 'poop_token',
        name: 'フントークン',
        fieldId: fieldId,
        instanceId: fieldId, // instanceIdも同じIDを設定
        abilities: [],
        isFatigued: false
      };
      player.field.push(poopToken);
      return { success: true, message: 'フントークンを生成しました' };
    }
    return { success: true, message: 'フントークン効果を実行しました' };
  }

  generateToNeutral(ability) {
    // 中立フィールドへのカード生成（強化版）
    const neutralField = this.game.neutralField || [];
    
    console.log('generateToNeutral 開始:', { 
      description: ability.description,
      neutralFieldBefore: neutralField.map(nc => `${nc.name}(${nc.id})`)
    });
    
    // 生成対象のカード名を抽出
    let targetCardName = null;
    let targetCardId = null;
    let conditionCheck = false;
    
    // パターンマッチング（改善版）- 日本語文字対応
    const patterns = [
      // 条件付き生成パターン（詳細な順序で）- 日本語文字対応
      { regex: /獲得時、中立に([ア-ヾ一-龠]+)がいない場合、中立に([ア-ヾ一-龠]+)を生成する/, hasCondition: true, nameIndex: 2, description: '獲得時条件付き生成（中立に）' },
      { regex: /中立に([ア-ヾ一-龠]+)がいない場合、中立に([ア-ヾ一-龠]+)を生成する/, hasCondition: true, nameIndex: 2, description: '条件付き生成（中立に）' },
      { regex: /中立に([ア-ヾ一-龠]+)がいない場合、([ア-ヾ一-龠]+)を生成する/, hasCondition: true, nameIndex: 2, description: '条件付き生成（簡潔）' },
      { regex: /中立にいない場合、中立に([ア-ヾ一-龠]+)を生成する/, hasCondition: true, nameIndex: 1, description: '条件付き生成（自身チェック）' },
      // 無条件生成パターン  
      { regex: /中立に([ア-ヾ一-龠]+)を生成する/, hasCondition: false, nameIndex: 1, description: '無条件生成' }
    ];
    
    console.log('パターンマッチング開始:', ability.description);
    
    for (const pattern of patterns) {
      const match = ability.description.match(pattern.regex);
      console.log('パターンテスト:', { 
        pattern: pattern.regex.source, 
        description: pattern.description,
        match: match ? match[0] : null,
        hasCondition: pattern.hasCondition,
        nameIndex: pattern.nameIndex,
        extractedName: match ? match[pattern.nameIndex] : null
      });
      
      if (match) {
        targetCardName = match[pattern.nameIndex];
        conditionCheck = pattern.hasCondition;
        console.log('パターンマッチ成功:', { 
          targetCardName, 
          conditionCheck,
          matchedPattern: pattern.regex.source,
          description: pattern.description
        });
        break;
      }
    }
    
    if (!targetCardName) {
      console.log('生成対象カード名が不明:', ability.description);
      return { success: false, message: '生成対象が不明です' };
    }
    
    // カード名からIDを推測（完全版）
    const cardNameToId = {
      'ゴリラ': 'gorilla',
      'ライオン': 'lion',
      'ガゼル': 'gazelle',
      'サボテン': 'cactus',
      'ハチ': 'bee',
      'アリ': 'ant',
      'アリクイ': 'anteater',
      'オカピ': 'okapi',
      'とうちゅうかそう': 'cordyceps',
      'ブナシメジ': 'mushroom',
      'ウサギ': 'rabbit',
      'チューリップ': 'tulip',
      'Mアカミミガメ': 'red_eared_slider',
      'サンゴ': 'coral',
      'タンポポ': 'dandelion',
      'ハイエナ': 'hyena',
      'ハエ': 'fly',
      'ホオジロサメ': 'great_white_shark',
      'Eクロロティカ': 'elysia_chlorotica',
      'テナガザル': 'gibbon',
      'オウム': 'parrot',
      'スカンク': 'skunk',
      'カ': 'mosquito',
      '超超アルパカ': 'super_alpaca',
      'シャチ': 'orca',
      'ザトウクジラ': 'humpback_whale',
      'シャチ typeB': 'orca_type_b',
      'トラ': 'tiger',
      'ツル': 'crane',
      'ニホンジカ': 'japanese_deer',
      'マグロ': 'tuna',
      'ジュゴン': 'dugong',
      'ワカメ': 'seaweed'
    };
    
    targetCardId = cardNameToId[targetCardName];
    console.log('カード名→ID変換:', { targetCardName, targetCardId });
    
    if (!targetCardId) {
      console.log('カードIDが見つかりません:', targetCardName);
      return { success: false, message: `${targetCardName}のIDが見つかりません` };
    }
    
    // 条件チェック: 「がいない場合」の処理
    if (conditionCheck) {
      const existsInNeutral = neutralField.some(nc => nc.id === targetCardId);
      console.log('条件チェック:', { 
        targetCardName, 
        targetCardId, 
        existsInNeutral,
        neutralFieldCards: neutralField.map(nc => `${nc.name}(${nc.id})`)
      });
      
      if (existsInNeutral) {
        console.log('条件不満足: カードは既に中立フィールドに存在します');
        return { success: false, message: `${targetCardName}は既に中立フィールドに存在します` };
      }
    }
    
    // カードプールから対象カードを探す
    const cardPool = this.game.cardPool || [];
    const templateCard = cardPool.find(c => c.id === targetCardId);
    
    console.log('テンプレートカード検索:', { 
      targetCardId, 
      templateCard: templateCard ? templateCard.name : 'NOT FOUND',
      cardPoolSize: cardPool.length
    });
    
    if (!templateCard) {
      console.log('テンプレートカードが見つかりません:', targetCardId);
      return { success: false, message: `${targetCardName}のテンプレートが見つかりません` };
    }
    
    // 新しいカードを生成
    const newCard = this.createCardCopy(templateCard);
    if (newCard) {
      // 中立フィールドに追加
      neutralField.push(newCard);
      console.log('中立フィールドにカードを生成:', { 
        cardName: newCard.name, 
        cardId: newCard.id,
        conditionCheck: conditionCheck,
        neutralFieldAfter: neutralField.map(nc => `${nc.name}(${nc.id})`)
      });
      
      // IPボーナスがある場合
      if (ability.description.includes('IP＋')) {
        const ipMatch = ability.description.match(/IP[＋+](\d+)/);
        if (ipMatch) {
          const ipGain = parseInt(ipMatch[1]);
          // 効果を発動したプレイヤーを特定する必要がある
          // 現在のプレイヤーコンテキストを取得
          const currentPlayer = this.game.players[this.game.currentPlayerIndex];
          if (currentPlayer) {
            currentPlayer.points += ipGain;
            return { success: true, message: `${targetCardName}を中立フィールドに生成し、${ipGain}IP獲得しました` };
          }
        }
      }
      
      return { success: true, message: `${targetCardName}を中立フィールドに生成しました` };
    }
    
    return { success: false, message: 'カードの生成に失敗しました' };
  }
}

module.exports = CardEffects;
