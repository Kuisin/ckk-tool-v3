## Tech Stack
### Version Policy
- Core stack: freeze exact version
- Apply security path for Next.js, Auth.js and Nginx
- Docker image: freeze tag
- pnpm install --frozen-lockfile required
- 依存の追加は**禁止ではない**。入れる / 自前で書く の両案とトレードオフ
  （得られるもの・大きさ・ライセンス・保守の見込み・責務の境界）を示して
  **利用者に確認してから**決める。決めたら完全固定でピンし、採用理由を
  `coolify/apps/nextjs-web/CLAUDE.md`「依存ライブラリ」へ記録する

### Containers
| #  | Container   | Image                         | Role                          | Port (internal) |
|----|-------------|-------------------------------|-------------------------------|-----------------|
| 1  | nextjs      | node:24-slim (standalone)     | App (BFF + UI + API)          | 3000            |
| 2  | postgresql  | groonga/pgroonga:4.0.6-alpine-17 | Primary DB + PGroonga      | 5432            |
| 3  | valkey      | valkey/valkey:8.1             | Cache / Pub/Sub / BullMQ      | 6379            |
| 4  | gotenberg   | gotenberg/gotenberg:8.17      | PDF generation API            | 3100            |
| 5  | loki        | grafana/loki:3.7              | Log storage                   | 3101            |
| 6  | alloy       | grafana/alloy:1.8             | Log collector (Nginx/Docker)  | 12345           |
| 7  | grafana     | grafana/grafana:11.6          | Dashboard / Alerting          | 3002            |
| 8  | nginx       | nginx:1.28                    | Reverse proxy / TLS           | 80, 443         |
| 10 | portainer   | portainer/portainer-ce:lts    | Docker GUI（旧 dockge。`dockge` 別名のまま） | 9000 |
| 11 | seaweedfs   | chrislusf/seaweedfs:latest    | File storage (S3 API)         | 8333, 9333      |

Total: 11 containers

### Details
```
# Core Runtime
Node:           v24 LTS（固定）
Package Mgr:    pnpm

# Fullstack / UI
Framework:      Next.js 16.x（LTS Active, minor update）
React:          v19（Next.js依存）
Language:       TypeScript 5.x（固定）
Routing:        App Router（Next.js標準）

UI Library:     Mantine v9.x（固定）
Forms:          @mantine/form
Tables:         mantine-datatable（対応version固定）
Icons:          Tabler Icons
Flow Graph:     React Flow (@xyflow/react) 12.11.3（完全固定・MIT）
                工程ワークフローの図示のみ。レイアウトと妥当性判定は
                lib/workflow-core.ts が持ち、ライブラリは描画層に留める
Styling:        Mantine + CSS Modules

Server State:   React Server Components（標準）
Client State:   Zustand（軽量）
Validation:     Zod

API Layer:      Next.js Route Handler（/app/api）
ORM:            Prisma ORM（v7系固定）
Database:       PostgreSQL 17

# Realtime
Transport:      SSE（Next.js Route Handler）
Pub/Sub:        Valkey
Presence:       Valkey Keys + TTL
Comments:       PostgreSQL + Valkey Pub/Sub

# Auth / Security
Auth:           Auth.js v5（NextAuth後継）
Session:        DB Session + Short JWT
Identity Source: Samba AD（LDAP / OAuth連携）
RBAC:           Custom（あなたのrole_permission設計）

# PDF / Document
PDF Engine:     Gotenberg
Template:       HTML + vanilla CSS

# Logging / Audit
App Log:        pino + Loki
Audit Log:      DB audit_logs (before_data/after_data)
Access Log:     Nginx JSON → Loki

Error Tracking: Grafana Alerting
Metrics:        Loki metrics + Grafana

### Dev / Build
Bundler:        Turbopack（Next.js内蔵）
Lint/Formatter: Biome
Test:
  - Unit:       Vitest
  - E2E:        Playwright

Env Mgmt:       .env + Docker Secrets
Feature Flag:   simple DB flag table

Container:      Docker Compose
Git:            Github
Runtime:        Node standalone (Next build output)
Reverse Proxy:  Nginx
GUI:            Dockge
Deploy:         Coolify（nextjs-webのみ; dev/mainブランチ別ビルド＋ロールバック）
                他スタックは rsync + docker compose up -d --build

# i18n
System i18n:    next-intl + JSON files（messages/）
User Data i18n: DB json field {ja, en}

# Other
Date/Time:      date-fns v4（tree-shakeable）
HTTP Client:    Ky
File Storage:   SeaweedFS（Apache 2.0）
Doc Intake:     intake-gateway コンテナ（IMAP。Python 標準ライブラリ
                imaplib + email — 日本語メールのファイル名 RFC 2047 /
                RFC 2231 / ISO-2022-JP を正しく読めるため。imapflow は
                入れない）+ 監視フォルダ（instrumentation.ts のポーラー）。
                受信した添付は INTAKE_DIR へ**直接書く**（アプリのトークンも
                DB 接続もゲートウェイに渡さない = 隔離）。外部システムからの
                push は POST /api/intake/inbound（X-Intake-Token）
OCR/Extraction: ローカルLLM（self-hosted）— po-extract API
                （**Coolify 管理・環境別**: po-extract-dev / po-extract-main。
                 いずれも内部専用でホストポート非公開。ソースは
                 coolify/apps/po-extract/。GPU の ollama は
                 ai-stack に 1 台だけ置き両環境で共有）
                （FastAPI /extract: PDF/画像 → 構造化JSON）。3段ハイブリッド:
                ①OCR（PP-OCRモデルをONNXRuntime=RapidOCRで実行）+ ②Vision
                転写（qwen2.5vl）→ ③LLMがJSON生成。
                **モデルの接続先は実行時に差し替えられる**（SY0E）—
                ローカル ollama（既定）/ OpenAI 互換 / Anthropic / Gemini。
                設定は nextjs-web が持ち、リクエストごとにヘッダ
                X-AI-Config で渡す。SDK は足さず httpx の生 REST。
                OCR は常にローカル。既定のままなら従来と同一挙動。
AI補助タスク:    同じ po-extract の /generate/<task>（紙なし・LLM 1回・数秒）。
                アプリ内の道具から呼ぶ汎用口で、第1号は keywords
                （製品・素材マスタのキーワード候補生成 — MS04/MS06）。
                自前スキーマを渡す /generate も可。アプリ側は
                nextjs-web の lib/po-extract.ts 経由。
Notification:   nodemailer + Nextcloud API + SSE
Job Runner:     BullMQ
Cache:          Valkey
Search Engine:  PGroonga
Docs:           Markdown + Git管理

# Data Integration
Accounting:     弥生会計 Next（CSV export）
HR:             Samba AD sync（BullMQ repeatable job）
```

Side system features are documented in `_specs/feature.md`.
