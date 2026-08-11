# android-kiosk — キオスク端末ラッパー（Android）

工場フロアの Android タブレット用ラッパーアプリ。`nextjs-kiosk` の Web アプリを
全画面 WebView で表示し、**端末フィンガープリント（ハードウェア鍵）で
「認可された端末からのみアクセス可能」を担保**する。

## 仕組み

1. 初回起動時に **Android Keystore** へ P-256 鍵ペアを生成
   （ハードウェア保護・秘密鍵は端末外に出せない）
2. WebView に `window.KioskDevice` ブリッジを注入
   （`getPublicKey()` = SPKI base64 / `sign(data)` = SHA256withECDSA 署名）
3. Web アプリのログイン画面がチャレンジ（nonce）をサーバーから取得し、
   ブリッジで署名して `POST /api/kiosk/attest` — 初回で公開鍵が端末行に
   **TOFU 束縛**され（SY09 にフィンガープリント表示）、以降は同じ鍵の署名が
   ないとアテスト Cookie（12h）が発行されない
4. サーバー側で `KIOSK_ATTESTATION=required` のとき、ログイン関連 API と
   WebSocket はアテスト Cookie 必須 — **通常ブラウザや未認可端末は
   「専用端末アプリからのみ利用できます」でブロック**される

鍵を失った端末（初期化・交換）は SY09 の **鍵リセット** で解除 → 次回接続時に
新しい鍵が再束縛される。

## ビルド

Android Studio（Ladybug 以降）でこのディレクトリを開く。フレーバー:

| Variant | 接続先 | applicationId |
|---|---|---|
| `devDebug` / `devRelease` | https://ckk-kiosk-dev.kai-lab.net | `jp.co.ckk.kiosk.dev` |
| `prodRelease` | https://ckk-kiosk.kai-lab.net | `jp.co.ckk.kiosk` |

CLI: `./gradlew assembleDevDebug`（初回は `gradle wrapper` で wrapper を生成、
または Android Studio が自動生成）。release 署名は通常のキーストア運用で。

## タブレット設定メモ

- カメラ権限は初回 QR スキャン時にダイアログ許可（以後は自動）
- 画面は常時 ON・システムバー非表示。ホーム/タスクバー経由の離脱まで防ぐ
  場合は Android の**アプリ固定（screen pinning）**や MDM の kiosk mode を併用
- dev 版と prod 版は併存インストール可能（id suffix `.dev`）

## サーバー側の有効化

Coolify の `nextjs-kiosk-dev` / `nextjs-kiosk-main` に環境変数
`KIOSK_ATTESTATION=required` を設定して再デプロイ（未設定ならアテステーションは
任意 = ブラウザでも利用可。dev で動作確認 → main 有効化の順を推奨）。
