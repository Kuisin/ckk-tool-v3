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

**Doc intake / OCR** — Customer order PDFs (incl. scans) are imported via email (imapflow), a watched folder, or upload, then extracted to structured JSON by the **self-hosted** `po-extract` API in the `ai-stack` (no external API/keys). It runs a **3-stage hybrid pipeline** for accuracy: (1) an **OCR** text layer from PaddleOCR's PP-OCR models on **ONNXRuntime** (RapidOCR — PaddlePaddle's native inference SIGSEGVs on this Xeon host, so the same models run via ONNX), (2) a **vision-model** transcription (`qwen2.5vl`), then (3) an **LLM** that cross-checks both readings and emits the schema JSON (+ non-destructive numeric reconciliation). Both model stages default to one resident model so the GPU never swaps mid-request (~48s/doc). Endpoints:
- `POST /extract/<doc_type>` (multipart: `file` + optional `prompt`) — uses a **built-in schema** per type. Types: `order-request` (受注請書 intake — the primary one), `quote`, `invoice`, `delivery-note`, `purchase-order`. Each schema matches the v3 data model.
- `POST /extract` — same, but the caller supplies its own `schema` (JSON Schema string) for ad-hoc shapes.
- `GET /healthz` (status + model + types), `GET /schemas` (the built-in schemas).

Powers the AI-first 受注請書 intake (scan image + auto-filled form → user confirms; on extraction failure, the user enters every field from scratch). Source: `docker-compose/ai-stack/extractor/app.py`.

**Search** — PGroonga extension on PostgreSQL (not a separate service).

**Logging** — App logs via pino → Loki. Row-level audit via `audit_logs` (before_data / after_data JSON). System events (login, PDF generation, CSV export) in `system_logs`. Nginx access logs → Loki via Alloy. Alerts in Grafana.

**i18n** — UI strings via `next-intl` + `messages/` JSON. DB multilingual fields are `{ ja: '', en: '' }` JSON objects — always write both locales.

**Accounting** — `lib/csv-export.ts` produces 弥生会計 Next CSV. Journal logic is isolated in `lib/journal.ts`.

**Data fetching** — React Server Components for server state; Zustand for client-only state.

**Numbering** — `lib/numbering.ts` handles all document numbers with monthly-reset sequences (`numbering_sequences` table). Formats: `QOT-YYYYMM-NNNNN`, `ORD-YYYYMM-NNNNN`, `PO-YYYYMM-NNNNN` (素材発注書), `DRN-YYYYMM-NNNNN`, `INV-YYYYMM-NNNNN`. Work order / lot numbers are global serial integers.

**File storage** — SeaweedFS via S3 API. All uploaded/generated files stored as `files` table rows (`storage_key`, `filename`, `mime_type`).

**Design** — Mantine v9 with `primaryColor: 'blue'`, `defaultRadius: 'sm'`, global `size: 'sm'` defaults. Page patterns: list → `DataTable` + filter bar in `Paper`; detail → summary grid + `Tabs`; form → `Paper` sections + `@mantine/form` with `zodResolver` + Server Actions. See `_specs/design.md` for full component specs and status-badge color map.

## Deployment & Remote Server

**Branch → environment (deploy to dev first, always)** — All work lands on `dev` and is **deployed to `dev.kai-lab.net` first** for verification. Promotion to production is by **PR `dev` → `main`**; `main` deploys to a **versioned host under `*.ckk.kai-lab.net`** (e.g. `v0-1-0.ckk.kai-lab.net`, from `package.json#version`). Never deploy straight to `main`/production — verify on `dev.kai-lab.net`, then open the PR.

**nextjs-web deploys via Coolify** (all other stacks use the rsync + rebuild flow below). Coolify (`~/stacks/coolify`, UI/API `http://192.168.50.15:8000`) builds the app from GitHub per branch — see `docker-compose/coolify/README.md` for full topology, bootstrap, and webhook setup:

| App | Branch | Host port | Public host |
|-----|--------|-----------|-------------|
| `nextjs-web-dev` | `dev` | `:3004` | `dev.kai-lab.net` |
| `nextjs-web-main` | `main` | `:3005` | `v{X-Y-Z}.ckk.kai-lab.net` |

- Deploy: `docker-compose/coolify/deploy.sh dev` (or `main`) after pushing; GitHub push auto-deploy activates once Coolify is exposed via the tunnel (see README).
- **Rollback (main)**: Coolify UI → nextjs-web-main → Deployments → redeploy a previous build, or `deploy.sh main <git-sha>`. Deployment images are kept, so rollback is fast.
- Ingress is decoupled from deploys: cloudflared/nginx target the stable socat relays `web:3000` (→ `:3004`) and `web-main:3000` (→ `:3005`) in the `nextjs-web` stack, so routing never changes on redeploys/rollbacks.
- Coolify apps run on the external `coolify` docker network; `shared-db`, `po-extract`, `gotenberg`, `seaweedfs` are attached to it so `DATABASE_URL`/`GOTENBERG_URL`/`SEAWEED_FILER_URL`/`PO_EXTRACT_URL` resolve by container name. App env vars are managed in Coolify (not compose).
- Both apps currently share the one business DB (`shared-db`/`ckk`); split a prod DB before real production traffic.

