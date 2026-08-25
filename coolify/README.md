# coolify — サーバー構成の地図

`192.168.50.15`（`docker-mac-pro`・Ubuntu）で動いているものの**全体像**。
ここに載っていないコンテナがあれば、それは直すべき状態（末尾「規則」参照）。

## ディレクトリの分け方

置き場所は**デプロイのされ方**で決まる。迷ったらこの 3 つのどれかに入る:

| ディレクトリ | 中身 | デプロイ |
|---|---|---|
| `apps/` | Coolify がビルドするアプリの**ソース**。dev / main の 2 系統が同じソースから建つ | GitHub への push で自動 |
| `common/` | dev と main で**共有する**土台（DB 以外の周辺・監視・認証・バックアップ等） | `common/deploy-stack.sh <name>`（rsync + `docker compose up -d --build`） |
| `platform/` | Coolify 自身の compose とアプリ登録スクリプト | 手動（`platform/setup.sh` ほか） |

`common/` の各ディレクトリはサーバーの `~/stacks/<name>/` と 1:1 で対応する。
`apps/` にサーバー側の対応ディレクトリは無い（Coolify が git から直接建てる）。

> **移行は 2026-08-25 に完了した。** `common/` は 1 つを除いてすべて Coolify 管理
> （プロジェクト `ckk` の **`common` 環境**）。**Coolify 管理のものに
> `deploy-stack.sh` を使ってはいけない** — 同じものが二重に立ち上がる。
> `deploy-stack.sh` が正しいのは下の「意図的に Coolify へ移さないもの」だけ。

### `common/` 環境のアプリ（14）

`common` 環境のアプリは **main 追従**（共有の土台なので、変更が本番へ出るのは
promotion 後 — dev へのマージで ingress や監視が再起動しない）。

| スタック | 備考 |
|---|---|
| `prisma-studio` | 第 1 号。状態を持たないので試験台にした |
| `metabase` | ボリュームを持つ最初の例。停止 → コピー → 起動で移した |
| `kot-import` | 状態なし |
| `mailrelay` | + `mail-api`（HTTP → SMTP）|
| `portainer` | `dockge` 別名を維持したので経路は無傷 |
| `legacy-db` | 参照専用の旧 DB |
| `monitoring` | 設定はイメージへ焼き込み（0750 対策）|
| `fx-rates` | 旧 shared-db スタックから切り出し |
| `cloudflared` | 参加ネットワークを 8 → **1 本**（`coolify`）に整理 |
| `secrets` | `/data/ckk-secrets` の持ち主 + 健全性チェック |
| `ai-stack` | ollama / open-webui / searxng / metabase-mcp。39GB はホストの固定パスへ |
| `vpn-ldap` | `ldap.env` は Coolify env へ。AD 経路は専用網 `ckk-ldap` |
| `app-support` | 旧 `nextjs-web` スタックの後継（gotenberg × 2 / seaweedfs × 2）|
| `nginx-proxy` | **アプリ行はあるがデプロイしていない**（下記の理由で直接デプロイ）|

### 意図的に Coolify へ移さないもの

| スタック | 理由 |
|---|---|
| `coolify` | **不可能**。自分自身をデプロイすると、その途中で自分を落として失敗する |
| `nginx-proxy` | Coolify は 80/443 を自分の Traefik で握ろうとする。アプリに `ports_exposes: 80,443` を付けた瞬間に `coolify-proxy` が起動してポートを奪い、**LAN の TLS が落ちた**（実際に踏んだ）。逆方向の前提を持つ 2 つのリバースプロキシを同居させる意味は無い |
| `db-backup` | バックアップは**復旧手段**なので、復旧したい相手に依存させない。Coolify が壊れたときにこそ要る |

この 3 つだけが `common/deploy-stack.sh <name>` の対象。サーバーの `~/stacks/`
にもこの 3 つしか残っていない（他は `~/stacks-retired/` へ退避済み — `.env` ごと
保持してあり、消してはいない）。

**Coolify 化で判ったこと（次のスタックでも同じ）**

