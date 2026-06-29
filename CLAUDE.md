# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
Always commit per feature and record change.

## Project Overview

Manufacturing Company Business Management System — a Next.js fullstack monolith covering sales, purchasing, production, shipping, billing, and master data. Specs live in `_specs/`; implementation follows those documents.

## Specs

@_specs/structure.md
@_specs/techstack.md
@_specs/tables.md
@_specs/feature.md
@_specs/design.md

## Commands

```bash
# Install (lockfile must not change)
pnpm install --frozen-lockfile

# Dev server (Turbopack)
pnpm dev

# Build
pnpm build

# Lint & format (Biome)
pnpm lint
pnpm format

# Unit tests (Vitest)
pnpm test
pnpm test -- path/to/file.test.ts   # single file

# E2E tests (Playwright)
pnpm e2e
pnpm e2e -- --grep "test name"       # single test

# Prisma
pnpm prisma generate
pnpm prisma migrate dev
pnpm prisma db push                  # dev-only
```

## Key Patterns

**RBAC** — Always query the `user_permissions` view (not the raw relation tables). It aggregates roles → permissions per user and returns only the highest `SCOPE` per `(user_id, action, permission_code)`.

**Auth** — Auth.js v5, DB session + short JWT. Identity sourced from Samba AD via LDAP/OAuth.

**Realtime** — SSE via Next.js Route Handlers. Pub/Sub and presence through Valkey (keys + TTL).

**PDF** — HTML + vanilla CSS templates sent to Gotenberg (`app/api/pdf/`). No headless browser. Generated PDFs are stored in SeaweedFS and referenced via the `files` table.

**Jobs** — BullMQ backed by Valkey. AD → PostgreSQL employee sync runs as a repeatable job. Monthly billing closing also runs as a BullMQ job.

**Doc intake / OCR** — Customer order PDFs (incl. scans) are imported via email (imapflow), a watched folder, or upload, then extracted to structured JSON by the **self-hosted** `po-extract` API in the `ai-stack` (no external API/keys): `POST /extract` (multipart: `file` PDF/image + `schema` JSON Schema string + optional `prompt`) → JSON; `GET /healthz`. It renders PDF pages at 300 DPI and fills the schema with the **qwen2.5vl** vision model on Ollama. Powers the AI-first 受注請書 intake (scan image + auto-filled form → user confirms; on extraction failure, the user enters every field from scratch).

**Search** — PGroonga extension on PostgreSQL (not a separate service).

**Logging** — App logs via pino → Loki. Row-level audit via `audit_logs` (before_data / after_data JSON). System events (login, PDF generation, CSV export) in `system_logs`. Nginx access logs → Loki via Alloy. Alerts in Grafana.

**i18n** — UI strings via `next-intl` + `messages/` JSON. DB multilingual fields are `{ ja: '', en: '' }` JSON objects — always write both locales.

**Accounting** — `lib/csv-export.ts` produces 弥生会計 Next CSV. Journal logic is isolated in `lib/journal.ts`.

**Data fetching** — React Server Components for server state; Zustand for client-only state.

**Numbering** — `lib/numbering.ts` handles all document numbers with monthly-reset sequences (`numbering_sequences` table). Formats: `QOT-YYYYMM-NNNNN`, `ORD-YYYYMM-NNNNN`, `PO-YYYYMM-NNNNN` (素材発注書), `DRN-YYYYMM-NNNNN`, `INV-YYYYMM-NNNNN`. Work order / lot numbers are global serial integers.

**File storage** — SeaweedFS via S3 API. All uploaded/generated files stored as `files` table rows (`storage_key`, `filename`, `mime_type`).

**Design** — Mantine v9 with `primaryColor: 'blue'`, `defaultRadius: 'sm'`, global `size: 'sm'` defaults. Page patterns: list → `DataTable` + filter bar in `Paper`; detail → summary grid + `Tabs`; form → `Paper` sections + `@mantine/form` with `zodResolver` + Server Actions. See `_specs/design.md` for full component specs and status-badge color map.

## Deployment & Remote Server

**Server** — `192.168.50.15` (hostname `docker-mac-pro`; despite the name it runs Linux — Ubuntu noble / t2 kernel). Access: `ssh 192.168.50.15` (key-based, user `kaiseisawada`). All services run as Docker Compose stacks orchestrated by **Dockge**, one dir per stack under `~/stacks/` on the server: `nextjs-web`, `metabase`, `ai-stack`, `monitoring`, `vpn-ldap`, `kot-import`, `admintools`, `nginx-proxy`, `cloudflared`, `portainer`.

**Source ↔ server** — Each `~/stacks/<stack>` mirrors `docker-compose/<stack>` in this repo, but the **server copies are not git repos** and there is no deploy script/CI. Deploy = rsync the source up, then rebuild. The server's `.env` holds secrets and lives **only on the server** — never overwrite or delete it (always `--exclude '.env'`).

**Deploy a stack** (example: `nextjs-web`):

```bash
# from repo: docker-compose/nextjs-web/
rsync -a --exclude node_modules --exclude .next --exclude .git \
  --exclude .env --exclude .vscode --exclude '*.tsbuildinfo' --exclude .DS_Store \
  ./ 192.168.50.15:'~/stacks/nextjs-web/'
ssh 192.168.50.15 'cd ~/stacks/nextjs-web && docker compose up -d --build'
```

Dry-run the rsync first (`rsync -avn …`) to confirm the file set. The Dockerfile builds Next.js `output: "standalone"`; PDF templates under `src/pdf-templates/` reach the runtime image via `outputFileTracingIncludes` in `next.config.ts` (file tracing can't follow `fs.readFile` paths). `pnpm install --frozen-lockfile` runs in-build, so never let the lockfile drift.

**nextjs-web topology** — host `:3001` → container `:3000` (3000 is taken by open-webui). Public access `https://dev.kai-lab.net` via the `cloudflared` stack; LAN TLS via `nginx-proxy`; both reach the app over the auto-created `nextjs-web_default` network at `http://web:3000`. PDF generation uses the in-stack `gotenberg` service at `http://gotenberg:3000` (`GOTENBERG_URL`); generated PDFs persist in the in-stack `seaweedfs` filer (`SEAWEED_FILER_URL=http://seaweedfs:8888`).

**Cross-stack services** — the `ai-stack` runs `ollama` (`:11434`, local models) and `po-extract` (`:8000`, the document→JSON extractor, model `qwen2.5vl`); `metabase` (`:3003`, OSS, postgres app DB) holds the BI dashboards. To let `nextjs-web` call `po-extract`, attach it to the `ai-stack` network (external, like `metabase` joins `ldap`/`kot`) and use `http://po-extract:8000` — it is **not** reachable cross-stack by default.

**Manage / verify** — `docker ps`, `docker compose logs -f <svc>`, `docker compose restart <svc>`, `docker compose up -d --build` (rebuild after source change). Health/smoke-test from inside the network, e.g. `docker exec nextjs-web node -e 'fetch("http://127.0.0.1:3000/...")...'`. Postgres-backed stacks (`metabase-db`, `ckk-legacy-db`, `kot-db`, `admintools-db`) are siblings — back up with `docker exec <db> pg_dump` and restore with `pg_restore`/`psql` before mutating live data.
