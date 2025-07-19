# デバッグ機能ドキュメント

## 概要
ICGカードゲームのデバッグ機能は、ゲームの状態を保存・復元できる包括的なシステムです。テスト、バグ修正、特定のゲーム状況の再現に役立ちます。

## 機能一覧

### 1. ゲーム状態の表示
- 現在のターン、フェーズ、アクティブプレイヤー情報
- JSON形式での詳細な状態表示

### 2. クイック状態設定
- **序盤状態**: ターン2、両プレイヤーが2枚ずつカードを所持
- **中盤状態**: ターン5、多数のカードが配置され、一部が疲労状態
- **終盤状態**: ターン8、大量のIPと多くのカードが場に

### 3. 状態の保存・復元
- 任意の名前でゲーム状態を保存
- 保存した状態の一覧表示と管理
- ワンクリックでの状態復元
- 状態の削除機能

### 4. ファイルベースの永続化
- `server/debug-saves/` ディレクトリにJSON形式で保存
- タイムスタンプ付きのファイル名
- サーバー再起動後も保存状態を維持

## 使い方

### 1. デバッグパネルの表示
1. ゲーム中に画面右上の🔧アイコンをクリック
2. デバッグパネルが展開される

### 2. クイック状態設定
1. デバッグパネルの「クイック状態設定」セクション
2. 「序盤」「中盤」「終盤」ボタンをクリック
3. 即座にゲーム状態が変更される

### 3. 状態の保存
1. 「状態管理」セクションで状態名を入力
2. 「保存」ボタンをクリック
3. 状態がファイルに保存される

### 4. 状態の復元
1. 「保存済み状態を表示」ボタンをクリック
2. 保存済み状態一覧から復元したい状態を選択
3. 「復元」ボタンをクリック

### 5. 状態の削除
1. 保存済み状態一覧で削除したい状態を特定
2. 「削除」ボタンをクリック
3. 確認ダイアログで「OK」を選択

## API エンドポイント

### ゲーム状態管理
- `GET /api/debug/games` - 実行中ゲーム一覧
- `GET /api/debug/game/:gameId/state` - 特定ゲームの状態取得
- `POST /api/debug/game/:gameId/restore` - ゲーム状態復元
- `POST /api/debug/game/:gameId/quick-state` - クイック状態設定

### 状態ファイル管理
- `POST /api/debug/save-state` - 状態をファイルに保存
- `GET /api/debug/saved-states` - 保存済み状態一覧
- `GET /api/debug/saved-states/:fileName` - 特定の保存状態取得
- `DELETE /api/debug/saved-states/:fileName` - 保存状態削除

## Socket.io イベント

### クライアント → サーバー
- `debug-save-state` - 現在の状態を保存
- `debug-restore-state` - 指定された状態を復元
- `debug-quick-state` - クイック状態を設定

### サーバー → クライアント
- `debug-state-saved` - 状態保存完了通知
- `debug-state-restored` - 状態復元完了通知
- `debug-quick-state-set` - クイック状態設定完了通知

## 保存される状態データ

```json
{
  "id": "ゲームID",
  "players": [
    {
      "id": "プレイヤーID",
      "name": "プレイヤー名",
      "points": "所持IP",
      "ipIncrease": "IP増加量",
      "field": "フィールドのカード配列",
      "isReady": "準備状態",
      "hasActed": "行動済みフラグ"
    }
  ],
  "neutralField": "中立フィールドのカード配列",
  "exileField": "追放フィールドのカード配列",
  "turn": "現在のターン",
  "phase": "現在のフェーズ",
  "currentPlayerIndex": "現在のプレイヤーインデックス",
  "auctionSelections": "オークション選択データ",
  "timestamp": "保存日時",
  "description": "状態の説明"
}
```

## 注意事項

### セキュリティ
- デバッグ機能は開発環境でのみ使用を想定
- 本番環境では無効化することを推奨

### パフォーマンス
- 状態保存はファイルI/Oを伴うため、頻繁な実行は避ける
- 保存ファイルの定期的な清掃を推奨

### 制限事項
- Socket接続情報は復元されない（新しい接続で継続）
- リアルタイム進行中の処理は中断される可能性

## トラブルシューティング

### 状態復元が失敗する場合
1. 保存ファイルの整合性を確認
2. GameEngineのrestoreGameStateメソッドでエラーログを確認
3. プレイヤー数やカードデータの整合性をチェック

### デバッグパネルが表示されない場合
1. App.vueでDebugPanelコンポーネントが正しくインポートされているか確認
2. GameBoard.vueでpropsが正しく渡されているか確認
3. ブラウザのコンソールでJavaScriptエラーをチェック

### API呼び出しが失敗する場合
1. サーバーが正常に起動しているか確認
2. CORSの設定を確認
3. debug-savesディレクトリの書き込み権限を確認

## 開発者向け情報

### 拡張方法
1. GameEngine.jsにsaveGameState/restoreGameStateメソッドを拡張
2. DebugPanel.vueに新しいUI要素を追加
3. index.jsに新しいAPIエンドポイントを追加

### カスタムクイック状態
setQuickDebugStateメソッドに新しい状態タイプを追加:

```javascript
case 'custom-state':
  // カスタム状態の設定
  this.turn = customTurn;
  this.phase = customPhase;
  // その他の設定...
  break;
```

### 保存形式の変更
保存データの形式を変更する場合は、saveGameStateとrestoreGameStateの両方を更新し、下位互換性を考慮する。
