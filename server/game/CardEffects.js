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
    console.log(`🗡️ 侵略回数更新: プレイヤー${playerId}の侵略回数が${this.invasionCount[playerId]}回になりました`);
    
    // 現在の全プレイヤーの侵略回数を表示
    console.log('📊 全プレイヤー侵略回数:', this.invasionCount);
    
    // クライアントに即座に侵略回数更新を通知
    this.game.players.forEach(player => {
      player.socket.emit('cardEffectStates', this.getEffectStates());
    });
  }

  getInvasionCount(playerId) {
    return this.invasionCount[playerId] || 0;
  }

  // カード効果状態を取得（クライアントに送信用）
  getEffectStates() {
    return {
      invasionCounts: { ...this.invasionCount }
    };
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
      // カード枚数による前提条件チェック（本来のコスト：自フィールドの同種枚数）
      if (ability.cost) {
        const cardCount = player.field.filter(fieldCard => fieldCard.id === card.id).length;
        if (cardCount < ability.cost) {
          console.log('獲得時効果 - カード枚数不足:', { 
            cardName: card.name, 
            requiredCount: ability.cost,
            actualCount: cardCount,
            description: ability.description
          });
          return; // カード枚数不足で発動しない
        }
      }
      
      console.log('獲得時効果実行:', { 
        cardName: card.name, 
        description: ability.description,
        cost: ability.cost,
        note: '本来のコスト（同種カード枚数）要件を満たして実行' 
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
    
    // コスト管理: 本来のコストは自フィールドの同種カード枚数
    // 獲得時効果以外でコストチェックを行う
    if (ability.type !== '獲得時' && ability.cost) {
      // 自フィールドの同種カード数をチェック
      const sameTypeCards = player.field.filter(fieldCard => fieldCard.id === card.id);
      if (sameTypeCards.length < ability.cost) {
        console.log('コスト不足（同種カード枚数）:', { 
          cardName: card.name, 
          requiredCost: ability.cost,
          actualCount: sameTypeCards.length,
          abilityType: ability.type
        });
        return this.createErrorResponse(
          ERROR_CODES.INSUFFICIENT_COST,
          `コストが不足しています（同種カード${ability.cost}枚必要、現在${sameTypeCards.length}枚）`,
          { required: ability.cost, current: sameTypeCards.length, cardName: card.name }
        );
      }
      
      console.log('コスト確認完了:', { 
        cardName: card.name, 
        requiredCost: ability.cost,
        actualCount: sameTypeCards.length,
        abilityType: ability.type,
        note: '同種カード枚数による本来のコスト要件'
      });
    }
    
    try {
      let result;
      switch (ability.type) {
        case '侵略':
          // Skunk: フントークンを破棄し、1体追放する
          if (card.id === 'skunk' && ability.description.includes('フントークンを破棄し、1体追放する')) {
            // フィールドからフントークンを探す
            const funTokenCard = player.field.find(c => c.id === 'fun_token' && !c.isFatigued);
            if (!funTokenCard) {
              result = { success: false, message: 'フントークンがありません' };
            } else {
              // フントークンカードを削除
              const tokenIndex = player.field.indexOf(funTokenCard);
              player.field.splice(tokenIndex, 1);
              // 数値も減算
              if (player.funTokens) player.funTokens = Math.max(0, player.funTokens - 1);
              // Needs target selection, so handled in executeInvasionWithTarget
              result = { success: false, message: '追放する対象を選択してください', needsTarget: true };
            }
          } else {
            result = this.executeInvasion(player, card, ability);
            // 侵略効果が成功した場合のみ回数追跡（対象選択必要な場合は後でカウント）
            if (result.success && !result.needsTarget) {
              this.incrementInvasion(player.id);
              console.log(`侵略効果成功: ${player.name}の侵略回数が${this.getInvasionCount(player.id)}回になりました`);
            }
          }
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
        // 対象選択が必要な場合や複数選択が必要な場合も正常動作とみなす
        const isWorking = result.success || result.needsTarget || result.needsMultipleSelection;
        const status = isWorking ? 'working' : 'broken';
        this.statusDB.setEffectStatus(card.id, abilityIndex, status, player.name);
        console.log(`効果ステータス記録: ${card.name} (${abilityIndex}) -> ${status}`, {
          success: result.success,
          needsTarget: result.needsTarget,
          needsMultipleSelection: result.needsMultipleSelection,
          message: result.message
        });
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
      targetName: target ? target.name : 'null (事前チェック)'
    });

    try {
      let result;
      switch (ability.type) {
        case '侵略':
          // Skunk: フントークンを破棄し、1体追放する
          if (card.id === 'skunk' && ability.description.includes('フントークンを破棄し、1体追放する')) {
            // フィールドからフントークンを探す
            const funTokenCard = player.field.find(c => c.id === 'fun_token' && !c.isFatigued);
            if (!funTokenCard) {
              result = { success: false, message: 'フントークンがありません' };
            } else {
              // フントークンカードを削除
              const tokenIndex = player.field.indexOf(funTokenCard);
              player.field.splice(tokenIndex, 1);
              // 数値も減算
              if (player.funTokens) player.funTokens = Math.max(0, player.funTokens - 1);
              // Exile the selected target
              const exileResult = this.exileTarget(target, 'フントークンを破棄して');
              result = exileResult;
            }
            if (result.success) {
              this.incrementInvasion(player.id);
            }
          } else {
            result = this.executeInvasionWithTarget(player, card, ability, target);
            // 侵略効果が成功した場合のみ回数追跡
            if (result.success) {
              this.incrementInvasion(player.id);
              console.log(`対象選択侵略効果成功: ${player.name}の侵略回数が${this.getInvasionCount(player.id)}回になりました`);
            }
          }
          break;
        case '強化':
          result = this.executeEnhancementWithTarget(player, card, ability, target);
          break;
        case '敵ターン開始時':
          result = this.executeEnemyTurnStartWithTarget(player, card, ability, target);
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

  // 複数対象選択能力実行
  executeAbilityWithMultipleTargets(player, card, ability, selectedTargets, cardId, abilityIndex) {
    console.log('複数対象選択能力実行:', { 
      cardName: card.name, 
      abilityDescription: ability.description,
      selectedTargetsCount: selectedTargets ? selectedTargets.length : 0,
      selectedTargets: selectedTargets ? selectedTargets.map(t => t.name || t.id) : []
    });

    try {
      // ライオンの特殊効果（追放されたカードを敵フィールドに置く）
      if (ability.description.includes('追放されたカードを好きなだけ敵フィールドに置く')) {
        return this.executeLionSpecialEffectWithTargets(player, card, ability, selectedTargets);
      }

      return { success: false, message: '複数選択効果の処理に失敗しました' };
    } catch (error) {
      console.error('複数対象選択能力実行エラー:', error);
      return { success: false, message: 'エラーが発生しました' };
    }
  }

  // 侵略効果
  executeInvasion(player, card, ability) {
    console.log('侵略効果実行:', { description: ability.description });
    const opponent = this.getOpponent(player);
    
    // ハイエナの条件付き侵略効果
    if (ability.description.includes('自分が他に侵略持ちを所持してがいる場合')) {
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
    
    // 汎用侵略効果処理
    const invasionResult = this.processInvasionEffects(ability, player, opponent, card);
    if (invasionResult.processed) {
      return invasionResult;
    }

    // ゴリラの侵略効果：同種を疲労させ、疲労済を追放する
    if (ability.description.includes('同種を1枚疲労させ、疲労済を追放する')) {
      console.log('ゴリラの侵略効果：同種疲労+疲労済追放');
      
      // 同種カードを疲労させる
      const sameTypeCards = player.field.filter(c => 
        c.id === card.id && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (sameTypeCards.length === 0) {
        return { success: false, message: '疲労させる同種カードがありません' };
      }
      
      // 同種カードを疲労させる
      sameTypeCards[0].isFatigued = true;
      console.log('同種カードを疲労させました:', sameTypeCards[0].name);
      
      // 疲労済みカードを追放する
      const fatigueTargets = opponent.field.filter(c => c.isFatigued);
      if (fatigueTargets.length > 0) {
        const exileTarget = this.selectTargetCard(fatigueTargets, 'any');
        if (exileTarget) {
          const exileResult = this.exileTarget(exileTarget, '同種疲労後に');
          console.log('疲労済みカードを追放しました:', exileTarget.name);
          return { 
            success: true, 
            message: `${sameTypeCards[0].name}を疲労させ、${exileTarget.name}を追放しました` 
          };
        }
      } else {
        return { 
          success: true, 
          message: `${sameTypeCards[0].name}を疲労させました（追放対象の疲労済みカードなし）` 
        };
      }
    }

    // アリクイの侵略効果：同種を疲労させ、任意の1体を追放する
    if (ability.description.includes('同種を疲労させ、1体追放する')) {
      console.log('アリクイの侵略効果：同種疲労+追放');
      
      // 同種カードを疲労させる
      const sameTypeCards = player.field.filter(c => 
        c.id === card.id && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (sameTypeCards.length === 0) {
        return { success: false, message: '疲労させる同種カードがありません' };
      }
      
      // 追放対象候補をチェック
      const exileCandidates = opponent.field.filter(c => true); // 任意のカード
      if (exileCandidates.length > 0) {
        console.log('対象選択が必要な効果です');
        return { success: false, message: '対象選択が必要です', needsTarget: true };
      } else {
        return { success: false, message: '追放可能な対象がありません' };
      }
    }

    // 増加IP消費系の追放効果（対象選択が必要）
    if (ability.description.includes('増加IP') && ability.description.includes('追放')) {
      const ipCostMatch = ability.description.match(/増加IP(\d+)消費/);
      if (ipCostMatch) {
        const ipCost = parseInt(ipCostMatch[1]);
        console.log('侵略効果内の増加IP消費チェック:', { required: ipCost, current: player.ipIncrease, note: '効果文に明記された増加IP消費' });
        
        if (player.ipIncrease >= ipCost) {
          // 追放対象の候補をチェック
          const exileCandidates = opponent.field.filter(c => !c.isFatigued);
          console.log('追放候補:', { count: exileCandidates.length, cards: exileCandidates.map(c => c.name) });
          
          if (exileCandidates.length > 0) {
            console.log('対象選択が必要な効果です');
            return { success: false, message: '対象選択が必要です', needsTarget: true };
          } else {
            return { success: false, message: '追放可能な対象がありません' };
          }
        } else {
          return { success: false, message: `増加IPが不足しています（${ipCost}以上必要、現在${player.ipIncrease}）` };
        }
      }
    }

    // 通常IP消費系（効果文に明記されている場合のみ）
    if (ability.description.includes('IP消費') || 
        (ability.description.includes('IP') && ability.description.includes('消費'))) {
      const ipCostMatch = ability.description.match(/(\d+)IP消費/) || 
                         ability.description.match(/IPを(\d+)消費/) ||
                         ability.description.match(/自分のIPを(\d+)消費/);
      if (ipCostMatch) {
        const ipCost = parseInt(ipCostMatch[1]);
        console.log('侵略効果内のIP消費チェック:', { required: ipCost, current: player.points, note: '効果文に明記されたIP消費' });
        if (player.points >= ipCost) {
          player.points -= ipCost;
          console.log('侵略効果でIP消費しました:', { cost: ipCost, remaining: player.points });
          
          // 疲労済追放の対応
          if (ability.description.includes('疲労済を追放する')) {
            return this.executeExile(player, opponent, ability, 'fatigued');
          }
          
          if (ability.description.includes('追放する')) {
            if (ability.description.includes('1匹追放する') || ability.description.includes('1体追放する')) {
              // 対象選択が必要
              const exileCandidates = opponent.field.filter(c => !c.isFatigued);
              if (exileCandidates.length > 0) {
                console.log('対象選択が必要な効果です');
                return { success: false, message: '対象選択が必要です', needsTarget: true };
              } else {
                return { success: false, message: '追放可能な対象がありません' };
              }
            }
            return this.executeExile(player, opponent, ability);
          }
          
          // 自身疲労回復効果
          if (ability.description.includes('自身の疲労除去する') || 
              ability.description.includes('自身の疲労を除去する')) {
            card.isFatigued = false;
            console.log('侵略効果で自身疲労回復:', card.name);
          }
        } else {
          console.log('IPが不足しています');
          return { success: false, message: `IPが不足しています（${ipCost}IP必要、現在${player.points}IP）` };
        }
      }
    }

    // 特殊効果
    if (ability.description.includes('フントークン')) {
      return this.handlePoop(player, opponent, ability);
    }

    // ハチの特殊侵略効果：自分のハチを2匹疲労させ、1匹追放する
    if (ability.description.includes('自分のハチを2匹疲労させ、1匹追放する')) {
      console.log('ハチの特殊侵略効果:', { description: ability.description });
      
      // 自分のフィールドの疲労していないハチを探す
      const activeBees = player.field.filter(c => 
        c.id === 'bee' && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (activeBees.length < 2) {
        return { success: false, message: '疲労させるハチが2匹いません（現在' + activeBees.length + '匹）' };
      }
      
      // 2匹のハチを疲労させる
      activeBees[0].isFatigued = true;
      activeBees[1].isFatigued = true;
      console.log('ハチ2匹を疲労させました:', [activeBees[0].name, activeBees[1].name]);
      
      // 相手のカードから追放対象を選択
      const exileCandidates = opponent.field.filter(c => !c.isFatigued);
      if (exileCandidates.length > 0) {
        console.log('対象選択が必要な効果です');
        return { success: false, message: '追放する対象を選択してください', needsTarget: true };
      } else {
        return { 
          success: true, 
          message: 'ハチ2匹を疲労させました（追放可能な対象がありません）' 
        };
      }
    }

    // とうちゅうかそうの侵略効果：自分のIPを5消費し、相手のカードを疲労させる
    if (ability.description.includes('自分のIPを5消費し、相手のカードを疲労させる')) {
      console.log('とうちゅうかそうの侵略効果:', { description: ability.description });
      
      // IP5消費チェック
      if (player.points < 5) {
        return { success: false, message: 'IPが不足しています（5IP必要、現在' + player.points + 'IP）' };
      }
      
      // 相手のカードから疲労対象を選択
      const fatigueCandidates = opponent.field.filter(c => !c.isFatigued);
      if (fatigueCandidates.length > 0) {
        console.log('対象選択が必要な効果です');
        return { success: false, message: '疲労させる対象を選択してください', needsTarget: true };
      } else {
        return { success: false, message: '疲労させる対象がありません' };
      }
    }

    // とうちゅうかそうの特殊侵略効果：相手の侵略持ちカードを発動させる
    if (ability.description.includes('相手の侵略持ちカードを発動させる')) {
      console.log('とうちゅうかそうの特殊効果:', { description: ability.description });
      
      // 相手の侵略持ちカードを取得
      const opponentInvasionCards = opponent.field.filter(c => 
        !c.isFatigued && c.abilities && c.abilities.some(a => a.type === '侵略')
      );
      
      if (opponentInvasionCards.length === 0) {
        return { success: false, message: '相手に発動可能な侵略持ちカードがありません' };
      }
      
      // 最初の侵略持ちカードを強制発動（簡易実装）
      const targetCard = opponentInvasionCards[0];
      const invasionAbility = targetCard.abilities.find(a => a.type === '侵略');
      
      console.log('相手カード強制発動:', { 
        cardName: targetCard.name, 
        abilityDescription: invasionAbility.description 
      });
      
      // 相手のカードの効果を現在のプレイヤーに有利になるよう調整
      // TODO: より複雑な相手効果発動システムの実装
      this.gamelog.log(`${this.getCurrentPlayerName()} forces ${targetCard.name} to activate invasion effect`);
      
      return { success: true, message: `${targetCard.name}の侵略効果を強制発動させました` };
    }

    console.log('侵略効果処理完了');
    return { success: true, message: `${ability.description}を実行しました` };
  }

  // 対象指定侵略効果
  executeInvasionWithTarget(player, card, ability, target) {
    console.log('対象指定侵略効果実行:', { 
      description: ability.description, 
      targetName: target ? target.name : 'null (事前チェック)', 
      targetFatigue: target ? target.isFatigued : 'null'
    });
    
    // 事前チェック（target = null）の場合、ライオンの特殊効果をチェック
    if (!target) {
      if (ability.description.includes('追放されたカードを好きなだけ敵フィールドに置く')) {
        console.log('ライオン特殊効果の事前チェック:', {
          description: ability.description,
          exileFieldCount: this.game.exileField ? this.game.exileField.length : 0,
          exileCards: this.game.exileField ? this.game.exileField.map(c => c.name) : []
        });
        
        if (!this.game.exileField || this.game.exileField.length === 0) {
          return { success: false, message: '追放フィールドにカードがありません' };
        }
        
        // 複数選択が必要であることを示すレスポンス
        return { 
          success: false, 
          message: '追放されたカードを選択してください', 
          needsMultipleSelection: true,
          selectionTargets: this.game.exileField.map(card => ({
            id: card.instanceId || card.fieldId || card.id,
            name: card.name,
            type: 'exile',
            card: card
          }))
        };
      }
      
      return { success: false, message: '対象が指定されていません' };
    }
    
    // 条件付き侵略効果
    if (ability.description.includes('自分が他に侵略持ちを所持してがいる場合')) {
      return this.executeConditionalInvasion(player, card, ability, target);
    }
    
    // 特定対象への疲労効果
    if (ability.description.includes('敵のアリを疲労させるIP+2')) {
      return this.executeSpecificTargetFatigue(player, card, ability, target, 'ant', 2);
    }

    // アリクイの複合効果：同種疲労+任意のカード追放（侵略効果内で処理）
    if (ability.description.includes('同種を疲労させ、1体追放する')) {
      console.log('アリクイの侵略効果（対象指定）:', {
        targetName: target.name,
        targetFatigued: target.isFatigued,
        description: ability.description
      });
      
      // 同種カードを疲労させる
      const sameTypeCards = player.field.filter(c => 
        c.id === card.id && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (sameTypeCards.length === 0) {
        return { success: false, message: '疲労させる同種カードがありません' };
      }
      
      // 同種カードを疲労させてから追放実行
      sameTypeCards[0].isFatigued = true;
      console.log('同種カードを疲労させました:', sameTypeCards[0].name);
      
      // 任意の対象カードを追放
      const exileResult = this.exileTarget(target, '同種疲労後に');
      if (exileResult.success) {
        return { 
          success: true, 
          message: `${sameTypeCards[0].name}を疲労させ、${target.name}を追放しました` 
        };
      } else {
        return exileResult;
      }
    }

    // ハチの特殊侵略効果（対象指定版）：自分のハチを2匹疲労させ、対象を追放する
    if (ability.description.includes('自分のハチを2匹疲労させ、1匹追放する')) {
      console.log('ハチの特殊侵略効果（対象指定）:', {
        targetName: target.name,
        targetFatigued: target.isFatigued,
        description: ability.description
      });
      
      // 自分のフィールドの疲労していないハチを探す
      const activeBees = player.field.filter(c => 
        c.id === 'bee' && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (activeBees.length < 2) {
        return { success: false, message: '疲労させるハチが2匹いません（現在' + activeBees.length + '匹）' };
      }
      
      // 2匹のハチを疲労させる
      activeBees[0].isFatigued = true;
      activeBees[1].isFatigued = true;
      console.log('ハチ2匹を疲労させました:', [activeBees[0].name, activeBees[1].name]);
      
      // 対象を追放
      const exileResult = this.exileTarget(target, 'ハチ2匹疲労後に');
      if (exileResult.success) {
        return { 
          success: true, 
          message: `ハチ2匹を疲労させ、${target.name}を追放しました` 
        };
      } else {
        return exileResult;
      }
    }

    // とうちゅうかそうの侵略効果（対象指定版）：自分のIPを5消費し、相手のカードを疲労させる
    if (ability.description.includes('自分のIPを5消費し、相手のカードを疲労させる')) {
      console.log('とうちゅうかそうの侵略効果（対象指定）:', {
        targetName: target.name,
        targetFatigued: target.isFatigued,
        description: ability.description
      });
      
      // IP5消費チェック
      if (player.points < 5) {
        return { success: false, message: 'IPが不足しています（5IP必要、現在' + player.points + 'IP）' };
      }
      
      // 対象が既に疲労しているかチェック
      if (target.isFatigued) {
        return { success: false, message: `${target.name}は既に疲労しています` };
      }
      
      // IP消費して対象を疲労させる
      player.points -= 5;
      target.isFatigued = true;
      console.log('IP5消費して相手カードを疲労させました:', { 
        targetName: target.name,
        remainingPoints: player.points
      });
      
      return { 
        success: true, 
        message: `5IP消費して${target.name}を疲労させました` 
      };
    }
    
    // 追放効果（アリクイ以外）
    if (ability.description.includes('追放') && !ability.description.includes('同種を疲労させ、1体追放する')) {
      return this.executeExileWithTarget(player, card, ability, target);
    }
    
    return { success: true, message: `${target.name}に対して${ability.description}を実行しました` };
  }

  // 条件付き侵略効果（ハイエナ等）
  executeConditionalInvasion(player, card, ability, target) {
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

  // 特定カードを疲労させてIPボーナス獲得
  executeSpecificTargetFatigue(player, card, ability, target, requiredCardId, ipBonus) {
    // 対象が指定カードかチェック
    if (target.id === requiredCardId && !target.isFatigued) {
      target.isFatigued = true;
      player.points += ipBonus;
      console.log(`${requiredCardId}を疲労させてIP+${ipBonus}獲得:`, { 
        targetName: target.name, 
        newPoints: player.points 
      });
      return { success: true, message: `${target.name}を疲労させて${ipBonus}IP獲得しました` };
    } else if (target.id !== requiredCardId) {
      console.log(`対象が${requiredCardId}ではありません:`, target.name);
      const cardTypeMap = { 'ant': 'アリ', 'bee': 'ハチ', 'rabbit': 'ウサギ' };
      const cardTypeName = cardTypeMap[requiredCardId] || requiredCardId;
      return { success: false, message: `対象は${cardTypeName}ではありません` };
    } else {
      console.log(`${requiredCardId}は既に疲労しています:`, target.name);
      const cardTypeMap = { 'ant': 'アリ', 'bee': 'ハチ', 'rabbit': 'ウサギ' };
      const cardTypeName = cardTypeMap[requiredCardId] || requiredCardId;
      return { success: false, message: `${cardTypeName}は既に疲労しています` };
    }
  }

  // 基本的な疲労効果
  executeBasicFatigue(player, card, ability, target) {
    if (!target.isFatigued) {
      target.isFatigued = true;
      console.log('対象を疲労させました:', target.name);
      return { success: true, message: `${target.name}を疲労させました` };
    } else {
      console.log('対象は既に疲労しています:', target.name);
      return { success: false, message: `${target.name}は既に疲労しています` };
    }
  }

  // 対象指定追放効果
  executeExileWithTarget(player, card, ability, target) {
    console.log('対象指定追放効果実行:', { 
      description: ability.description, 
      targetName: target.name,
      playerName: player.name
    });
    
    // 対象が敵のカードかチェック
    const opponent = this.getOpponent(player);
    const isEnemyCard = opponent.field.includes(target);
    
    if (!isEnemyCard) {
      console.log('対象が敵のカードではありません:', target.name);
      return { success: false, message: '敵のカードを対象に選択してください' };
    }
    
    // 増加IP消費系の追放効果（効果文に明記されている場合）
    if (ability.description.includes('増加IP2消費し、1匹追放する')) {
      console.log('侵略効果内の増加IP追放効果チェック:', { 
        currentIpIncrease: player.ipIncrease || 0, 
        required: 2,
        note: '効果文に明記された増加IP消費' 
      });
      
      // ipIncreaseが未定義の場合は0で初期化
      if (typeof player.ipIncrease === 'undefined') {
        player.ipIncrease = 0;
      }
      
      if (player.ipIncrease >= 2) {
        player.ipIncrease -= 2;
        console.log('増加IP2消費して追放実行:', { 
          targetName: target.name,
          remainingIpIncrease: player.ipIncrease
        });
        return this.exileTarget(target, '増加IP2消費して');
      } else {
        return { success: false, message: '増加IPが不足しています（2以上必要、現在' + player.ipIncrease + '）' };
      }
    }
    
    // IP消費系の追放効果（効果文に明記されている場合：自身疲労回復含む）
    if (ability.description.includes('IP消費') || 
        (ability.description.includes('IP') && ability.description.includes('消費'))) {
      const ipCostMatch = ability.description.match(/IP(\d+)消費/) || 
                         ability.description.match(/(\d+)IP消費/) || 
                         ability.description.match(/IPを(\d+)消費/) ||
                         ability.description.match(/自分のIPを(\d+)消費/);
      if (ipCostMatch) {
        const ipCost = parseInt(ipCostMatch[1]);
        console.log('侵略効果内のIP消費追放効果チェック:', { 
          currentPoints: player.points, 
          required: ipCost,
          note: '効果文に明記されたIP消費'
        });
        
        if (player.points >= ipCost) {
          player.points -= ipCost;
          console.log(`${ipCost}IP消費して追放実行:`, { 
            targetName: target.name,
            remainingPoints: player.points
          });
          
          const result = this.exileTarget(target, `${ipCost}IP消費して`);
          
          // 自身の疲労除去効果
          if (ability.description.includes('自身の疲労除去する')) {
            card.isFatigued = false;
            console.log('追放後に自身の疲労を除去:', card.name);
            result.message += '、自身の疲労を除去しました';
          }
          
          return result;
        } else {
          return { success: false, message: `IPが不足しています（${ipCost}IP必要、現在${player.points}IP）` };
        }
      }
    }

    // ライオンの特殊効果（追放されたカードを敵フィールドに置く）
    if (ability.description.includes('追放されたカードを好きなだけ敵フィールドに置く')) {
      console.log('ライオン特殊効果の対象確認:', {
        description: ability.description,
        exileFieldCount: this.game.exileField ? this.game.exileField.length : 0,
        exileCards: this.game.exileField ? this.game.exileField.map(c => c.name) : []
      });
      
      if (!this.game.exileField || this.game.exileField.length === 0) {
        return { success: false, message: '追放フィールドにカードがありません' };
      }
      
      // 複数選択が必要であることを示すレスポンス
      return { 
        success: false, 
        message: '追放されたカードを選択してください', 
        needsMultipleSelection: true,
        selectionTargets: this.game.exileField.map(card => ({
          id: card.instanceId || card.fieldId || card.id,
          name: card.name,
          type: 'exile',
          card: card
        }))
      };
    }

    // ゴリラの複合効果：同種疲労+疲労済追放（対象指定版）
    if (ability.description.includes('同種を1枚疲労させ、疲労済を追放する')) {
      console.log('ゴリラの対象指定追放効果:', {
        targetName: target.name,
        targetFatigued: target.isFatigued,
        description: ability.description
      });
      
      // 対象が疲労済みかチェック
      if (!target.isFatigued) {
        return { success: false, message: '疲労済みのカードを対象に選択してください' };
      }
      
      // 同種カードを疲労させる
      const sameTypeCards = player.field.filter(c => 
        c.id === card.id && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (sameTypeCards.length === 0) {
        return { success: false, message: '疲労させる同種カードがありません' };
      }
      
      // 同種カードを疲労させてから追放実行
      sameTypeCards[0].isFatigued = true;
      console.log('同種カードを疲労させました:', sameTypeCards[0].name);
      
      // 疲労済みカードを追放
      const exileResult = this.exileTarget(target, '同種疲労後に');
      if (exileResult.success) {
        return { 
          success: true, 
          message: `${sameTypeCards[0].name}を疲労させ、${target.name}を追放しました` 
        };
      } else {
        return exileResult;
      }
    }

    // アリクイの複合効果：同種疲労+任意のカード追放（対象指定版）
    if (ability.description.includes('同種を疲労させ、1体追放する')) {
      console.log('アリクイの対象指定追放効果:', {
        targetName: target.name,
        targetFatigued: target.isFatigued,
        description: ability.description
      });
      
      // 同種カードを疲労させる
      const sameTypeCards = player.field.filter(c => 
        c.id === card.id && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (sameTypeCards.length === 0) {
        return { success: false, message: '疲労させる同種カードがありません' };
      }
      
      // 同種カードを疲労させてから追放実行
      sameTypeCards[0].isFatigued = true;
      console.log('同種カードを疲労させました:', sameTypeCards[0].name);
      
      // 任意の対象カードを追放
      const exileResult = this.exileTarget(target, '同種疲労後に');
      if (exileResult.success) {
        return { 
          success: true, 
          message: `${sameTypeCards[0].name}を疲労させ、${target.name}を追放しました` 
        };
      } else {
        return exileResult;
      }
    }

    return { success: false, message: '追放効果の処理に失敗しました' };
  }

  // 対象を追放する共通処理
  exileTarget(target, costDescription = '') {
    const targetOwner = this.game.players.find(p => p.field.includes(target));
    if (targetOwner) {
      const cardIndex = targetOwner.field.indexOf(target);
      targetOwner.field.splice(cardIndex, 1);
      if (!this.game.exileField) this.game.exileField = [];
      this.game.exileField.push(target);
      console.log('対象を追放しました:', target.name);
      return { success: true, message: `${costDescription}${target.name}を追放しました` };
    }
    return { success: false, message: '追放対象が見つかりません' };
  }

  // 強化効果
  executeEnhancement(player, card, ability) {

    // Pitcher Plant: mutual recovery effect needs target selection
    if (card.id === 'pitcherplant' && ability.description.includes('敵のカードを1枚回復することで、味方のカードを1枚回復する')) {
      // Check for fatigued enemy cards
      const opponent = this.getOpponent(player);
      const fatiguedEnemies = opponent.field.filter(c => c.isFatigued);
      if (fatiguedEnemies.length > 0) {
        // Needs target selection with target info
        return { 
          success: false, 
          message: '回復する敵カードを選択してください', 
          needsTarget: true,
          validTargets: fatiguedEnemies.map(target => ({
            fieldId: target.fieldId || target.instanceId,
            name: target.name,
            owner: opponent.name,
            isFatigued: target.isFatigued
          }))
        };
      } else {
        return { success: false, message: '疲労している敵カードがいません' };
      }
    }

    // ...existing code...

    // 同種疲労 + 同種獲得の複合効果（一般的な疲労処理より前に）
    if (ability.description.includes('同種を疲労させ、同種を獲得する') || 
        ability.description.includes('同種を1枚疲労させ、同種を1枚生成する')) {
      const sameTypeCards = player.field.filter(c => 
        c.id === card.id && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (sameTypeCards.length > 0) {
        // 同種を疲労させる
        sameTypeCards[0].isFatigued = true;
        console.log('【複合効果】同種カードを疲労させました:', sameTypeCards[0].name);
        
        // 同種を獲得する
        const newCard = this.createCardCopy(card, true); // 疲労状態で獲得
        if (newCard) {
          player.field.push(newCard);
          console.log('同種を獲得しました:', { cardName: card.name, isFatigued: true });
          return { success: true, message: `同種を疲労させ、${card.name}を獲得しました（疲労状態）` };
        }
      } else {
        return { success: false, message: '疲労させる同種カードがありません' };
      }
    }

    // 同種を1枚疲労させる効果（条件処理）- 複合効果でない場合のみ
    if (ability.description.includes('同種を1枚疲労させ') && 
        !ability.description.includes('同種を疲労させ、同種を獲得する') && 
        !ability.description.includes('同種を1枚疲労させ、同種を1枚生成する')) {
      const sameTypeCards = player.field.filter(c => 
        c.id === card.id && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (sameTypeCards.length > 0) {
        sameTypeCards[0].isFatigued = true;
        console.log('【一般疲労】同種カードを疲労させました:', sameTypeCards[0].name);
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

    // 同種生成（場所を明確に分岐）
    if (ability.description.includes('追放に同種を生成') || ability.description.includes('追放フィールドに同種を生成')) {
      // 追放フィールドに生成（上記の追放フィールド生成ロジックで処理される）
      // ここではreturnしない（上記のロジックが処理する）
    } else if (ability.description.includes('同種を生成') || ability.description.includes('同種を1枚生成')) {
      // 自分のフィールドに生成
      console.log('自フィールドに同種生成:', { 
        cardName: card.name, 
        description: ability.description 
      });
      
      const newCard = this.createCardCopy(card, true); // 疲労状態で生成
      if (newCard) {
        player.field.push(newCard);
        console.log('自フィールドに同種を生成完了:', { 
          cardName: newCard.name,
          fieldSize: player.field.length,
          isFatigued: newCard.isFatigued
        });
        return { success: true, message: `${card.name}を生成しました（疲労状態）` };
      }
    }

    // 同種を疲労させ + 追放から獲得の複合効果（具体的な条件を先に）
    if (ability.description.includes('同種を疲労させ、追放から') && ability.description.includes('獲得')) {
      const sameTypeCards = player.field.filter(c => 
        c.id === card.id && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (sameTypeCards.length === 0) {
        return { success: false, message: '疲労させる同種カードがありません' };
      }
      
      if (!this.game.exileField || this.game.exileField.length === 0) {
        return { success: false, message: '追放フィールドにカードがありません' };
      }
      
      // 同種を疲労させる
      sameTypeCards[0].isFatigued = true;
      console.log('同種カードを疲労させました:', sameTypeCards[0].name);
      
      // 追放から獲得
      const exileCard = this.selectTargetCard(this.game.exileField);
      if (exileCard) {
        const cardIndex = this.game.exileField.indexOf(exileCard);
        this.game.exileField.splice(cardIndex, 1);
        
        exileCard.isFatigued = true; // 獲得したカードは疲労状態
        player.field.push(exileCard);
        
        console.log('追放から獲得:', { cardName: exileCard.name, isFatigued: true });
        return { success: true, message: `同種を疲労させ、${exileCard.name}を追放から獲得しました` };
      }
    }

    // 追放から獲得（一般的）
    if (ability.description.includes('追放から') && ability.description.includes('獲得')) {
      if (this.game.exileField && this.game.exileField.length > 0) {
        const exileCard = this.selectTargetCard(this.game.exileField);
        if (exileCard) {
          const cardIndex = this.game.exileField.indexOf(exileCard);
          this.game.exileField.splice(cardIndex, 1);
          
          // 獲得したカードは疲労状態
          exileCard.isFatigued = true;
          player.field.push(exileCard);
          
          console.log('追放から獲得:', { cardName: exileCard.name, isFatigued: true });
          return { success: true, message: `${exileCard.name}を追放から獲得しました（疲労状態）` };
        }
      } else {
        return { success: false, message: '追放フィールドにカードがありません' };
      }
    }

    // 追放フィールドに同種を生成
    if ((ability.description.includes('追放フィールドに') || ability.description.includes('追放に')) && ability.description.includes('を生成')) {
      const targetMatch = ability.description.match(/追放フィールドに([ア-ヾ一-龠]+)を生成/) || 
                         ability.description.match(/追放に([ア-ヾ一-龠]+)を生成/);
      
      if (targetMatch) {
        const targetName = targetMatch[1];
        
        console.log('追放フィールド生成効果:', { 
          description: ability.description,
          targetName: targetName,
          cardName: card.name
        });
        
        // 「同種」の場合は現在のカードと同じIDのカードを生成
        if (targetName === '同種') {
          if (!this.game.exileField) {
            this.game.exileField = [];
          }
          
          const newCard = this.createCardCopy(card, false); // 追放では疲労状態は関係ない
          if (newCard) {
            this.game.exileField.push(newCard);
            console.log('追放フィールドに同種を生成:', { 
              cardName: newCard.name,
              exileFieldSize: this.game.exileField.length
            });
            return { success: true, message: `追放フィールドに${card.name}を生成しました` };
          }
        } else {
          // 特定のカード名の場合のマッピング
          const cardNameToId = {
            'ニホンジカ': 'japanese_deer',
            'ライオン': 'lion',
            'ハチ': 'bee'
          };
          
          const targetCardId = cardNameToId[targetName];
          if (targetCardId) {
            const cardPool = this.game.cardPool || [];
            const templateCard = cardPool.find(c => c.id === targetCardId);
            
            if (templateCard) {
              if (!this.game.exileField) {
                this.game.exileField = [];
              }
              
              const newCard = this.createCardCopy(templateCard, false);
              if (newCard) {
                this.game.exileField.push(newCard);
                console.log('追放フィールドに特定カードを生成:', { 
                  cardName: newCard.name,
                  exileFieldSize: this.game.exileField.length
                });
                return { success: true, message: `追放フィールドに${targetName}を生成しました` };
              }
            }
          }
        }
      }
    }

    // フントークン生成
    if (ability.description.includes('フントークンを生成する')) {
      // フントークンをカードオブジェクトとして生成
      const fieldId = `funtoken_${Date.now()}_${Math.random()}`;
      const funToken = {
        id: 'fun_token',
        name: 'フントークン',
        fieldId: fieldId,
        instanceId: fieldId,
        abilities: [
          {
            type: 'ターン終了時',
            cost: 1,
            description: '自分のIP-1'
          }
        ],
        isFatigued: false
      };
      
      player.field.push(funToken);
      
      // 数値管理も併用（効果処理用）
      if (!player.funTokens) {
        player.funTokens = 0;
      }
      player.funTokens += 1;
      
      console.log('フントークン生成:', { 
        playerName: player.name, 
        funTokens: player.funTokens,
        cardName: funToken.name,
        fieldId: funToken.fieldId
      });
      
      return { success: true, message: `フントークンを1個生成しました（現在${player.funTokens}個）` };
    }

    // 自分のカードを追放 + 特定カード生成の複合効果
    if (ability.description.includes('自分のカード1枚追放する') && ability.description.includes('を生成する')) {
      const targetMatch = ability.description.match(/([ア-ヾ一-龠]+)を生成する/);
      if (targetMatch) {
        const targetCardName = targetMatch[1];
        
        // プレイヤーのフィールドから追放可能なカードを選択
        const exilableCards = player.field.filter(c => c.fieldId !== card.fieldId);
        if (exilableCards.length === 0) {
          return { success: false, message: '追放できるカードがありません' };
        }
        
        // ランダムに1枚選択して追放
        const cardToExile = this.selectTargetCard(exilableCards);
        if (cardToExile) {
          const cardIndex = player.field.indexOf(cardToExile);
          player.field.splice(cardIndex, 1);
          
          if (!this.game.exileField) {
            this.game.exileField = [];
          }
          this.game.exileField.push(cardToExile);
          
          console.log('カードを追放:', { cardName: cardToExile.name });
          
          // 指定されたカードを生成
          const cardNameToId = {
            'ニホンジカ': 'japanese_deer',
            'フントークン': 'fun_token' // 特殊処理
          };
          
          const targetCardId = cardNameToId[targetCardName];
          if (targetCardId && targetCardId !== 'fun_token') {
            const cardPool = this.game.cardPool || [];
            const templateCard = cardPool.find(c => c.id === targetCardId);
            
            if (templateCard) {
              const newCard = this.createCardCopy(templateCard, true);
              if (newCard) {
                player.field.push(newCard);
                console.log('カードを生成:', { cardName: newCard.name, isFatigued: true });
                return { success: true, message: `${cardToExile.name}を追放し、${targetCardName}を生成しました` };
              }
            }
          } else if (targetCardName === 'フントークン') {
            // フントークン生成（カードオブジェクトとして）
            const fieldId = `funtoken_${Date.now()}_${Math.random()}`;
            const funToken = {
              id: 'fun_token',
              name: 'フントークン',
              fieldId: fieldId,
              instanceId: fieldId,
              abilities: [
                {
                  type: 'ターン終了時',
                  cost: 1,
                  description: '自分のIP-1'
                }
              ],
              isFatigued: false
            };
            player.field.push(funToken);
            // 数値管理も併用
            if (!player.funTokens) player.funTokens = 0;
            player.funTokens += 1;
            console.log('フントークン生成:', { funTokens: player.funTokens });
            return { success: true, message: `${cardToExile.name}を追放し、フントークンを生成しました` };
          }
        }
      }
    }

    // IP消費してカード生成効果
    if (ability.description.includes('IP消費し') && ability.description.includes('を生成する')) {
      const ipMatch = ability.description.match(/(\d+)IP消費し/);
      const cardMatch = ability.description.match(/([ア-ヾ一-龠]+)を生成する/);
      
      if (ipMatch && cardMatch) {
        const ipCost = parseInt(ipMatch[1]);
        const targetCardName = cardMatch[1];
        
        if (player.points >= ipCost) {
          player.points -= ipCost;
          console.log('IP消費:', { cost: ipCost, remaining: player.points });
          
          // 同種生成の場合
          if (targetCardName === '同種' || card.name.includes(targetCardName)) {
            const newCard = this.createCardCopy(card, true);
            if (newCard) {
              player.field.push(newCard);
              console.log('同種生成（IP消費）:', { cardName: newCard.name, isFatigued: true });
              return { success: true, message: `${ipCost}IP消費して${card.name}を生成しました` };
            }
          }
        } else {
          return { success: false, message: `IPが不足しています（${ipCost}IP必要、現在${player.points}IP）` };
        }
      }
    }
    if (ability.description.includes('自フィールドに反応持ちががいる場合、5IP消費してブナシメジを生成する')) {
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
            description: '自フィールドに反応持ちががいる場合、5IP消費してブナシメジを生成する'
          },
          {
            type: '永続',
            cost: 2,
            description: '1ラウンドにつき一度のみ、自分の反応持ちが追放された場合、自分のブナシメジを1体追放しなければならない'
          }
        ],
        isFatigued: false
      };
      player.field.push(bunashimejiCard);
      console.log('ブナシメジ生成:', { player: player.name, card: bunashimejiCard.name });
      return { success: true, message: '5IP消費してブナシメジを生成しました' };
    }

    // 増加IP+1効果
    if (ability.description.includes('増加IP+1') || ability.description.includes('増加IP+1')) {
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

    // 条件付き同種獲得効果
    if (ability.description.includes('自フィールドに同種がいない場合、同種を獲得する')) {
      // 同種カードがフィールドにいるかチェック（実行中のカード以外）
      const hasSameType = player.field.some(c => 
        c.id === card.id && c.fieldId !== card.fieldId
      );
      
      console.log('条件付き同種獲得チェック:', { 
        cardName: card.name, 
        cardId: card.id,
        hasSameType,
        fieldCards: player.field.map(c => `${c.name}(${c.id})`).filter(name => name.includes(card.name))
      });
      
      if (!hasSameType) {
        const newCard = this.createCardCopy(card, true); // 疲労状態で獲得
        if (newCard) {
          player.field.push(newCard);
          console.log('条件達成 - 同種を獲得:', { cardName: card.name, isFatigued: true });
          return { success: true, message: `${card.name}を獲得しました（同種がいなかったため・疲労状態）` };
        }
      } else {
        console.log('条件不達成 - 同種が既に存在します');
        return { success: false, message: '自フィールドに同種が存在するため獲得できません' };
      }
    }

    // IP消費 + 同種獲得の複合効果（疲労しない）
    if (ability.description.includes('IP消費して同種を獲得する') && ability.description.includes('この効果で疲労しない')) {
      const ipCostMatch = ability.description.match(/(\d+)IP消費して/);
      if (ipCostMatch) {
        const ipCost = parseInt(ipCostMatch[1]);
        
        if (player.points >= ipCost) {
          player.points -= ipCost;
          console.log('IP消費:', { cost: ipCost, remaining: player.points });
          
          // 同種を獲得（回復状態）
          const newCard = this.createCardCopy(card, false); // 回復状態で獲得
          if (newCard) {
            player.field.push(newCard);
            console.log('同種を獲得（回復状態）:', { cardName: card.name, isFatigued: false });
            return { success: true, message: `${ipCost}IP消費して${card.name}を獲得しました（回復状態）` };
          }
        } else {
          return { success: false, message: `IPが不足しています（${ipCost}IP必要、現在${player.points}IP）` };
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
    
    // Pitcher Plant: mutual recovery
    if (card.id === 'pitcherplant' && ability.description.includes('敵のカードを1枚回復することで、味方のカードを1枚回復する')) {
      // Recover the target (enemy card)
      if (target.isFatigued) {
        target.isFatigued = false;
        // Find a fatigued card on own field to recover
        const ownFatigued = player.field.find(c => c.isFatigued);
        if (ownFatigued) {
          ownFatigued.isFatigued = false;
          return { success: true, message: `敵の${target.name}と自分の${ownFatigued.name}を回復しました` };
        } else {
          return { success: true, message: `敵の${target.name}を回復しました（自分の回復対象なし）` };
        }
      } else {
        return { success: false, message: '対象カードは疲労していません' };
      }
    }
    // Default
    return { success: true, message: `${target.name}に対して${ability.description}を実行しました` };
  }

  // 反応効果
  executeReaction(player, card, ability) {
    // 共通効果を優先チェック
    const commonResult = this.processCommonEffects(player, card, ability);
    if (commonResult) return commonResult;

    // Pitcher Plant: 敵フィールドから1匹選択し、疲労させる
    if (card.id === 'pitcherplant' && ability.description.includes('敵フィールドから1匹選択し、疲労させる')) {
      // Find a non-fatigued enemy card
      const opponent = this.getOpponent(player);
      const candidates = opponent.field.filter(c => !c.isFatigued);
      if (candidates.length > 0) {
        // Fatigue the first available
        candidates[0].isFatigued = true;
        return { success: true, message: `敵の${candidates[0].name}を疲労させました` };
      } else {
        return { success: false, message: '疲労させる対象がいません' };
      }
    }

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
    if (ability.description.includes('疲労を除去する')) {
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
    if (ability.description.includes('増加IP+')) {
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
    console.log('敵ターン開始時効果実行:', { 
      description: ability.description, 
      cardName: card.name 
    });

    // 相手のカード疲労効果
    if (ability.description.includes('相手のカード1匹疲労させる')) {
      const opponent = this.getOpponent(player);
      const activeEnemyCards = opponent.field.filter(c => !c.isFatigued);
      
      console.log('敵ターン開始時疲労効果:', {
        opponentFieldCount: opponent.field.length,
        activeEnemyCards: activeEnemyCards.length,
        cards: activeEnemyCards.map(c => c.name)
      });
      
      if (activeEnemyCards.length === 0) {
        return { success: false, message: '疲労させる対象がありません' };
      }
      
      // 対象選択が必要
      return { 
        success: false, 
        message: '相手のカードを選択してください', 
        needsTarget: true,
        validTargets: activeEnemyCards.map(card => ({
          fieldId: card.fieldId,
          name: card.name,
          id: card.id
        }))
      };
    }

    return { success: true, message: '敵ターン開始時効果を実行しました' };
  }

  // 対象指定敵ターン開始時効果
  executeEnemyTurnStartWithTarget(player, card, ability, target) {
    console.log('対象指定敵ターン開始時効果実行:', { 
      description: ability.description, 
      targetName: target.name,
      targetFatigued: target.isFatigued,
      cardName: card.name
    });

    // 相手のカード疲労効果
    if (ability.description.includes('相手のカード1匹疲労させる')) {
      const opponent = this.getOpponent(player);
      
      // 対象が相手のカードかチェック
      if (!opponent.field.includes(target)) {
        return { success: false, message: '相手のカードを選択してください' };
      }
      
      // 対象が既に疲労しているかチェック
      if (target.isFatigued) {
        return { success: false, message: `${target.name}は既に疲労しています` };
      }
      
      // 疲労させる
      target.isFatigued = true;
      console.log('敵ターン開始時効果で相手のカードを疲労させました:', target.name);
      
      return { success: true, message: `${target.name}を疲労させました` };
    }

    return { success: false, message: '対象指定処理に失敗しました' };
  }

  // 水棲効果
  executeAquatic(player, card, ability) {
    if (ability.description.includes('中立に') && ability.description.includes('生成')) {
      return this.generateToNeutral(ability);
    }

    return { success: true, message: '水棲効果を実行しました' };
  }

  // 勝利条件チェック
  checkVictoryCondition(player, ability, card, checkOnly = false) {
    console.log('🏆 勝利条件チェック開始:', { 
      playerName: player.name, 
      cardName: card.name, 
      cardId: card.id,
      abilityDescription: ability.description,
      playerPoints: player.points,
      abilityCost: ability.cost,
      currentTurn: this.game.turn || 'undefined',
      checkOnly: checkOnly
    });
    
    const opponent = this.getOpponent(player);

    // 全ての勝利条件で共通：カード枚数の基本条件チェック
    const cardCount = player.field.filter(fieldCard => fieldCard.id === card.id).length;
    console.log('📋 基本条件チェック（カード枚数）:', { 
      cardId: card.id, 
      requiredCount: ability.cost, 
      actualCount: cardCount 
    });
    
    if (cardCount < ability.cost) {
      console.log('❌ 基本条件不満足: カード枚数不足');
      return { success: false, message: `勝利条件を満たしていません（${card.name}が${ability.cost}体必要、現在${cardCount}体）` };
    }

    // 累計IPが40を超えてがいる場合の勝利条件
    if (ability.description.includes('累計IPが40を超えてがいる場合')) {
      console.log('🔍 IP超過条件チェック:', { playerPoints: player.points, required: 40 });
      if (player.points > 40) {
        console.log('🎉 勝利条件達成！IP超過で勝利');
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

    // フントークン所持数による勝利条件
    if (ability.description.includes('フントークンを5以上所持してがいる場合')) {
      const funTokenCount = player.funTokens || 0;
      console.log('🔍 フントークン所持数チェック:', { funTokenCount, required: 5 });
      if (funTokenCount >= 5) {
        console.log('🎉 勝利条件達成！フントークン5以上で勝利');
        if (!checkOnly) {
          this.game.endGame(player);
        }
        return { success: true, message: `${player.name}の勝利！フントークンを5個以上所持！`, victory: true };
      } else {
        console.log('❌ フントークン所持数不足');
        return { success: false, message: `勝利条件を満たしていません（現在フントークン: ${funTokenCount}/5必要）` };
      }
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

    // 侵略回数系（統一版）
    if (ability.description.includes('侵略した回数が') || ability.description.includes('1ラウンドで侵略した回数が')) {
      console.log('🔍 侵略回数系勝利条件チェック開始:', {
        description: ability.description,
        playerName: player.name,
        playerId: player.id
      });
      
      // パターン1: "6回以上の場合"
      const atLeastMatch = ability.description.match(/侵略した回数が(\d+)回以上の場合/);
      // パターン2: "6超過の場合"（後方互換のため残す）
      const exceedMatch = ability.description.match(/侵略した回数が(\d+)超過の場合/);
      // パターン3: "7を超えていた場合"（後方互換のため残す）
      const exceedMatch2 = ability.description.match(/侵略した回数が(\d+)を超えていた場合/);
      // パターン4: "6回侵略した場合"（同じターンに）
      const exactMatch = ability.description.match(/(\d+)回侵略した場合/);
      
      let requiredCount = 0;
      let isAtLeast = false;
      let isExceed = false;
      
      if (atLeastMatch) {
        requiredCount = parseInt(atLeastMatch[1]);
        isAtLeast = true;
      } else if (exceedMatch) {
        requiredCount = parseInt(exceedMatch[1]);
        isExceed = true;
      } else if (exceedMatch2) {
        requiredCount = parseInt(exceedMatch2[1]);
        isExceed = true;
      } else if (exactMatch) {
        requiredCount = parseInt(exactMatch[1]);
        isAtLeast = false;
        isExceed = false;
      }
      
      const currentInvasionCount = this.getInvasionCount(player.id);
      console.log('🔍 侵略回数条件詳細チェック:', { 
        requiredCount, 
        currentCount: currentInvasionCount, 
        isAtLeast,
        isExceed,
        description: ability.description,
        allInvasionCounts: this.invasionCount
      });
      
      // デバッグ: 条件の詳細チェック
      console.log('🔬 条件チェック詳細:', {
        'currentInvasionCount >= requiredCount': currentInvasionCount >= requiredCount,
        'currentInvasionCount > requiredCount': currentInvasionCount > requiredCount,
        'currentInvasionCount === requiredCount': currentInvasionCount === requiredCount,
        currentInvasionCount,
        requiredCount,
        isAtLeast,
        isExceed
      });
      
      let conditionMet = false;
      if (isAtLeast) {
        conditionMet = currentInvasionCount >= requiredCount;
        console.log(`📊 isAtLeast条件: ${currentInvasionCount} >= ${requiredCount} = ${conditionMet}`);
      } else if (isExceed) {
        conditionMet = currentInvasionCount > requiredCount;
        console.log(`📊 isExceed条件: ${currentInvasionCount} > ${requiredCount} = ${conditionMet}`);
      } else {
        conditionMet = currentInvasionCount >= requiredCount;
        console.log(`📊 デフォルト条件: ${currentInvasionCount} >= ${requiredCount} = ${conditionMet}`);
      }
      
      if (conditionMet) {
        console.log('🎉 侵略回数勝利条件達成！', {
          playerName: player.name,
          currentCount: currentInvasionCount,
          requiredCount: requiredCount,
          isExceed: isExceed,
          comparison: isExceed ? '超過' : '以上'
        });
        this.game.endGame(player);
        return { success: true, message: `${player.name}の勝利！侵略回数達成！`, victory: true };
      } else {
        const comparison = isAtLeast ? '以上' : (isExceed ? '超過' : '以上');
        console.log('❌ 侵略回数勝利条件不満足:', {
          playerName: player.name,
          currentCount: currentInvasionCount,
          requiredCount: requiredCount,
          comparison: comparison,
          isAtLeast: isAtLeast,
          isExceed: isExceed,
          message: `現在侵略回数: ${currentInvasionCount}/${requiredCount}${comparison}必要`
        });
        return { success: false, message: `勝利条件を満たしていません（現在侵略回数: ${currentInvasionCount}/${requiredCount}${comparison}必要）` };
      }
    }

    // 水棲系
    if (ability.description.includes('水棲持ちが8体')) {
      const aquaticCount = player.field.filter(card => 
        card.traits && card.traits.includes('水棲')
      ).length;
      return aquaticCount >= 8;
    }

    // 条件なしの勝利条件（ウサギ・オカピ）
    if (ability.description.includes('条件なし')) {
      console.log('🎉 勝利条件達成！条件なしで勝利');
      this.game.endGame(player);
      return { success: true, message: `${player.name}の勝利！`, victory: true };
    }

    console.log('❌ 勝利条件を満たしていません:', { description: ability.description });
    return { success: false, message: '勝利条件を満たしていません' };
  }

  // 共通効果処理関数（最適化版）
  processCommonEffects(player, card, ability) {
    const description = ability.description;
    
    // 同種を1枚疲労させる条件チェック（最優先）- 複合効果でない場合のみ
    if (description.includes('同種を1枚疲労させ') && 
        !description.includes('同種を疲労させ、同種を獲得する') && 
        !description.includes('同種を1枚疲労させ、同種を1枚生成する')) {
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
    
    // 複合効果：同種を1枚疲労させ、同種を1枚生成する（ゴリラ等）
    if (description.includes('同種を1枚疲労させ、同種を1枚生成する')) {
      console.log('複合効果開始：同種疲労+同種生成', { cardName: card.name });
      
      const sameTypeCards = player.field.filter(c => 
        c.id === card.id && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (sameTypeCards.length === 0) {
        return this.createErrorResponse(
          ERROR_CODES.CONDITION_NOT_MET,
          '疲労させる同種カードがありません',
          { cardName: card.name, requiredCondition: '疲労していない同種' }
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
      
      // 同種を疲労させる
      sameTypeCards[0].isFatigued = true;
      console.log('複合効果：同種カードを疲労させました:', sameTypeCards[0].name);
      
      // 同種を生成する
      const newCard = this.createCardCopy(card, true); // 疲労状態で生成
      if (newCard) {
        player.field.push(newCard);
        console.log('複合効果：同種を生成しました:', { cardName: card.name, isFatigued: true });
        return this.createSuccessResponse(
          `${sameTypeCards[0].name}を疲労させ、${card.name}を生成しました（疲労状態）`,
          { 
            fatigueTarget: sameTypeCards[0].name,
            generatedCard: card.name,
            generatedFatigued: true
          }
        );
      } else {
        return this.createErrorResponse(
          ERROR_CODES.RESOURCE_NOT_FOUND,
          'カードの生成に失敗しました'
        );
      }
    }
    
    // 汎用パターンマッチング（数字対応強化）
    const patterns = {
      selfRecover: /このカードを回復|自身の疲労除去する|自身の疲労を除去する/,
      ipGain: /[＋+](\d+)IP|IP[＋+](\d+)|(\d+)IP獲得/,
      ipIncreaseGain: /増加IP[＋+](\d+)|増加IP(\d+)/,
      ipConsume: /(\d+)IP消費|IPを?(\d+)消費|自分のIPを?(\d+)消費/,
      neutralRecover: /中立フィールドの同種を回復する|中立フィールドの同種を回復させる/,
      
      // 汎用的な生成パターン
      sameTypeGenerate: /^同種を(\d+)?枚?生成する$|^同種を生成する$/,
      specificGenerate: /(\w+)を(\d+)?枚?獲得する|(\w+)を生成する/,
      beeAcquire: /ハチを獲得する|ハチを生成する/,
      
      // 汎用的な疲労パターン  
      enemyFatigue: /(\d+)匹疲労させる|(\d+)体疲労させる|敵の(\w+)を疲労させる/,
      sameFatigue: /同種を(\d+)?枚?疲労させ/,
      
      // 汎用的な追放パターン
      exile: /(\d+)匹追放する|(\d+)体追放する|疲労済を追放する/,
      
      // 汎用的な条件生成パターン
      conditionalGenerate: /中立に(\w+)がいない場合、中立に(\w+)を生成する/,
      conditionalNeutralGenerate: /中立にいない場合、中立に(\w+)を生成する/,
      
      // 汎用的な勝利条件パターン
      invasionVictory: /(\d+)ラウンドで侵略した回数が(\d+)超過の場合|侵略した回数が(\d+)超過/,
      ipVictory: /累?計?IPが?(\d+)を?超え|IP(\d+)以上/,
      fieldCountVictory: /自フィールドに?カードが?(\d+)枚/,
      noConditionVictory: /条件なし/
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
      
      // 「同種を1枚疲労させ」が含まれてがいる場合は複合効果として処理
      if (description.includes('同種を1枚疲労させ')) {
        return this.createSuccessResponse(`同種を疲労させて${ipGain}IP獲得しました`, { 
          ipGain: ipGain,
          condition: '同種疲労'
        });
      } else {
        return this.createSuccessResponse(`${ipGain}IP獲得しました`, { ipGain: ipGain });
      }
    }

    // 増加IP獲得効果（サボテン等）
    const ipIncreaseMatch = description.match(patterns.ipIncreaseGain);
    if (ipIncreaseMatch) {
      const ipIncreaseGain = parseInt(ipIncreaseMatch[1] || ipIncreaseMatch[2]);
      if (typeof player.ipIncrease === 'undefined') {
        player.ipIncrease = 0;
      }
      player.ipIncrease += ipIncreaseGain;
      console.log('増加IP獲得効果:', { player: player.name, gain: ipIncreaseGain, total: player.ipIncrease });
      return this.createSuccessResponse(`増加IP+${ipIncreaseGain}を獲得しました`, { 
        ipIncreaseGain: ipIncreaseGain,
        totalIpIncrease: player.ipIncrease 
      });
    }

    // 汎用的な同種生成効果
    const sameGenerateMatch = description.match(patterns.sameTypeGenerate);
    if (sameGenerateMatch) {
      const count = parseInt(sameGenerateMatch[1]) || 1; // デフォルト1枚
      return this.processSameTypeGenerate(player, card, count);
    }

    // 汎用的な特定カード生成効果（ハチ等）
    const specificGenerateMatch = description.match(patterns.specificGenerate);
    if (specificGenerateMatch) {
      const cardName = specificGenerateMatch[1] || specificGenerateMatch[3];
      const count = parseInt(specificGenerateMatch[2]) || 1;
      return this.processSpecificCardGenerate(player, cardName, count);
    }

    // 汎用的な敵疲労効果
    const enemyFatigueMatch = description.match(patterns.enemyFatigue);
    if (enemyFatigueMatch) {
      const count = parseInt(enemyFatigueMatch[1] || enemyFatigueMatch[2]) || 1;
      const specificTarget = enemyFatigueMatch[3]; // 特定カード名（アリ等）
      return this.processEnemyFatigue(player, count, specificTarget);
    }

    // 汎用的な条件付き中立生成効果（アリ・アリクイ等）
    const conditionalMatch = description.match(patterns.conditionalGenerate);
    if (conditionalMatch) {
      console.log('アリクイ効果：条件付き生成パターンマッチ:', { 
        checkTarget: conditionalMatch[1], 
        generateTarget: conditionalMatch[2] 
      });
      const checkTarget = conditionalMatch[1]; // 確認対象
      const generateTarget = conditionalMatch[2]; // 生成対象
      return this.processConditionalNeutralGenerate(checkTarget, generateTarget);
    }

    // 汎用的な条件付き中立生成効果（オカピ等）
    const conditionalNeutralMatch = description.match(patterns.conditionalNeutralGenerate);
    if (conditionalNeutralMatch) {
      const generateTarget = conditionalNeutralMatch[1]; // 生成対象
      return this.processConditionalNeutralGenerate(card.name, generateTarget);
    }

    // 中立フィールドの同種を回復する
    if (patterns.neutralRecover.test(description)) {
      const result = this.processNeutralFieldRecover(card);
      
      // 「同種を1枚疲労させ」が含まれてがいる場合は複合効果として処理
      if (description.includes('同種を1枚疲労させ') && result.success) {
        result.message = `同種を疲労させて${result.message}`;
        result.data = { ...result.data, condition: '同種疲労' };
      }
      
      return result;
    }

    // ハチを獲得する
    if (patterns.beeAcquire.test(description)) {
      const result = this.processBeeAcquire(player);
      
      // 「同種を1枚疲労させ」が含まれてがいる場合は複合効果として処理
      if (description.includes('同種を1枚疲労させ') && result.success) {
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

  // 汎用同種生成処理（数量対応）
  processSameTypeGenerate(player, card, count = 1) {
    console.log('汎用同種生成:', { cardName: card.name, count: count });
    
    // フィールド容量チェック（最大20枚と仮定）
    if (player.field.length + count > 20) {
      return this.createErrorResponse(
        ERROR_CODES.FIELD_FULL,
        'フィールドが満杯です',
        { currentCount: player.field.length, requestedCount: count }
      );
    }
    
    const generatedCards = [];
    for (let i = 0; i < count; i++) {
      const newCard = this.createCardCopy(card, true); // 疲労状態で生成
      if (newCard) {
        player.field.push(newCard);
        generatedCards.push(newCard.name);
      }
    }
    
    if (generatedCards.length > 0) {
      console.log('同種生成完了:', { player: player.name, cards: generatedCards });
      const message = count === 1 
        ? `${card.name}を生成しました（疲労状態）`
        : `${card.name}を${count}枚生成しました（疲労状態）`;
      return this.createSuccessResponse(message, { 
        generatedCards: generatedCards,
        count: generatedCards.length,
        fatigued: true
      });
    }
    
    return this.createErrorResponse(
      ERROR_CODES.RESOURCE_NOT_FOUND,
      'カードの生成に失敗しました'
    );
  }

  // 汎用特定カード生成処理（ハチ・アリ等）
  processSpecificCardGenerate(player, cardName, count = 1) {
    console.log('汎用特定カード生成:', { cardName: cardName, count: count });
    
    // カード名の正規化
    const normalizedName = this.normalizeCardName(cardName);
    
    // フィールド容量チェック
    if (player.field.length + count > 20) {
      return this.createErrorResponse(
        ERROR_CODES.FIELD_FULL,
        'フィールドが満杯です',
        { currentCount: player.field.length, requestedCount: count }
      );
    }
    
    const cardPool = this.game.cardPool || [];
    const targetCard = cardPool.find(c => 
      this.normalizeCardName(c.name) === normalizedName || 
      c.id === cardName.toLowerCase()
    );
    
    if (!targetCard) {
      return this.createErrorResponse(
        ERROR_CODES.RESOURCE_NOT_FOUND,
        `${cardName}が見つかりません`,
        { requestedCard: cardName }
      );
    }
    
    const generatedCards = [];
    for (let i = 0; i < count; i++) {
      const newCard = this.createCardCopy(targetCard, true); // 疲労状態で生成
      if (newCard) {
        player.field.push(newCard);
        generatedCards.push(newCard.name);
      }
    }
    
    if (generatedCards.length > 0) {
      console.log('特定カード生成完了:', { player: player.name, cards: generatedCards });
      const message = count === 1 
        ? `${cardName}を獲得しました（疲労状態）`
        : `${cardName}を${count}枚獲得しました（疲労状態）`;
      return this.createSuccessResponse(message, { 
        generatedCards: generatedCards,
        count: generatedCards.length
      });
    }
    
    return this.createErrorResponse(
      ERROR_CODES.RESOURCE_NOT_FOUND,
      `${cardName}の生成に失敗しました`
    );
  }

  // 汎用敵疲労処理（数量・特定対象対応）
  processEnemyFatigue(player, count = 1, specificTarget = null) {
    console.log('汎用敵疲労処理:', { count: count, specificTarget: specificTarget });
    
    const opponent = this.getOpponent(player);
    let targets = opponent.field.filter(c => !c.isFatigued);
    
    // 特定対象がある場合のフィルタリング
    if (specificTarget) {
      const normalizedTarget = this.normalizeCardName(specificTarget);
      targets = targets.filter(c => 
        this.normalizeCardName(c.name) === normalizedTarget ||
        c.id === specificTarget.toLowerCase()
      );
    }
    
    if (targets.length === 0) {
      const targetMsg = specificTarget ? `疲労していない${specificTarget}` : '疲労させる対象';
      return this.createErrorResponse(
        ERROR_CODES.CONDITION_NOT_MET,
        `${targetMsg}がありません`,
        { specificTarget: specificTarget }
      );
    }
    
    const actualCount = Math.min(count, targets.length);
    const fatiguedCards = [];
    
    for (let i = 0; i < actualCount; i++) {
      const target = this.selectTargetCard(targets.slice(i), 'active');
      if (target) {
        target.isFatigued = true;
        fatiguedCards.push(target.name);
      }
    }
    
    if (fatiguedCards.length > 0) {
      console.log('敵疲労完了:', { fatiguedCards: fatiguedCards });
      const message = specificTarget
        ? `${specificTarget}${fatiguedCards.length}匹を疲労させました`
        : `${fatiguedCards.length}匹を疲労させました`;
      return this.createSuccessResponse(message, { 
        fatiguedCards: fatiguedCards,
        count: fatiguedCards.length
      });
    }
    
    return this.createErrorResponse(
      ERROR_CODES.CONDITION_NOT_MET,
      '疲労させることができませんでした'
    );
  }

  // カード名正規化（汎用）
  normalizeCardName(name) {
    return name.replace(/^M/, '').replace(/^m/, ''); // Mプレフィックス除去
  }

  // 条件付き中立生成処理（分離・共通化）
  processConditionalNeutralGenerate(checkTarget, generateTarget) {
    console.log('条件付き中立生成効果:', { checkTarget, generateTarget });
    
    // 中立フィールドを確認
    const neutralField = this.game.neutralField || [];
    
    // 確認対象のカードが中立にいるかチェック
    const hasTargetInNeutral = neutralField.some(nc => 
      nc.name === checkTarget || nc.name === `M${checkTarget}` || nc.id === checkTarget
    );
    
    if (hasTargetInNeutral) {
      console.log(`条件不満足：中立に${checkTarget}が既に存在します`);
      return this.createSuccessResponse(
        `中立に${checkTarget}が既に存在するため、生成されませんでした`,
        { condition: 'already_exists', checkTarget: checkTarget }
      );
    }
    
    // 生成対象カードを取得
    const cardPool = this.game.cardPool || [];
    const targetCard = cardPool.find(c => 
      c.name === generateTarget || 
      c.name === `M${generateTarget}` || 
      c.id === generateTarget ||
      (generateTarget === 'アリクイ' && c.name === 'Mアリクイ') ||
      (generateTarget === 'アリ' && c.name === 'Mアリ') ||
      (generateTarget === 'ライオン' && c.name === 'ライオン')
    );
    
    if (!targetCard) {
      return this.createErrorResponse(
        ERROR_CODES.RESOURCE_NOT_FOUND,
        `${generateTarget}カードが見つかりません`,
        { requestedCard: generateTarget }
      );
    }
    
    // 中立フィールドに生成
    const newCard = this.createCardCopy(targetCard, true); // 疲労状態で生成
    if (newCard) {
      if (!this.game.neutralField) this.game.neutralField = [];
      this.game.neutralField.push(newCard);
      console.log(`中立に${generateTarget}を生成:`, { card: newCard.name, isFatigued: true });
      return this.createSuccessResponse(
        `中立に${generateTarget}を生成しました（疲労状態）`,
        { 
          generatedCard: newCard.name,
          location: 'neutral',
          condition: `${checkTarget}が中立にいない`
        }
      );
    }
    
    return this.createErrorResponse(
      ERROR_CODES.RESOURCE_NOT_FOUND,
      `${generateTarget}の生成に失敗しました`
    );
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

  // ライオンの特殊効果処理
  executeLionSpecialEffect(player, card, ability) {
    console.log('ライオンの特殊効果実行:', ability.description);
    
    if (!this.game.exileField || this.game.exileField.length === 0) {
      return { success: false, message: '追放フィールドにカードがありません' };
    }
    
    const opponent = this.getOpponent(player);
    const exiledCards = [...this.game.exileField]; // コピーを作成
    
    // 簡略化：追放されたカードを全て敵フィールドに移動
    exiledCards.forEach(exiledCard => {
      // 追放フィールドから削除
      const exileIndex = this.game.exileField.indexOf(exiledCard);
      if (exileIndex !== -1) {
        this.game.exileField.splice(exileIndex, 1);
      }
      
      // 敵フィールドに追加（疲労状態で）
      exiledCard.isFatigued = false; // 一度回復してから
      opponent.field.push(exiledCard);
    });
    
    // 相手のカード全ての疲労を除去
    opponent.field.forEach(oppCard => {
      oppCard.isFatigued = false;
    });
    
    console.log('ライオンの特殊効果完了:', { 
      movedCards: exiledCards.length,
      opponentFieldSize: opponent.field.length
    });
    
    return { 
      success: true, 
      message: `追放されたカード${exiledCards.length}枚を敵フィールドに置き、相手のカード全ての疲労を除去しました` 
    };
  }

  // ライオンの特殊効果（複数選択対応）
  executeLionSpecialEffectWithTargets(player, card, ability, selectedTargets) {
    console.log('ライオンの特殊効果（複数選択）実行:', {
      ability: ability.description,
      selectedCount: selectedTargets ? selectedTargets.length : 0,
      selectedTargets: selectedTargets ? selectedTargets.map(t => t.name || t.id) : []
    });
    
    if (!selectedTargets || selectedTargets.length === 0) {
      return { success: false, message: '選択されたカードがありません' };
    }
    
    const opponent = this.getOpponent(player);
    const movedCards = [];
    
    // 選択されたカードを追放フィールドから敵フィールドに移動
    selectedTargets.forEach(target => {
      // 追放フィールドから該当カードを探す
      const exiledCard = this.game.exileField.find(card => 
        card.instanceId === target.id || 
        card.fieldId === target.id || 
        card.id === target.id ||
        card === target.card
      );
      
      if (exiledCard) {
        // 追放フィールドから削除
        const exileIndex = this.game.exileField.indexOf(exiledCard);
        if (exileIndex !== -1) {
          this.game.exileField.splice(exileIndex, 1);
        }
        
        // 敵フィールドに追加（回復状態で）
        exiledCard.isFatigued = false;
        opponent.field.push(exiledCard);
        movedCards.push(exiledCard);
        
        console.log('カードを敵フィールドに移動:', exiledCard.name);
      }
    });
    
    // 相手のカード全ての疲労を除去
    opponent.field.forEach(oppCard => {
      oppCard.isFatigued = false;
    });
    
    console.log('ライオンの特殊効果（複数選択）完了:', { 
      movedCards: movedCards.length,
      opponentFieldSize: opponent.field.length,
      exileFieldSize: this.game.exileField.length
    });
    
    return { 
      success: true, 
      message: `選択した${movedCards.length}枚のカードを敵フィールドに置き、相手のカード全ての疲労を除去しました` 
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
      if (ability.description.includes('IP+')) {
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

  // 汎用侵略効果処理
  processInvasionEffects(ability, player, opponent, card) {
    const description = ability.description;

    // 基本的な疲労効果パターン
    const fatigueMatch = description.match(/([0-9]+)(?:匹|体)疲労させる/);
    if (fatigueMatch) {
      const count = parseInt(fatigueMatch[1]);
      return this.processEnemyFatigue(count, opponent, 'active');
    }

    // ゴリラの複合効果：同種疲労+疲労済追放
    if (description.includes('同種を1枚疲労させ、疲労済を追放する')) {
      console.log('ゴリラの侵略効果：同種疲労+疲労済追放');
      
      const sameTypeCards = player.field.filter(c => 
        c.id === card.id && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (sameTypeCards.length === 0) {
        return { processed: true, success: false, message: '疲労させる同種カードがありません' };
      }
      
      sameTypeCards[0].isFatigued = true;
      console.log('同種カードを疲労させました:', sameTypeCards[0].name);
      
      const fatigueTargets = opponent.field.filter(c => c.isFatigued);
      if (fatigueTargets.length > 0) {
        const exileTarget = this.selectTargetCard(fatigueTargets, 'any');
        if (exileTarget) {
          this.exileTarget(exileTarget, '同種疲労後に');
          return { 
            processed: true, 
            success: true, 
            message: `${sameTypeCards[0].name}を疲労させ、${exileTarget.name}を追放しました` 
          };
        }
      }
      return { 
        processed: true, 
        success: true, 
        message: `${sameTypeCards[0].name}を疲労させました（追放対象の疲労済みカードなし）` 
      };
    }

    // アリクイの複合効果：同種疲労+任意の1体追放
    if (description.includes('同種を疲労させ、1体追放する')) {
      console.log('アリクイの侵略効果：同種疲労+追放');
      
      const sameTypeCards = player.field.filter(c => 
        c.id === card.id && !c.isFatigued && c.fieldId !== card.fieldId
      );
      
      if (sameTypeCards.length === 0) {
        return { processed: true, success: false, message: '疲労させる同種カードがありません' };
      }
      
      // 追放対象候補をチェック
      const exileCandidates = opponent.field.filter(c => true); // 任意のカード
      if (exileCandidates.length > 0) {
        return { processed: true, success: false, message: '対象選択が必要です', needsTarget: true };
      } else {
        return { processed: true, success: false, message: '追放可能な対象がありません' };
      }
    }

    // 増加IP消費系の追放効果
    const ipExileMatch = description.match(/増加IP([0-9]+)消費.*?追放/);
    if (ipExileMatch) {
      const ipCost = parseInt(ipExileMatch[1]);
      console.log('侵略効果内の増加IP消費チェック:', { required: ipCost, current: player.ipIncrease });
      
      if (player.ipIncrease >= ipCost) {
        const exileCandidates = opponent.field.filter(c => !c.isFatigued);
        if (exileCandidates.length > 0) {
          return { processed: true, success: false, message: '対象選択が必要です', needsTarget: true };
        } else {
          return { processed: true, success: false, message: '追放可能な対象がありません' };
        }
      } else {
        return { processed: true, success: false, message: `増加IP${ipCost}が必要です（現在:${player.ipIncrease}）` };
      }
    }

    return { processed: false };
  }

  // 永続効果処理（ラウンド制限システム）
  processPersistentEffects(gameState, eventType, cardData) {
    if (!gameState.persistentEffects) {
      gameState.persistentEffects = {};
    }
    
    // ブナシメジの永続効果：反応持ちが追放された場合の処理
    if (eventType === 'card_exiled' && cardData) {
      const exiledCard = cardData;
      
      // 追放されたカードが反応持ちかどうかチェック
      const hasReactionAbility = exiledCard.abilities && 
        exiledCard.abilities.some(a => a.type === '反応');
      
      if (hasReactionAbility) {
        const playerField = gameState.players[gameState.currentPlayer].field;
        const mushroomCards = playerField.filter(c => c.id === 'mushroom');
        
        if (mushroomCards.length > 0) {
          // 1ラウンドに1度のみチェック
          const roundKey = `mushroom_exile_${gameState.currentRound}_${gameState.currentPlayer}`;
          
          if (!gameState.persistentEffects[roundKey]) {
            // ブナシメジを1体追放
            const mushroomToExile = mushroomCards[0];
            const mushroomIndex = playerField.findIndex(c => c.fieldId === mushroomToExile.fieldId);
            
            if (mushroomIndex !== -1) {
              playerField.splice(mushroomIndex, 1);
              
              // 追放フィールドに移動
              if (!gameState.exileField) {
                gameState.exileField = [];
              }
              gameState.exileField.push(mushroomToExile);
              
              gameState.persistentEffects[roundKey] = true;
              
              this.gamelog.log(`${this.getCurrentPlayerName()}'s mushroom exiled due to reaction card exile`);
              return { success: true, message: `反応持ちカードの追放により、ブナシメジを1体追放しました` };
            }
          }
        }
      }
    }
    
    return { processed: false };
  }

  // Mushroom specific effects for persistent card area effects
  handleMushroomEffects(gameState, cardId, effectType) {
    switch (effectType) {
      case 'mushroom_1':
        // 獲得時、カード置き場に残る。全てのカードを安く獲得できる。
        this.gamelog.log(`${this.getCurrentPlayerName()} places mushroom in card area for cost reduction effect`);
        
        // Mark mushroom as persistent in card area
        if (!gameState.persistentCardEffects) {
          gameState.persistentCardEffects = {};
        }
        if (!gameState.persistentCardEffects[gameState.currentPlayer]) {
          gameState.persistentCardEffects[gameState.currentPlayer] = [];
        }
        
        gameState.persistentCardEffects[gameState.currentPlayer].push({
          cardId: 'mushroom',
          effect: 'cost_reduction',
          description: '全てのカードを安く獲得できる'
        });
        
        return true;
        
      case 'mushroom_2':
        // 追放時、相手の強化数を半分にする。
        this.gamelog.log(`${this.getCurrentPlayerName()} exiles mushroom and halves opponent's enhancement count`);
        
        const opponent = gameState.currentPlayer === 'player1' ? 'player2' : 'player1';
        const currentEnhancements = gameState.playerStats[opponent].enhancementCount || 0;
        const newEnhancementCount = Math.floor(currentEnhancements / 2);
        
        gameState.playerStats[opponent].enhancementCount = newEnhancementCount;
        
        this.gamelog.log(`${opponent}'s enhancement count reduced from ${currentEnhancements} to ${newEnhancementCount}`);
        return true;
        
      default:
        return false;
    }
  }
}

module.exports = CardEffects;
