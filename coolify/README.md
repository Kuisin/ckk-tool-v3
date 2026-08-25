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

> **移行中** — `common/` は Coolify 管理（プロジェクト `ckk` の **`common` 環境**）へ
> 1 スタックずつ移している。**移行済みのものに `deploy-stack.sh` を使ってはいけない**
> （Coolify が建てたコンテナと二重になる）。現況は下表。

### `common/` の移行状況

`common` 環境のアプリは **main 追従**（共有の土台なので、変更が本番へ出るのは
promotion 後 — dev へのマージで ingress や監視が再起動しない）。

| スタック | 管理 | 備考 |
|---|---|---|
| `prisma-studio` | **Coolify**（main 追従） | 第 1 号。状態を持たないので試験台にした |
| `metabase` | **Coolify**（main 追従） | ボリュームを持つ最初の例。停止 → コピー → 起動で移した |
| `kot-import` | **Coolify**（main 追従） | 状態なし。旧 shared-db ネットワークも外した |
| 他 11 スタック | `deploy-stack.sh` | 未移行 |

**Coolify 化で判ったこと（次のスタックでも同じ）**

- `container_name:` は Coolify が握る — `prisma-studio-main` は
  `prisma-studio-main-<appUUID>-<連番>` になる。ただし **compose の
  サービス名はネットワーク別名として残る**ので、`prisma-studio-main:5555` で
  引いている cloudflared 側は無傷（検証済み: 両方とも HTTP 200）。
  影響は `docker exec <名前>` と Portainer の見た目だけ。
- サーバーの `.env` は引き継がれない。**Coolify の env 変数へ入れ直す**
  （値は `~/stacks/<stack>/.env` から移す。`${VAR:?}` の必須変数を落とすと
  デプロイが即失敗するので、キーを数えて確認すること）。
- **名前付きボリュームは名前が変わる**（compose プロジェクト名がアプリ UUID に
  なるため）。状態を持つスタックは「停止 → 新ボリュームへコピー → 起動」を
  1 スタックずつやる。`prisma-studio` はボリュームが無いので影響なし。
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

どちらも **リレー名**（下の 2）へ向ける。Coolify のコンテナ名はデプロイの度に
変わるハッシュなので、ここから直接は指さない。

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

### 3. App support — アプリが必要とする周辺（`nextjs-web` スタック）

| コンテナ | 役割 |
|---|---|
| `web` / `web-main` / `kiosk` / `kiosk-main` / `admin` / `admin-dev` | socat リレー。ハッシュ名の Coolify コンテナに**安定した名前**を与える |
| `gotenberg-dev` / `gotenberg-main` | PDF 生成（環境別） |
| `seaweedfs-dev` / `seaweedfs-main` | ファイル本体（S3 API + filer）。**ボリュームも環境別** |

> リレー 6 本は Coolify の `custom_network_aliases`（po-extract で使っている
> 仕組み）で置き換えられる。置き換えると Edge から Coolify コンテナへ直接
> 向けられ、6 コンテナ消える — 未実施（ingress を触るため要検証）。

### 4. Data — 状態を持つもの

| スタック | コンテナ | 中身 |
|---|---|---|
| `shared-db` | shared-db, fx-rates | **旧・共有 DB**。`ckk-db-dev` / `ckk-db-main`（Coolify アプリ）へ移行中。移行完了後に停止する（ボリュームは切り戻し用に暫く残す） |
| `prisma-studio` | prisma-studio | DB ブラウザ |
| `metabase` | metabase, metabase-db | BI ダッシュボード |
| `legacy-db` | ckk-legacy-db | 旧 macOS 版の `ckk_system`（FileMaker 移行元・参照専用） |

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
| `authentik` | server, worker, postgresql, redis | SSO（OIDC・VPN 越しの AD と連携） |
| `vpn-ldap` | vpn-ldap, ldap-sync | Samba AD への到達（VPN）+ 社員同期 |
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

外部ネットワークに参加させることでのみ繋がる（既定では届かない）:

```
coolify ネットワーク   ← shared-db / gotenberg / seaweedfs / ollama / ollama-vl
                          （Coolify のアプリから名前で引くため）
vpn-ldap_default       ← open-webui（LDAP ログイン）
nextjs-web_default     ← nginx-proxy / cloudflared（リレー経由でアプリへ）
monitoring             ← 監視系のみ（ログ収集は Docker ソケット経由なので全体を見る）
```

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
