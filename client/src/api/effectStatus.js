// カード効果ステータス API クライアント
class EffectStatusAPI {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  async getEffectStatus(cardId, abilityIndex) {
    try {
      const response = await fetch(`${this.baseUrl}/api/effect-status/${cardId}/${abilityIndex}`);
      return await response.json();
    } catch (error) {
      console.error('効果ステータス取得エラー:', error);
      return { status: 'unknown', error: error.message };
    }
  }

  async setEffectStatus(cardId, abilityIndex, status, reportedBy = 'user') {
    try {
      const response = await fetch(`${this.baseUrl}/api/effect-status/${cardId}/${abilityIndex}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status, reportedBy })
      });
      return await response.json();
    } catch (error) {
      console.error('効果ステータス更新エラー:', error);
      return { success: false, error: error.message };
    }
  }

  async getCardEffectStatuses(cardId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/effect-status/card/${cardId}`);
      return await response.json();
    } catch (error) {
      console.error('カード効果ステータス取得エラー:', error);
      return {};
    }
  }

  async getStatistics() {
    try {
      const response = await fetch(`${this.baseUrl}/api/effect-status/statistics`);
      return await response.json();
    } catch (error) {
      console.error('統計情報取得エラー:', error);
      return { total: 0, working: 0, broken: 0, unknown: 0 };
    }
  }

  async getAllStatuses() {
    try {
      const response = await fetch(`${this.baseUrl}/api/effect-status/all`);
      return await response.json();
    } catch (error) {
      console.error('全ステータス取得エラー:', error);
      return {};
    }
  }
}

export default EffectStatusAPI;