- `container_name:` は Coolify が握る — `prisma-studio-main` は
  `prisma-studio-main-<appUUID>-<連番>` になる。ただし **compose の
  サービス名はネットワーク別名として残る**ので、`prisma-studio-main:5555` で
  引いている cloudflared 側は無傷（検証済み: 両方とも HTTP 200）。
  影響は `docker exec <名前>` と Portainer の見た目だけ。
- サーバーの `.env` は引き継がれない。**Coolify の env 変数へ入れ直す**
  （値は `~/stacks/<stack>/.env` から移す。`${VAR:?}` の必須変数を落とすと
  デプロイが即失敗するので、キーを数えて確認すること）。
- **名前付きボリュームは名前が変わる。`external: true` と書いても変わる。**
  Coolify は必ず `<appUUID>_<name>` に改名するので、(a) 複数のアプリで 1 本を
  共有できず、(b) 再デプロイが空のボリュームで立ち上がりうる。実際 `secrets` は
  空を掴んで健全性チェックが全項目 MISSING になった。
  **データを持つものは bind mount にする** — bind はそのまま渡る:

  | ホストのパス | 中身 |
  |---|---|
  | `/data/ckk-secrets` | 証明書 / acme state / OpenVPN 設定 / searxng の secret_key |
  | `/data/seaweed-dev` `/data/seaweed-main` | ファイル本体（環境別）|
  | `/data/ollama` `/data/open-webui` | モデル 38GB / チャット履歴 |
  | `/data/db-backups` | バックアップ |
  | `/data/legacy-db` | 旧 macOS 版 DB（`external: true` を信じて**空のクラスタで動いていた**）|

  最後の行は実際に起きた事故。`legacy-db` は `external: true / name:
  ckk-legacy-data` で元データを指しているつもりが、Coolify が
  `<appUUID>_legacy-data` へ改名した結果、**空のまま初期化された状態で
  動いていた**（public のテーブル 0 件）。参照専用でどのネットワークにも
  出しておらず誰も繋いでいなかったので、エラーすら出なかった。
  **`external: true` は Coolify では効かない。データがあるなら bind mount。**

- **docker の既定アドレスプールは 31 本で尽きる**（172.17–31 の /16 が 15 本 +
  192.168 の /20 が 16 本）。アプリごとに `<uuid>_default` が増えるので、移行の
  途中で実際に尽き、デプロイが
  `all predefined address pools have been fully subnetted` で落ちた。

  **2026-08-25 に `/etc/docker/daemon.json` でプールを差し替えて解決した**
  （これはサーバー上のファイルで git には無い。中身はここに控える）:

  ```json
  {
    "default-address-pools": [
      { "base": "10.100.0.0/16", "size": 24 },
      { "base": "10.101.0.0/16", "size": 24 }
    ]
  }
  ```

  512 本になる。**10.x を選んだ理由**は、既定の 192.168 帯が危ないから:

  | 帯 | 何と衝突しうるか |
  |---|---|
  | `192.168.50.0/24` | **LAN そのもの**。docker が `192.168.48.0/20` を採ったら死ぬ |
  | `192.168.11.0/24` | VPN 経由の経路（`vpn-ldap` の tun0 が持つ）|
  | `10.0.10.0/24` `21.10.10.0/24` | 同じく VPN 経由 |

  10.100 / 10.101 はいずれとも重ならない。適用には dockerd の再起動＝
  **全コンテナ再起動**が要る。

  **ただし再起動では既存の網は動かない**（割り当て済みの帯を保持する）。
  網を消してから再デプロイして初めて新プールから採り直す。2026-08-26 に
  全スタックをそうやって作り直し、**192.168 帯をゼロにした**。唯一
  `coolify`（172.28.0.0/16）だけ据え置き — 41 コンテナがぶら下がっており、
  作り直すには全部を切り離す必要がある。172 帯は LAN とも VPN 経路とも
  重ならないので、危険が無いところに手間はかけない。
