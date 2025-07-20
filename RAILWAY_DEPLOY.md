# 🚀 Railway デプロイガイド

## 前準備

### 1. Railwayアカウント作成
https://railway.app/ でアカウントを作成

### 2. GitHubリポジトリ準備
```bash
# プロジェクトをGitリポジトリにする
git init
git add .
git commit -m "Initial commit"

# GitHubにプッシュ（リポジトリを作成済みの場合）
git remote add origin https://github.com/yourusername/icg-game.git
git push -u origin main
```

## デプロイ手順

### 方法A: GitHub連携（推奨）

1. **Railwayにログイン**
   - GitHub アカウントでログイン

2. **新しいプロジェクト作成**
   - "Deploy from GitHub repo" を選択
   - ICGリポジトリを選択

3. **環境変数設定**
   ```
   NODE_ENV=production
   PORT=3001
   ```

4. **デプロイ完了**
   - 自動的にビルド・デプロイが開始
   - 数分でデプロイ完了

### 方法B: Railway CLI

1. **CLI インストール**
   ```bash
   npm install -g @railway/cli
   ```

2. **ログイン**
   ```bash
   railway login
   ```

3. **プロジェクト初期化**
   ```bash
   railway init
   ```

4. **デプロイ**
   ```bash
   railway up
   ```

## 設定確認

### 必要なファイル ✅
- [x] `railway.json` - Railway設定
- [x] `package.json` - ルートパッケージ設定
- [x] `server/package.json` - サーバー設定

### ビルド確認
```bash
# ローカルでビルドテスト
npm run build
cd server && npm start
```

## デプロイ後の確認

1. **サーバー起動確認**
   - Railway ダッシュボードでログを確認
   - "サーバー起動: http://localhost:3001" が表示されるか

2. **静的ファイル配信確認**
   - アプリのURLにアクセス
   - Vue.jsアプリが正常に表示されるか

3. **WebSocket接続確認**
   - ゲーム開始を試す
   - リアルタイム通信が動作するか

## トラブルシューティング

### よくある問題

**1. ビルドエラー**
```bash
# 依存関係の問題
npm run build  # ローカルでテスト
```

**2. サーバー起動エラー**
```bash
# ポート設定確認
echo $PORT  # Railway環境変数
```

**3. データベースエラー**
```bash
# SQLiteファイルパス確認
ls -la server/database/
```

### 設定値

**環境変数:**
- `NODE_ENV`: production
- `PORT`: 自動設定（Railwayが管理）

**ドメイン:**
- Railway が自動生成: `your-app-name.railway.app`
- カスタムドメイン設定可能

## 更新・再デプロイ

### GitHubプッシュで自動デプロイ
```bash
git add .
git commit -m "Update game features"
git push origin main
# → 自動的に再デプロイ
```

### 手動デプロイ
```bash
railway up
```

## 監視・ログ

### Railway ダッシュボード
1. プロジェクト選択
2. "View Logs" でリアルタイムログ確認
3. メトリクス確認（CPU、メモリ使用量）

### 重要な確認ポイント
- サーバー起動メッセージ
- WebSocket接続ログ
- エラーログ

## コスト

**無料プラン:**
- 月500時間まで無料
- 自動スリープ機能あり
- 十分な個人・テスト用途

**Pro プラン ($5/月):**
- 無制限使用時間
- カスタムドメイン
- より高い性能

## 次のステップ

1. **カスタムドメイン設定**
2. **HTTPS設定**（Railway標準対応）
3. **環境変数管理**
4. **バックアップ戦略**
5. **監視・アラート設定**

---

🎮 **デプロイ完了後、ゲームをお楽しみください！**
