## Tech Stack
### Version Policy
- Core stack: freeze exact version
- Apply security path for Next.js, Auth.js and Nginx
- Docker image: freeze tag
- pnpm install --frozen-lockfile required

### Containers
| #  | Container   | Image                         | Role                          | Port (internal) |
|----|-------------|-------------------------------|-------------------------------|-----------------|
| 1  | nextjs      | node:24-slim (standalone)     | App (BFF + UI + API)          | 3000            |
| 2  | postgresql  | groonga/pgroonga:4.0.6-alpine-17 | Primary DB + PGroonga      | 5432            |
| 3  | valkey      | valkey/valkey:8.1             | Cache / Pub/Sub / BullMQ      | 6379            |
| 4  | gotenberg   | gotenberg/gotenberg:8.17      | PDF generation API            | 3100            |
| 5  | loki        | grafana/loki:3.7              | Log storage                   | 3101            |
| 6  | alloy       | grafana/alloy:1.8             | Log collector (Nginx/Docker)  | 12345           |
| 7  | grafana     | grafana/grafana:11.6          | Dashboard / Alerting          | 3002            |
| 8  | nginx       | nginx:1.28                    | Reverse proxy / TLS           | 80, 443         |
| 9  | gitea       | gitea/gitea:1.23              | Git repository                | 3003            |
| 10 | dockge      | louislam/dockge:1             | Docker GUI                    | 5001            |
| 11 | seaweedfs   | chrislusf/seaweedfs:latest    | File storage (S3 API)         | 8333, 9333      |

Total: 11 containers

### Details
```
# Core Runtime
Node:           v24 LTS（固定）
Package Mgr:    pnpm

# Fullstack / UI
Framework:      Next.js 16.x（LTS Active, minor update）
React:          v19（Next.js依存）
Language:       TypeScript 5.x（固定）
Routing:        App Router（Next.js標準）

UI Library:     Mantine v9.x（固定）
Forms:          @mantine/form
Tables:         mantine-datatable（対応version固定）
Icons:          Tabler Icons
Styling:        Mantine + CSS Modules

Server State:   React Server Components（標準）
Client State:   Zustand（軽量）
Validation:     Zod

API Layer:      Next.js Route Handler（/app/api）
ORM:            Prisma ORM（v7系固定）
Database:       PostgreSQL 17

# Realtime
Transport:      SSE（Next.js Route Handler）
Pub/Sub:        Valkey
Presence:       Valkey Keys + TTL
Comments:       PostgreSQL + Valkey Pub/Sub

# Auth / Security
Auth:           Auth.js v5（NextAuth後継）
Session:        DB Session + Short JWT
Identity Source: Samba AD（LDAP / OAuth連携）
RBAC:           Custom（あなたのrole_permission設計）

# PDF / Document
PDF Engine:     Gotenberg
Template:       HTML + vanilla CSS

# Logging / Audit
App Log:        pino + Loki
Audit Log:      DB audit_logs (before_data/after_data)
Access Log:     Nginx JSON → Loki

Error Tracking: Grafana Alerting
Metrics:        Loki metrics + Grafana

### Dev / Build
Bundler:        Turbopack（Next.js内蔵）
Lint/Formatter: Biome
Test:
  - Unit:       Vitest
  - E2E:        Playwright

Env Mgmt:       .env + Docker Secrets
Feature Flag:   simple DB flag table

Container:      Docker Compose
Git:            Gitea
Runtime:        Node standalone (Next build output)
Reverse Proxy:  Nginx
GUI:            Dockge

# i18n
System i18n:    next-intl + JSON files（messages/）
User Data i18n: DB json field {ja, en}

# Other
Date/Time:      date-fns v4（tree-shakeable）
HTTP Client:    Ky
File Storage:   SeaweedFS（Apache 2.0）
Doc Intake:     imapflow（IMAP） + BullMQ（ファイル監視）
OCR/Extraction: Gemini 2.5 Flash
Notification:   nodemailer + Nextcloud API + SSE
Job Runner:     BullMQ
Cache:          Valkey
Search Engine:  PGroonga
Docs:           Markdown + Git管理

# Data Integration
Accounting:     弥生会計 Next（CSV export）
HR:             Samba AD sync（BullMQ repeatable job）
```

## Side System
Along side the main system, following application should be deployed.

### Login portal (Custom or OSS)
Path for user to login to Internal Application.

### Sync Automation (Custom)
Sync employee data from Samba AD to PostgreSQL

### Project JSON Management Scripts
Simple scripts to manage JSON data on local device. It should edit project JSON file using browser table view for following files.

#### Translation JSON (messages/)
- Merge multiple locale JSON files into a single table view where each locale is a column and keys are flattened (dot notation).
- Allow inline editing, searching, filtering by prefix (e.g. `common`, `nav`), and detecting missing translations.
- Save edited data back into individual locale JSON files while preserving the original nested structure.

#### Permission default JSON (db_template/permission)
- Provide a table editor to manage permission records including code, category, and localized fields.
- Support create, update, delete operations with filtering by category and search by code or name.
- Save updates back to `permissions.json` in a clean, structured format suitable for DB seeding.

#### Role Permission default JSON (db_template/role_permission)
- Provide a role-based editor with tabs to manage roles and their metadata (name, display_name, description, system flag).
- Display a permission × action matrix where each cell maps to a scope via dropdown selection.
- Support bulk operations (grant/revoke), role CRUD, and save mappings back to JSON for seeding.