- 移行の直前に **旧スタックを `docker compose down`** する。`container_name` が
  衝突して新デプロイが失敗するため。
- 自動デプロイには **アプリごとの GitHub webhook** が要る（Coolify 側で
  `manual_webhook_secret_github` を作り、同じ secret で
  `https://deploy.ckk-tool.co.jp/webhooks/source/github/events/manual` を登録）。

---

## グループ

### 1. Edge — 外から入ってくる口

| スタック | コンテナ | 役割 |
|---|---|---|
| `cloudflared` | cloudflared | 公開ドメイン（`*.ckk-tool.co.jp` に一本化。キオスクのみ `*.kai-lab.net`）のトンネル |
| `nginx-proxy` | nginx-proxy, nginx-acme | LAN 内 TLS（acme.sh DNS-01 で Let's Encrypt） |

どちらも **`coolify` 網の別名**へ向ける。Coolify のコンテナ名はデプロイの度に
変わるハッシュなので直接は指さないが、`custom_network_aliases` が安定した名前を
張ってくれる（`web` / `web-main` / `kiosk` / `kiosk-main` / `admin` / `admin-dev` /
`dockge` / `open-webui` …）。

以前はここに socat のリレーを 6 本置いていた。同じ役目を Coolify の機能で
果たせると判ったので **2026-08-25 に廃止**した。同時に nginx と cloudflared の
参加ネットワークを **1 本（`coolify`）** に絞った — スタックごとの compose 網を
名前でたぐる構成は、移行のたびに名前が変わって（`<appUUID>_...`）壊れていた。

### 2. Business apps — Coolify がビルドするアプリ（ブランチ別に 2 系統）

| アプリ | ブランチ | ソース | 公開名 |
|---|---|---|---|
| `nextjs-web-dev` / `-main` | dev / main | リポジトリ root（pnpm workspace） | app-dev / app.ckk-tool.co.jp |
| `nextjs-kiosk-dev` / `-main` | dev / main | リポジトリ root | ckk-kiosk-dev / ckk-kiosk.kai-lab.net（**キオスクのみ kai-lab 継続** — 将来 LAN 専用にするため） |
| `admintools-dev` / `-main` | dev / main | `apps/admintools/` | 内部のみ |
| `po-extract-dev` / `-main` | dev / main | `apps/po-extract/` | 内部のみ（alias 有り） |
| `ckk-db-dev` / `ckk-db-main` | dev / main | `ckk-db/` | 内部のみ（alias 有り）**業務 DB 本体** |
| `db-migrate-dev` / `-main` | dev / main | リポジトリ root（`db-migrate/`） | 内部のみ・ポート無し |

dev と main を**常時両方**動かす（本番の隣で検証するため）。これがコンテナ数が
多い一番の理由で、意図的な構成。

**dev と本番は何も共有しない** — DB（`ckk-db-dev` / `ckk-db-main`）も
ファイルストレージ（`seaweedfs-dev` / `seaweedfs-main`）も PDF 生成
（`gotenberg-dev` / `gotenberg-main`）も環境ごとに別。唯一の例外は GPU の
`ollama`（1 枚しかないので共有・状態を持たない）。

`db-migrate-*` は `shared-db/**` の変更を監視していて、マージのたびに
`prisma migrate deploy` → `grants.sql` → `kiosk-cron.sql` →
`analytics-views.sql` を流す。失敗すればデプロイが失敗として残る。
`ckk-db-*` は**自動デプロイを切ってある**（push で DB コンテナが作り直される
事故を防ぐため）。登録は `platform/add-db-apps.sh`。

### 3. App support — アプリが必要とする周辺（`app-support`）

| コンテナ | 役割 |
|---|---|
| `gotenberg-dev` / `gotenberg-main` | PDF 生成（環境別）|
| `seaweedfs-dev` / `seaweedfs-main` | ファイル本体（S3 API + filer）。**保管先も環境別**（`/data/seaweed-dev` / `-main`）|

