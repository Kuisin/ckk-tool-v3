# android-kiosk — キオスク端末ラッパー（Android）

拠点フロアの Android タブレット用ラッパーアプリ。`nextjs-kiosk` の Web アプリを
全画面 WebView で表示し、**端末フィンガープリント（ハードウェア鍵）で
「認可された端末からのみアクセス可能」を担保**する。

## 仕組み

1. 初回起動時に **Android Keystore** へ P-256 鍵ペアを生成
   （ハードウェア保護・秘密鍵は端末外に出せない）
2. WebView に `window.KioskDevice` ブリッジを注入
   （`getPublicKey()` = SPKI base64 / `sign(data)` = SHA256withECDSA 署名 /
   `deviceProfile(nonce)` = 署名済み端末プロファイル）
3. Web アプリのログイン画面がチャレンジ（nonce）をサーバーから取得し、
   ブリッジで署名して `POST /api/kiosk/attest` — 初回で公開鍵が端末行に
   **TOFU 束縛**され（SY09 にフィンガープリント表示）、以降は同じ鍵の署名が
   ないとアテスト Cookie（12h）が発行されない
4. サーバー側で `KIOSK_ATTESTATION=required` のとき、ログイン関連 API と
   WebSocket はアテスト Cookie 必須 — **通常ブラウザや未認可端末は
   「専用端末アプリからのみ利用できます」でブロック**される

鍵を失った端末（初期化・交換）は SY09 の **鍵リセット** で解除 → 次回接続時に
新しい鍵が再束縛される。

### 署名済み端末プロファイル（v0.6.0+）

アテステーション時に、端末の素性を **同じ Keystore 鍵で署名して** 一緒に送る。
サーバー（`nextjs-kiosk/src/lib/device-profile.ts`）はこれを見て端末の
**所有区分（社用 / 私用）を自動判定**し、SY09 に表示する。

- 署名対象は `"<nonce>\n<profileJson>"`。サーバー側 `attestPayload()` と
  **1 文字も違ってはいけない**。
- profileJson は `DeviceProfile.kt` が**キー順を固定して手で組み立てる**
  （`JSONObject` のイテレーション順に依存すると、端末や OS 版で文字列が揺れて
  署名が合わなくなる）。
- サーバーは **署名検証 → parse → nonce 照合** の順に見る。profile 内にも
  nonce を入れてあるので、別チャレンジで得た署名の貼り替えも弾かれる。
- **旧 APK 互換**: `deviceProfile` を持たない端末は従来どおり nonce だけの
  署名で通る。サーバーを先に出して、端末は SelfUpdater で順に上げてよい。

送る項目（取れないものは `null`。minSdk 29 なので `enrollmentId` /
`installer` / `securityPatch` は実機でも普通に欠ける）:

| 群 | キー |
|----|------|
| 版・アプリ | `v` `nonce` `signedAt` `appVersion` `appVersionCode` `packageName` `installer` |
| 管理状態 | `isDeviceOwner` `isProfileOwner` `isManagedProfile` `activeAdmins` `lockTaskState` `enrollmentId` |
| 端末同定 | `androidId` `serial` |
| Build | `manufacturer` `model` `device` `brand` `hardware` `buildFingerprint` `buildId` `buildTags` `buildType` |
| OS・リスク | `sdkInt` `securityPatch` `isDeviceSecure` `adbEnabled` `developmentSettings` `isEmulator` |
| 環境 | `timeZone` `locale` |

`enrollmentId`（`dpm.getEnrollmentSpecificId()`、API31+・デバイスオーナー時のみ）は
**組織 × 端末 × アプリで一意、工場出荷リセットでも変わらない** ので、社給端末の
証拠として最も強い。

