# ICG (Interactive Card Game) デプロイガイド

## 概要
ICGは Node.js + Socket.IO のリアルタイムカードゲームです。
- **フロントエンド**: Vue.js + Vite
- **バックエンド**: Node.js + Socket.IO + SQLite

## 🚀 デプロイ手順

### 1. 前準備
```bash
# プロジェクトをクローンまたはコピー
git clone <your-repo-url>
cd ICG

# 依存関係をインストール
cd client
npm install
cd ../server
npm install
cd ../admin
npm install
```

### 2. 本番環境向けビルド

#### クライアントのビルド
```bash
cd client
npm run build
```
→ `client/dist/` フォルダに本番用ファイルが生成されます

#### サーバーの準備
```bash
cd server
# 本番用のポート設定を確認
# index.js の PORT 設定を確認
```

### 3. デプロイ方法

#### 方法A: VPS・クラウドサーバー (推奨)

**必要なソフトウェア:**
- Node.js 16以上
- PM2 (プロセス管理)
- Nginx (リバースプロキシ)

**手順:**
```bash
# PM2をインストール
npm install -g pm2

# アプリケーションをサーバーにアップロード
scp -r ICG/ user@your-server:/path/to/app/

# サーバーにSSH接続
ssh user@your-server

# アプリケーションディレクトリに移動
cd /path/to/app/ICG

# PM2でサーバーを起動
pm2 start server/index.js --name "icg-server"

# PM2でadminを起動
pm2 start admin/server.js --name "icg-admin"

# 起動状態を確認
pm2 status

# 自動起動を設定
pm2 startup
pm2 save
```

**Nginx設定例 (`/etc/nginx/sites-available/icg`):**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # クライアント (静的ファイル)
    location / {
        root /path/to/app/ICG/client/dist;
        try_files $uri $uri/ /index.html;
    }

    # ゲームサーバー API
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 管理画面
    location /admin/ {
        proxy_pass http://localhost:3002/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 方法B: Heroku

**準備:**
1. Herokuアカウント作成
2. Heroku CLI インストール

**手順:**
```bash
# Herokuプロジェクト作成
heroku create your-app-name

# ビルドパックを設定
heroku buildpacks:add heroku/nodejs

# 環境変数を設定
heroku config:set NODE_ENV=production
heroku config:set PORT=3001

# デプロイ
git add .
git commit -m "Deploy to Heroku"
git push heroku main
```

**Heroku用 package.json (ルートディレクトリに作成):**
```json
{
  "name": "icg-game",
  "version": "1.0.0",
  "scripts": {
    "build": "cd client && npm install && npm run build",
    "start": "cd server && npm start",
    "postinstall": "npm run build && cd server && npm install && cd ../admin && npm install"
  },
  "engines": {
    "node": "18.x"
  }
}
```

#### 方法C: Railway

**手順:**
```bash
# Railway CLI インストール
npm install -g @railway/cli

# プロジェクト作成・デプロイ
railway login
railway init
railway up
```

### 4. 本番環境設定

#### 環境変数設定
```bash
# .env ファイルを作成 (server/.env)
NODE_ENV=production
PORT=3001
ADMIN_PORT=3002
```

#### セキュリティ設定
- CORS設定を本番ドメインに限定
- 管理画面にアクセス制限を追加
- HTTPS対応 (Let's Encrypt推奨)

### 5. 監視・メンテナンス

#### ログ確認
```bash
# PM2ログ
pm2 logs icg-server
pm2 logs icg-admin

# システムログ
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

#### バックアップ
```bash
# データベースバックアップ
cp server/database/icg.db backups/icg-$(date +%Y%m%d).db

# 定期バックアップ設定 (crontab)
0 2 * * * cp /path/to/app/ICG/server/database/icg.db /path/to/backups/icg-$(date +\%Y\%m\%d).db
```

## 🔧 トラブルシューティング

### よくある問題

1. **Socket.IO接続エラー**
   - CORSの設定を確認
   - プロキシ設定でWebSocket対応を確認

2. **データベースエラー**
   - ファイルの権限を確認
   - SQLiteファイルのパスを確認

3. **ビルドエラー**
   - Node.jsバージョンを確認
   - 依存関係の再インストール: `rm -rf node_modules && npm install`

### パフォーマンス最適化

1. **Gzip圧縮を有効化**
2. **CDNを使用してアセット配信**
3. **PM2クラスターモード使用**

```bash
# クラスターモードで起動
pm2 start server/index.js --name "icg-server" -i max
```

## 📝 推奨デプロイ環境

- **小規模**: Railway, Heroku
- **中規模**: VPS (DigitalOcean, Vultr)
- **大規模**: AWS, GCP, Azure

## 📞 サポート

デプロイで問題が発生した場合は、以下を確認してください：
1. Node.jsバージョン (18以上推奨)
2. ポート設定
3. ファイアウォール設定
4. ログファイル