旧 `nextjs-web` スタックの後継。socat リレー 6 本はここに居たが、
`custom_network_aliases` で置き換えて廃止した（上の「Edge」参照）。

### 4. Data — 状態を持つもの

| スタック | コンテナ | 中身 |
|---|---|---|
| `prisma-studio` | prisma-studio | DB ブラウザ |
| `metabase` | metabase, metabase-db | BI ダッシュボード |
| `legacy-db` | ckk-legacy-db | 旧 macOS 版の `ckk_system`（FileMaker 移行元・参照専用） |

業務 DB 本体は `apps/ckk-db/` の **`ckk-db-dev` / `ckk-db-main`**（グループ 2）。
旧 `shared-db` スタックは 2026-08-24 に退役し、`fx-rates` は `common/fx-rates/`
へ切り出した。

### 5. AI — GPU を使うもの（32GB × 2 枚）

| コンテナ | GPU | 役割 |
|---|---|---|
| `ollama` | 0 | チャット用モデル（open-webui から） |
| `ollama-vl` | 1 | 注文書抽出用（`qwen2.5vl` 常駐） |
| `open-webui` | — | 社内チャット UI |
| `searxng` | — | open-webui の Web 検索 |
| `metabase-mcp` | — | 勤怠 + CKK 業務データ（analytics ビュー）を open-webui のツールとして出す |

ollama は 1 プロセスで 1 枚しか使わないので**カードごとに 1 台**立てている。
詳細は `ai-stack/README.md`。

### 6. Ops — 運用

| スタック | コンテナ | 役割 |
|---|---|---|
| `monitoring` | grafana, prometheus, loki, alloy, node-exporter, cadvisor, gpu-exporter | メトリクス・ログ・アラート |
| `db-backup` | db-backup, aux-backup, logical-dump, offsite-backup, restore-agent, seaweed-backup | バックアップ一式（`db-backup/README.md`） |
| `portainer` | portainer | コンテナ GUI |
| `coolify` | coolify, db, redis, realtime, sentinel | アプリのビルド・デプロイ基盤 |

### 7. Identity / Integration — 外部システムとの接続

| スタック | コンテナ | 役割 |
|---|---|---|
| `vpn-ldap` | vpn-ldap, ldap-sync | Samba AD への到達（VPN）+ 社員同期。**IdP への経路もここ**（`auth.ckk-tools.loc` はこのコンテナのネットワーク別名で、socat が `21.10.10.10:9000` へ中継する）|

IdP（Authentik）は**別サーバー**にあり、このサーバーの `authentik` スタックは
2026-08-25 に廃止した（リポジトリからも削除済み。サーバー側のボリュームは残置）。
| `mailrelay` | mailrelay | 送信メール中継 |
| `kot-import` | kot-import | King of Time（勤怠）取込 |

---

## Portainer に「名前の無いスタック」が並ぶ理由

Coolify は compose のプロジェクト名に**アプリの UUID** を使う（デプロイやロール
バックで衝突しないようにするため）。設定で変えられる項目は無い（`custom_labels` /
`custom_network_aliases` はあるが、プロジェクト名は無い）。そのため Portainer の
スタック一覧には UUID がそのまま並ぶ。読み替え表:

| Portainer の表示 | 実体 |
|---|---|
| `x2a0qtm58nvvjp823rxlwalr` | nextjs-web-dev |
| `k8dps5g9zxfhdabylqzoq4ux` | nextjs-web-main |
| `iwl1ax5zzhu03jd35fhhlqqj` | nextjs-kiosk-dev |
| `vsyoq6yzg60dz0louru59be5` | nextjs-kiosk-main |
| `f110okf12c7iz5dglveg3qsh` | po-extract-dev |
| `r9in9fuf5qjelamt8vfnpc8d` | po-extract-main |
| `to29pl2a3e4mb0cy6w1c4dkc` | admintools-dev |
| `t9p8tryrx2ciww0nt10bykbj` | admintools-main |

