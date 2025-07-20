#!/bin/bash

# Renderデプロイ用のビルドスクリプト
echo "Starting ICG deployment process..."

# クライアントのビルド
echo "Building client..."
cd client
npm install
npm run build
cd ..

# サーバーの依存関係インストール
echo "Installing server dependencies..."
cd server
npm install
cd ..

# 管理画面の依存関係インストール
echo "Installing admin dependencies..."
cd admin
npm install
cd ..

# ビルドファイルの確認
if [ -f "client/dist/index.html" ]; then
    echo "✅ Client build successful!"
else
    echo "❌ Client build failed - index.html not found"
    exit 1
fi

echo "🎉 Build process completed!"