**保証されること / されないこと**: 鍵は非エクスポートなので、プロファイルを
書き換えれば署名が壊れる = 「その端末が申告した内容である」ことは保証できる。
一方、root 化した端末が**本物の鍵で嘘の値に署名する**ことは防げない。そこを
塞ぐのはハードウェア鍵アテステーション（`setAttestationChallenge` + Google
ルートへのチェーン検証）だけだが、鍵を作り直すことになり既存の TOFU 束縛が
全て壊れる（現場の全端末が `KEY_MISMATCH` → 1 台ずつ手で鍵リセット）ため、
今回は採用していない。採るなら **別エイリアスの 2 本目の鍵**として足すこと。

## ビルド

Android Studio（Ladybug 以降）でこのディレクトリを開く。フレーバー:

| Variant | 接続先 | applicationId |
|---|---|---|
| `devDebug` / `devRelease` | https://ckk-kiosk-dev.kai-lab.net（LAN: https://kiosk-dev.ckk-tools.loc） | `jp.co.ckk.kiosk.dev` |
| `prodRelease` | https://ckk-kiosk.kai-lab.net（LAN: https://kiosk.ckk-tools.loc） | `jp.co.ckk.kiosk` |

CLI からもビルドできる（この Mac には Android SDK が入っている）:

```bash
cd external/android-kiosk
# 初回のみ — local.properties は .gitignore 済み（各自の SDK パスなのでコミットしない）
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties

export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew assembleDevDebug      # → app/build/outputs/apk/dev/debug/app-dev-debug.apk
./gradlew assembleProdDebug
```

`JAVA_HOME` を指定するのは、Gradle が要求する JDK が Android Studio 同梱の
JBR だけだから（システムの java では通らない）。release 署名とリリース手順は
下の「配布」を参照。

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

**プリインストールアプリ（ブロートウェア）は残さない。** QR は
`PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED` を **false** で送るので、
プロビジョニング時に**ランチャーに出る**システムアプリが無効化される
（必須アプリ一覧のものは除く）。この端末は Web ラッパー専用で、OEM の
アプリを残す理由が無く、残せば現場で触れてしまいストレージも食うため。

ランチャーアイコンを持たないコンポーネントは対象外なので、**WebView・IME・
パッケージインストーラ・設定は残る** — 画面表示、キーボード、自動更新、
メンテナンスの「設定を開く」はいずれも従来どおり動く。効くのは**新規
プロビジョニングだけ**で、既存端末を綺麗にするには初期化して QR から
やり直す。個別に戻したいときは `DevicePolicyManager.enableSystemApp()`
（初期化でも戻る）。

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
（※ 左下 5 タップは Web 側の隠し端末設定 `/device-settings` に割当済み。こちらは右上）:

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

## 社内 LAN のアドレス（*.ckk-tools.loc）と証明書

キオスクは将来 **社内ネットワーク限定** にする方針で、そのための LAN 用アドレスを
用意してある:

| flavor | 公開 URL（`BASE_URL` — 起動先） | LAN URL（`LAN_URL`） |
|---|---|---|
| dev | `https://ckk-kiosk-dev.kai-lab.net` | `https://kiosk-dev.ckk-tools.loc` |
| prod | `https://ckk-kiosk.kai-lab.net` | `https://kiosk.ckk-tools.loc` |

**「タブレットに証明書をインストールする」だけでは動かない。** `targetSdk` 24 以降の
Android アプリは、ユーザー領域にインストールされた CA を**既定では信頼しない**
（ブラウザは信頼するので「ブラウザでは開けるがアプリでは開けない」という切り分けに
なる）。opt-in が要る。

そこで:

1. `res/xml/network_security_config.xml` で、**`*.ckk-tools.loc` の 2 ホストに限って**
   user ストアの CA を信頼する。`base-config` ではなく `domain-config` にしてあるのが
   肝で、他の通信の TLS は既定（system のみ）のまま厳格に保たれる
2. CA 自体は**アプリに同梱せず**、**プロビジョニング QR の admin extras** で運び、
   デバイスオーナー権限の `DevicePolicyManager.installCaCert()` で端末へ入れる
   （`KioskMode.installCaFromProvisioningExtras`）。端末ごとの手作業は不要で、
   CA を差し替えても APK の作り直しは要らない

