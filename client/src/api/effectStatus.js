// カード効果ステータス API クライアント
class EffectStatusAPI {
  constructor(baseUrl) {
    // 環境に応じてベースURLを設定
    if (baseUrl) {
      this.baseUrl = baseUrl;
    } else if (typeof window !== 'undefined') {
      // ブラウザ環境では現在のホストを使用
      const protocol = window.location.protocol;
      const hostname = window.location.hostname;
      
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        // ローカル開発環境
        this.baseUrl = 'http://localhost:3005';
      } else {
        // 本番環境では同じホストの3005ポートを使用（または環境変数）
        this.baseUrl = `${protocol}//${hostname}:3005`;
      }
    } else {
      // フォールバック
      this.baseUrl = 'http://localhost:3005';
    }
  }

  async getEffectStatus(cardId, abilityIndex) {
    // 本番環境では効果ステータス機能を無効化
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return { status: 'unknown' };
      }
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/api/effect-status/${cardId}/${abilityIndex}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.warn('効果ステータス取得をスキップ:', error.message);
      return { status: 'unknown', error: error.message };
    }
  }

  async setEffectStatus(cardId, abilityIndex, status, reportedBy = 'user') {
    // 本番環境では効果ステータス機能を無効化
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return { success: true, message: '本番環境では効果ステータス更新は無効化されています' };
      }
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/api/effect-status/${cardId}/${abilityIndex}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status, reportedBy })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.warn('効果ステータス更新をスキップ:', error.message);
      return { success: false, error: error.message };
    }
  }

  async getCardEffectStatuses(cardId) {
    // 本番環境では効果ステータス機能を無効化
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return {};
      }
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/api/effect-status/card/${cardId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.warn('カード効果ステータス取得をスキップ:', error.message);
      return {};
    }
  }

  async getStatistics() {
    // 本番環境では効果ステータス機能を無効化
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return { total: 0, working: 0, broken: 0, unknown: 0 };
      }
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/api/effect-status/statistics`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.warn('統計情報取得をスキップ:', error.message);
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