**Server** — `192.168.50.15` (hostname `docker-mac-pro`; despite the name it runs Linux — Ubuntu noble / t2 kernel). Access: `ssh 192.168.50.15` (key-based, user `kaiseisawada`). All services run as Docker Compose stacks orchestrated by **Dockge**, one dir per stack under `~/stacks/` on the server: `nextjs-web`, `coolify`, `shared-db`, `prisma-studio`, `metabase`, `ai-stack`, `monitoring`, `vpn-ldap`, `kot-import`, `admintools`, `nginx-proxy`, `cloudflared`, `portainer`.

**Source ↔ server** — Each `~/stacks/<stack>` mirrors `docker-compose/<stack>` in this repo, but the **server copies are not git repos** and there is no deploy script/CI. Deploy = rsync the source up, then rebuild. The server's `.env` holds secrets and lives **only on the server** — never overwrite or delete it (always `--exclude '.env'`).

**Secrets (never commit)** — The **Cloudflare DNS API token** (acme.sh DNS-01 for `nginx-proxy`; `Zone:DNS:Edit` on `kai-lab.net` + `ckk-tool.co.jp`) has its operational copy in the server's `~/stacks/nginx-proxy/.env` (`CLOUDFLARE_DNS_API_TOKEN`). A local backup lives in this Mac's login Keychain — retrieve with `security find-generic-password -s ckk-cloudflare-dns-api-token -w`. The **Cloudflare Tunnel API token** (account-scoped, `Cloudflare Tunnel:Edit` — used to manage the tunnel's public-hostname ingress rules via API, e.g. adding `deploy.ckk-tool.co.jp`) lives only in the Keychain: `security find-generic-password -s ckk-cloudflare-tunnel-api-token -w`. Tunnel config API: `PUT /accounts/f3ed926bb74cda704944f32bea936b5e/cfd_tunnel/3c8475a0-8285-4f44-a8d2-b1e0efb50c5b/configurations` (GET first, edit the `ingress` array, PUT back whole). If either token is exposed, rotate it in Cloudflare and update its storage place(s).

**Deploy a non-Coolify stack** (example: `ai-stack`):

```bash
# from repo: docker-compose/ai-stack/
rsync -a --exclude node_modules --exclude .next --exclude .git \
  --exclude .env --exclude .vscode --exclude '*.tsbuildinfo' --exclude .DS_Store \
  ./ 192.168.50.15:'~/stacks/ai-stack/'
ssh 192.168.50.15 'cd ~/stacks/ai-stack && docker compose up -d --build'
```

Dry-run the rsync first (`rsync -avn …`) to confirm the file set. The nextjs-web Dockerfile builds Next.js `output: "standalone"`; PDF templates under `src/pdf-templates/` reach the runtime image via `outputFileTracingIncludes` in `next.config.ts` (file tracing can't follow `fs.readFile` paths). `pnpm install --frozen-lockfile` runs in-build, so never let the lockfile drift.

**nextjs-web topology** — the app containers are Coolify-managed (dev `:3004`, main `:3005`, container `:3000`; host `:3000` is taken by open-webui). Public access `https://dev.kai-lab.net` via the `cloudflared` stack; LAN TLS via `nginx-proxy`; both reach the app over the `nextjs-web_default` network at `http://web:3000` / `http://web-main:3000` (socat relays in the `nextjs-web` stack, which also keeps `gotenberg` and `seaweedfs`). PDF generation uses `http://gotenberg:3000` (`GOTENBERG_URL`); generated PDFs persist in the `seaweedfs` filer (`SEAWEED_FILER_URL=http://seaweedfs:8888`).

**Cross-stack services** — the `ai-stack` runs `ollama` (`:11434`, local models) and `po-extract` (`:8000`, the document→JSON extractor, model `qwen2.5vl`); `metabase` (`:3003`, OSS, postgres app DB) holds the BI dashboards. Cross-stack reachability is by attaching a service to the other stack's external network — the Coolify-built nextjs-web reaches `shared-db`, `po-extract`, `gotenberg`, `seaweedfs` because those are attached to the `coolify` network; nothing is reachable cross-stack by default.

**Manage / verify** — `docker ps`, `docker compose logs -f <svc>`, `docker compose restart <svc>`, `docker compose up -d --build` (rebuild after source change). Health/smoke-test from inside the network, e.g. `docker run --rm --network nextjs-web_default curlimages/curl -sf http://web:3000/`. Postgres-backed stacks (`shared-db`, `metabase-db`, `ckk-legacy-db`) are siblings — back up with `docker exec <db> pg_dump` and restore with `pg_restore`/`psql` before mutating live data.
