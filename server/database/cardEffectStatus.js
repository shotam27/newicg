const fs = require('fs');
const path = require('path');

class CardEffectStatusDB {
  constructor() {
    this.dbPath = path.join(__dirname, 'cardEffectStatus.json');
    this.data = this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const rawData = fs.readFileSync(this.dbPath, 'utf8');
        return JSON.parse(rawData);
      }
    } catch (error) {
      console.error('カード効果ステータスDB読み込みエラー:', error);
    }
    
    // デフォルトデータ構造
    return {
      effectStatuses: {},
      lastUpdated: new Date().toISOString(),
      version: '1.0'
    };
  }

  saveData() {
    try {
      this.data.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('カード効果ステータスDB保存エラー:', error);
      return false;
    }
  }

  // 効果のキーを生成（カードID + アビリティインデックス）
  generateEffectKey(cardId, abilityIndex) {
    return `${cardId}_${abilityIndex}`;
  }

  // 効果ステータスを取得
  getEffectStatus(cardId, abilityIndex) {
    const key = this.generateEffectKey(cardId, abilityIndex);
    return this.data.effectStatuses[key] || {
      status: 'unknown', // 'working', 'broken', 'unknown'
      lastTested: null,
      testCount: 0,
      notes: '',
      reportedBy: []
    };
  }

  // 効果ステータスを設定
  setEffectStatus(cardId, abilityIndex, status, reportedBy = 'system') {
    const key = this.generateEffectKey(cardId, abilityIndex);
    
    if (!this.data.effectStatuses[key]) {
      this.data.effectStatuses[key] = {
        cardId,
        abilityIndex,
        status: 'unknown',
        lastTested: null,
        testCount: 0,
        notes: '',
        reportedBy: []
      };
    }

    const effectData = this.data.effectStatuses[key];
    effectData.status = status;
    effectData.lastTested = new Date().toISOString();
    effectData.testCount++;
    
    // 報告者を記録（重複避け）
    if (!effectData.reportedBy.includes(reportedBy)) {
      effectData.reportedBy.push(reportedBy);
    }

    return this.saveData();
  }

  // 全効果ステータスを取得
  getAllEffectStatuses() {
    return this.data.effectStatuses;
  }

  // カード別効果ステータスを取得
  getCardEffectStatuses(cardId) {
    const cardStatuses = {};
    Object.keys(this.data.effectStatuses).forEach(key => {
      const effectData = this.data.effectStatuses[key];
      if (effectData.cardId === cardId) {
        cardStatuses[effectData.abilityIndex] = effectData;
      }
    });
    return cardStatuses;
  }

  // 統計情報を取得
  getStatistics() {
    const statuses = Object.values(this.data.effectStatuses);
    return {
      total: statuses.length,
      working: statuses.filter(s => s.status === 'working').length,
      broken: statuses.filter(s => s.status === 'broken').length,
      unknown: statuses.filter(s => s.status === 'unknown').length,
      lastUpdated: this.data.lastUpdated
    };
  }

  // 効果にメモを追加
  addNote(cardId, abilityIndex, note, author = 'system') {
    const key = this.generateEffectKey(cardId, abilityIndex);
    const effectData = this.data.effectStatuses[key];
    
    if (effectData) {
      if (!effectData.notes) effectData.notes = '';
      const timestamp = new Date().toISOString();
      effectData.notes += `\n[${timestamp}] ${author}: ${note}`;
      return this.saveData();
    }
    return false;
  }
}

module.exports = CardEffectStatusDB;