QR には **base64** で載る（PEM をそのまま JSON に置くと改行のエスケープで壊れ、
しかも壊れたまま QR は生成できてしまうため）。生成:

```sh
./provisioning-qr.sh <apk> <apk-url> dev|prod ~/ckk-internal-ca.crt
```

`MainActivity` のホストロックは `BASE_URL` と `LAN_URL` の**両方**を許可する
（`allowedHosts`）。起動先は `BASE_URL` のままなので、社内 DNS が未整備でも挙動は
変わらない。LAN 限定へ切り替えるときに `BASE_URL` を `LAN_URL` と同じ値にする。

### ⚠️ 初期プロビジョニングの APK ダウンロード URL は社内 https にできない

QR の `PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION` を
`https://kiosk.ckk-tools.loc/...` にすることはできない。この取得を行うのは**アプリが
入る前の初期設定ウィザード**で、その時点では社内 CA はまだ端末に無く（CA はこの QR で
アプリと一緒に入る）、証明書検証に失敗する — 鶏と卵。

選択肢は 2 つ:

| 方法 | 可否 | 備考 |
|---|---|---|
| 公開 https（現行 `ckk-kiosk*.kai-lab.net`） | ✅ | 公的 CA なのでウィザードが検証できる |
| 社内 **http**（例 `http://kiosk.ckk-tools.loc/apk/...`） | ✅ | QR の SHA-256 チェックサムが改ざんを防ぐ。完全 LAN 内で完結させたい場合はこちら |
| 社内 https（社内 CA） | ❌ | ウィザードが検証できない |

**プロビジョニングが終わった後**は LAN の https URL を普通に使える（CA が入るため）。

前提（サーバー／ネットワーク側）:

- 社内 DNS に `kiosk.ckk-tools.loc` / `kiosk-dev.ckk-tools.loc` → `192.168.50.15`
  （`ckk-tools.loc` は AD のドメインなので AD DNS に A レコードを足す）
- nginx-proxy に vhost 2 本（`coolify/common/nginx-proxy/conf.d/kiosk*.ckk-tools.loc.conf`）。
  証明書の発行手順はその vhost 先頭のコメント参照
- CA の秘密鍵はサーバーの `~/stacks/nginx-proxy/certs/` から出さない（配るのは証明書のみ）

## サーバー側の有効化

Coolify の `nextjs-kiosk-dev` / `nextjs-kiosk-main` に環境変数
`KIOSK_ATTESTATION=required` を設定して再デプロイ（未設定ならアテステーションは
任意 = ブラウザでも利用可。dev で動作確認 → main 有効化の順を推奨）。

## 配布（署名付き APK のリリース）

APK は `coolify/apps/nextjs-kiosk/public/apk/` にコミットし、Coolify ビルドの
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

### 端末の更新（自動 — SelfUpdater）

アプリは `SelfUpdater.kt` により**自己更新**する。`{BASE_URL}/apk/version.json`
を起動 30 秒後 + 1 時間ごとに確認（クエリ付き取得で CDN キャッシュを回避）し、
自フレーバーの `versionCode` が新しければ APK をダウンロード → SHA-256 を
`version.json` と照合 → `PackageInstaller` で適用する:

- **デバイスオーナー**: サイレント更新（ダイアログなし）。適用後は
  `UpdateReceiver`（`MY_PACKAGE_REPLACED`）+ ホーム固定で自動再起動
- **通常インストール**: OS の確認ダイアログが出る（`REQUEST_INSTALL_PACKAGES`）

業務中の再起動を避けるため、定期チェックで見つけた更新は**深夜 1:00–5:59 のみ**
適用する（起動直後のチェックは即適用 — 起動直後 = 使用中でないため）。
リリース作業は従来どおり `release-apk.sh` → コミット → デプロイのみ。旧版
（v0.2.x 以前）だけは USB `adb install -r` か初期化 + QR 再スキャンで更新する。
