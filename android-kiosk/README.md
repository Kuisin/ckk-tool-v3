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

CLI: `./gradlew assembleDevDebug`。release 署名とリリース手順は下の「配布」を参照。

## キオスクモード（端末ロック — デバイスオーナー）

このアプリは自前の Device Policy Controller（`KioskDeviceAdminReceiver`）を持ち、
**デバイスオーナー**として動くとタブレットを専用端末に固定する（MDM 不要）:

- **Lock Task**: このアプリ以外へ離脱不可（ホーム / 最近 / 通知プルダウン無効。
  電源メニューのみ許可）
- **ホーム固定**: 再起動すると自動でこのアプリが全画面起動
- ロック画面無効・給電中は画面常時 ON

通常インストール（デバイスオーナーでない）では従来どおりのただの全画面
アプリとして動く — 全ロジックは no-op。

### 登録方法 A: QR プロビジョニング（推奨・ケーブル不要）

新品または**初期化した**タブレットで:

1. 署名済み APK をビルドし、公開 URL に置く（例:
   `https://ckk-kiosk-dev.kai-lab.net/ckk-kiosk-dev.apk`）
2. QR を生成: `tools/provisioning-qr.sh <apk> <url> dev|prod`
   （APK を更新したら QR も作り直す — checksum が APK に束縛される）
3. タブレット初期設定の「ようこそ」画面で**同じ場所を 6 回タップ** → QR
   スキャナが起動 → Wi-Fi 接続 → QR を読む → APK が自動ダウンロード・
   インストールされ、デバイスオーナーとしてセットアップ完了 → キオスク起動

### 登録方法 B: adb（初期化したくない既存端末）

端末に **Google アカウント等が 1 つも無い**ことが条件（設定 → アカウントで
全削除）。APK をインストールしてから:

```bash
adb shell dpm set-device-owner jp.co.ckk.kiosk.dev/jp.co.ckk.kiosk.KioskDeviceAdminReceiver   # dev 版
adb shell dpm set-device-owner jp.co.ckk.kiosk/jp.co.ckk.kiosk.KioskDeviceAdminReceiver       # prod 版
```

アプリを一度起動するとポリシーが適用されロックされる。

### メンテナンス退出

画面**右上を 3 秒以内に 5 回タップ** → 管理者 PIN 入力
（※ 左上 5 タップは Web 側の隠し端末設定 `/device-settings` に割当済みのため右上）:

- **設定を開く** — 一時的にロックを外して Android 設定へ（アプリに戻ると再ロック）
- **キオスク解除** — デバイスオーナーを放棄して通常アプリに戻す
  （再登録は上の A / B をやり直し）

PIN の既定値は `246810`。**既定値のまま配布しないこと** — ビルドする Mac の
`~/.gradle/gradle.properties`（コミット対象外）に `KIOSK_UNLOCK_PIN=xxxx` を
書いてからビルドすると差し替わる。

## タブレット設定メモ

- カメラ権限は初回 QR スキャン時にダイアログ許可（以後は自動）
- 画面は常時 ON・システムバー非表示
- デバイスオーナー登録しない場合の簡易ロックは Android の
  **アプリ固定（screen pinning）**でも可（弱い — 上のキオスクモード推奨）
- dev 版と prod 版は併存インストール可能（id suffix `.dev`）だが、
  デバイスオーナーになれるのは端末につき 1 アプリのみ

## サーバー側の有効化

Coolify の `nextjs-kiosk-dev` / `nextjs-kiosk-main` に環境変数
`KIOSK_ATTESTATION=required` を設定して再デプロイ（未設定ならアテステーションは
任意 = ブラウザでも利用可。dev で動作確認 → main 有効化の順を推奨）。

## 配布（署名付き APK のリリース）

APK は `docker-compose/nextjs-kiosk/public/apk/` にコミットし、Coolify ビルドの
キオスクアプリがそのまま静的配信する（`/apk/*` は proxy のリダイレクト対象外 =
Cookie なしの新品タブレットでもダウンロード可。APK に秘密情報は含まれない）。
リリースごとに同名で上書きし、リポジトリには常に最新 1 世代のみ置く:

| Flavor | 配布 URL |
|---|---|
| dev  | https://ckk-kiosk-dev.kai-lab.net/apk/ckk-kiosk-dev.apk |
| prod | https://ckk-kiosk.kai-lab.net/apk/ckk-kiosk.apk |

同じ場所の `version.json` に versionCode / versionName / sha256（flavor 別）を
書き出す（キャッシュ確認・将来の自動更新用）。

### 一度だけの準備（Mac）

1. リリース用キーストアを作成（Android Studio → Generate Signed Bundle/APK →
   Create new、または `keytool -genkeypair`）。**リポジトリ外**
   （例: `~/keystores/ckk-kiosk.jks`）に保管し、ファイルと各パスワードを
   ログインキーチェーンにバックアップする。**永続的に同じキーストアを使うこと —
   紛失すると全端末で上書き更新が不可能になる（初期化して再登録するしかない）。**
2. `~/.gradle/gradle.properties`（コミット対象外）に署名情報を追加:

   ```
   CKK_KEYSTORE_PATH=/Users/<you>/keystores/ckk-kiosk.jks
   CKK_KEYSTORE_PASSWORD=...
   CKK_KEY_ALIAS=ckk-kiosk
   CKK_KEY_PASSWORD=...
   ```

   （プロパティが無いビルド環境では release は unsigned にフォールバックする）
3. `brew install qrencode`（プロビジョニング QR の PNG 出力用）

### リリース手順

1. `app/build.gradle.kts` の `versionCode` / `versionName` を上げる
2. `./tools/release-apk.sh` を実行
   （署名付きビルド → `public/apk/` へコピー → `version.json` → QR を `tools/out/` へ）
3. コミット → PR → dev マージ → Coolify デプロイ後に
   `curl -I https://ckk-kiosk-dev.kai-lab.net/apk/ckk-kiosk-dev.apk`（200 を確認。
   `/setup` への 307 が返る場合は proxy の `apk/` 除外が落ちている）
4. dev タブレットで登録・動作確認 → dev→main 昇格（通常フロー・ユーザー操作）で
   prod URL / QR が有効になる

QR（`tools/out/provisioning-*.png`）は APK のチェックサムに紐づくため、
リリースごとに再生成される。`tools/out/` は gitignore。QR PNG は
`public/apk/provisioning-{dev,prod}.png` にも公開され、メインアプリの
マニュアル（DC01 → キオスク端末セットアップ）が常に最新の QR を表示する。

### 端末へのインストール

- **新規タブレット（キオスクロック）**: 初期化 → 初期設定の「ようこそ」画面を
  6 回タップ → そのリリースの QR をスキャン（APK がダウンロードされ
  デバイスオーナーとして構成される）
- **ロックなし・検証用**: Chrome で APK URL を開く → 提供元不明アプリを許可 →
  インストール

### ロック済み端末の更新

ロック済み（デバイスオーナー）端末にはブラウザが無いため、当面は:

- USB で `adb install -r`、または
- 初期化 → 新リリースの QR を再スキャン（登録は軽量な設計）

将来（Phase 2）: デバイスオーナーは `PackageInstaller` でサイレントインストール
できるため、ラッパーが `version.json` をポーリングして `/apk/` から自動更新する
仕組みを端末台数が増えた時点で導入する。
