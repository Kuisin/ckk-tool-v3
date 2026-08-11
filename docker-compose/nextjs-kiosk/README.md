# nextjs-kiosk — 共有キオスク端末アプリ

工場フロアの共有タブレット用アプリ。従業員は **QR カード + PIN** でログインする
（AD パスワード入力なし）。管理（カード発行・端末有効化・フロアマップ）は
**nextjs-web の設定アプリ**（SY08 QRカード管理 / SY09 端末管理）で行う。

## 認証の仕組み

独立した 2 つの信頼（Cookie は生トークン、DB は SHA-256 のみ）:

| Cookie | 意味 | 期限 |
|---|---|---|
| `kiosk_device` | この端末は信頼済みキオスク（`kiosk_devices` ACTIVE 行） | 30日 |
| `kiosk_session` | この人がサインイン中（`kiosk_sessions` → `app.users`） | 8h ハード + 5分アイドル |

- **端末登録（profile-first）**: 管理者が SY09 で**端末プロファイル**を作成
  （リンクコード 12桁・24h が管理画面に表示）→ タブレットの `/setup` がコードを
  入力 or 管理画面の QR をスキャンして**リンク**（LINKED）→ 管理者は
  **リンク済みプロファイルのみ有効化**できる → 端末のポーリングが 30日
  トークンを受け取る。
- **ログイン**: `/login` で QR スキャン → `POST /api/qr/access`。
  PIN は必須（初回スキャンで設定）。**3日以内に使用があればスキャンのみ**、
  空くと PIN 再入力。5回失敗で 15分ロック。
- **アイドル**: 操作イベント → 30s スロットルで `POST /api/kiosk/activity`。
  残り 3分でカウントダウン表示 → 0 で自動ログアウト。

## WebSocket（端末プレゼンス）

`/api/kiosk/ws`（カスタムサーバー `src/server.ts` が upgrade を処理）:

- **device** クライアント: 端末（`kiosk_device` Cookie で認証）。接続中 =
  オンライン。未接続でも直近 5分の活動があればオンライン扱い。
- **monitor** クライアント: nextjs-web 管理 UI。`KIOSK_WS_SECRET` の HMAC
  短命トークン（`?token=`）で認証。接続時 snapshot、以後 device_status を受信。

Next のルートからは `src/lib/ws-bridge.ts`（globalThis 経由）で通知する。

## 開発

```bash
pnpm install --frozen-lockfile
pnpm db:sync-schema && pnpm db:generate   # shared-db スキーマ同期
pnpm dev                                   # UI 開発（WS なしでも動く）
pnpm build:server && NODE_ENV=development node dist/src/server.js  # WS 込み
pnpm test / pnpm lint
```

カメラ（getUserMedia）は `http://localhost` では TLS 不要。実端末での確認は
デプロイ後に `https://ckk-kiosk-dev.kai-lab.net`（LAN TLS 済み）で行う。

## E2E スモーク（手動チェックリスト）

1. 管理者: SY09 で端末プロファイル作成（名前・工場）→ リンクコード表示
2. タブレット: `/setup` でコード入力（または管理画面の QR をスキャン）→
   「有効化を待っています」/ 管理者: LINKED になったプロファイルを有効化 →
   タブレットが `/login` へ（PENDING のままでは有効化ボタンが出ないことを確認）
3. 管理者: SY08 でカード発行 → ユーザー割当 → 印刷
4. 初回スキャン → PIN 設定 → ランチャー表示
5. ログアウト → 再スキャン → PIN なしで即ログイン
6. `UPDATE app.kiosk_cards SET last_used_at = now() - interval '4 days' ...` → スキャン → PIN 要求
7. PIN 5回失敗 → 15分ロック → SY08 でロック解除
8. 5分放置 → 自動ログアウト
9. SY09 で端末取り消し → タブレットが `/device-error`
10. SY09 の端末一覧・フロアマップでオンライン表示が数秒で追従（WS）

## デプロイ

Coolify（`nextjs-kiosk-dev` :3006 / `nextjs-kiosk-main` :3007、
`docker-compose/coolify/README.md`）。公開: `ckk-kiosk-dev.kai-lab.net` /
`ckk-kiosk.kai-lab.net`（cloudflared + nginx-proxy、WS upgrade 対応）。
