# docker-compose — サーバー構成の地図

`192.168.50.15`（`docker-mac-pro`・Ubuntu）で動いているものの**全体像**。
ここに載っていないコンテナがあれば、それは直すべき状態（末尾「規則」参照）。

各ディレクトリはサーバーの `~/stacks/<name>/` と 1:1 で対応する。デプロイは
`./deploy-stack.sh <name>`（rsync + `docker compose up -d --build`）。
**例外は Coolify がビルドするアプリ**で、そちらは git push で自動デプロイされる。

---

## グループ

### 1. Edge — 外から入ってくる口

| スタック | コンテナ | 役割 |
|---|---|---|
| `cloudflared` | cloudflared | 公開ドメイン（`*.kai-lab.net` / `deploy.ckk-tool.co.jp`）のトンネル |
| `nginx-proxy` | nginx-proxy, nginx-acme | LAN 内 TLS（acme.sh DNS-01 で Let's Encrypt） |

どちらも **リレー名**（下の 2）へ向ける。Coolify のコンテナ名はデプロイの度に
変わるハッシュなので、ここから直接は指さない。

### 2. Business apps — Coolify がビルドするアプリ（ブランチ別に 2 系統）

| アプリ | ブランチ | ソース | 公開名 |
|---|---|---|---|
| `nextjs-web-dev` / `-main` | dev / main | リポジトリ root（pnpm workspace） | ckk-dev / ckk.kai-lab.net |
| `nextjs-kiosk-dev` / `-main` | dev / main | リポジトリ root | ckk-kiosk-dev / ckk-kiosk.kai-lab.net |
| `admintools-dev` / `-main` | dev / main | `admintools/` | 内部のみ |
| `po-extract-dev` / `-main` | dev / main | `ai-stack/extractor/` | 内部のみ（alias 有り） |

dev と main を**常時両方**動かす（本番の隣で検証するため）。これがコンテナ数が
多い一番の理由で、意図的な構成。

### 3. App support — アプリが必要とする周辺（`nextjs-web` スタック）

| コンテナ | 役割 |
|---|---|
| `web` / `web-main` / `kiosk` / `kiosk-main` / `admin` / `admin-dev` | socat リレー。ハッシュ名の Coolify コンテナに**安定した名前**を与える |
| `nextjs-gotenberg` | PDF 生成 |
| `nextjs-seaweedfs` | ファイル本体（S3 API + filer） |

> リレー 6 本は Coolify の `custom_network_aliases`（po-extract で使っている
> 仕組み）で置き換えられる。置き換えると Edge から Coolify コンテナへ直接
> 向けられ、6 コンテナ消える — 未実施（ingress を触るため要検証）。

### 4. Data — 状態を持つもの

| スタック | コンテナ | 中身 |
|---|---|---|
| `shared-db` | shared-db | **業務 DB 本体**（PG17 + PGroonga、スキーマ分割） |
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
| `metabase-mcp` | — | 勤怠データを open-webui のツールとして出す |

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
| `authentik` | server, worker, postgresql, redis | SSO（OIDC） |
| `vpn-ldap` | vpn-ldap, ldap-sync | Samba AD への到達（VPN）+ 社員同期 |
| `mailrelay` | mailrelay | 送信メール中継 |
| `kot-import` | kot-import | King of Time（勤怠）取込 |

---

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