UUID はアプリごとに固定なので、この表は再デプロイでは変わらない（変わるのは
コンテナ名の末尾）。**Coolify のアプリは Coolify の画面で見る**のが本来で、
Portainer は Dockge 由来のスタック（上のグループ 1〜7）を見るために使う。
ログは Loki 側で読める名前に直してある（`monitoring/alloy/config.alloy`）。

## スタックをまたぐ接続

外部ネットワークに参加させることでのみ繋がる（既定では届かない）。移行後は
**実質 2 本**しかない:

```
coolify    ← ほぼ全部。Coolify のアプリと、それを指す nginx / cloudflared。
              安定名は custom_network_aliases が張る（web / kiosk / admin /
              dockge / open-webui / metabase / grafana / ckk-db-* / po-extract-*）
ckk-ldap   ← AD を読む相手を繋ぐ網。vpn-ldap（+ldap-sync）と open-webui /
              metabase が参加する
```

**ただし `ckk-ldap` は到達制御としては効いていない。** `vpn-ldap` は SSO の
OIDC discovery のために `coolify` 網にも参加していて（別名
`auth.ckk-tools.loc` を張る必要がある）、Coolify はそこへサービス名
`vpn-ldap` も自動で足す。結果として **:389 は coolify 網のどのアプリからも
届く**。`ckk-ldap` は「AD を読むのはこれ」という宣言として残してあるだけで、
本当に閉じたいなら SSO 中継を別コンテナに分けて `vpn-ldap` 本体を
`coolify` から外す必要がある（未実施 — コンテナが 1 つ増えるため）。

各アプリ固有の網（`<appUUID>_default`）はそのアプリのサービス間通信専用。
`monitoring` はログ収集を Docker ソケット経由でやるので、網に関係なく全体を見る。

---

## `apps/` — サーバーに `~/stacks/` を持たないもの

Coolify が git から直接建てるので、サーバー側に対応ディレクトリは無い。
`deploy-stack.sh` を向けてはいけない（同じものが二重に立ち上がる）。

| ディレクトリ | Coolify アプリ |
|---|---|
| `apps/nextjs-web/` | `nextjs-web-dev` / `-main`（リポジトリ root が build context） |
| `apps/nextjs-kiosk/` | `nextjs-kiosk-dev` / `-main`（同上） |
| `apps/admintools/` | `admintools-dev` / `-main` |
| `apps/po-extract/` | `po-extract-dev` / `-main`（旧 `ai-stack/extractor/`） |
| `apps/ckk-db/` | `ckk-db-dev` / `ckk-db-main` — 業務 DB 本体 |
| `apps/db-migrate/` | `db-migrate-dev` / `-main` — マイグレーション適用専用 |

## リポジトリの他の場所にある関連物

| パス | 実態 |
|---|---|
| `external/nextcloud-app/` | Nextcloud のアプリ（リンクプレビュー）のソース。デプロイ対象外 |
| `external/android-kiosk/` | キオスク端末の Android ラッパー。APK は `apps/nextjs-kiosk/public/apk/` 経由で配る |
| `shared-db/` | Prisma スキーマとマイグレーション本体（`db-migrate` が読む） |
| `tools/` | デプロイされない作業用スクリプト（スクリーンショット生成・RBAC 表・移行スクリプト等） |

## 規則

1. **すべてのコンテナはどれかのスタックに属する。** `docker run` で単発に立てない
   （立てたら、そのままにせず compose へ持っていくか消す）。
2. **サーバーの `.env` は git に無い。** `deploy-stack.sh` は必ず除外する。
   一覧と取得元は各スタックの README / ルート `CLAUDE.md` の Secrets 節。
3. **バージョンは固定する**（`_specs/techstack.md`）。`>=` で開くと、次に誰かが
   再ビルドしたときに壊れる（実例: metabase-mcp が mcp 2.0.0 で起動不能になった）。
4. **リポジトリがソース・オブ・トゥルース。** サーバー側で直接編集しない
   （`rsync -nic` で差分が出たら、それは事故）。
5. **Coolify のアプリはここでは動かさない。** 同じ名前で二重に立ち上がる。
