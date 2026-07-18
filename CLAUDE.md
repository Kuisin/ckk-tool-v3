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

**System settings & app config** — The **システム設定** app (op code `SY01`, `/settings`, category システム) is a hub with two sections: **アプリ設定** (per-app configurable logic, registry in `lib/settings-apps.ts`) and **システム管理** (links to `/admin/apps` app on/off, 通知設定, ファイル管理, 操作履歴). All configurable app logic persists to the ONE generic table `app.system_settings` (key→JSON KV) via `lib/app-config.ts` (`readConfigNamespace` / `writeConfigValues`) — no schema change per new setting. The **試算計算** app (op code `SY02`, `/settings/trial-pricing-engine`, dedicated システム app, `system` permission; typed adapter `lib/system-settings.ts`) configures 試算 pricing: material-price policy, default coefficients, **admin-defined criteria**, **custom inputs**, and a post-processor JS hook. The engine (`lib/trial-pricing-engine.ts`) computes 見積単価 as the sum of an ordered **criteria** list — each a JS **expression** over the simulation-input variables (+ custom inputs, `quantity`, `subtotal`, `r.<id>`, and curated `round()`/lookup helpers), evaluated per lot in the isomorphic sandbox (`lib/trial-pricing-script.ts` `compileSandboxed`; dangerous globals shadowed). `DEFAULT_CRITERIA` (`lib/trial-pricing-criteria.ts`) reproduce the legacy formula 1:1 (kept as `calcTrialPricingLegacy`, the parity-test oracle); reference matrices stay data in `lib/trial-pricing-data.ts`. `calcTrialPricing(input, opts)` + `TrialResult` are unchanged, so all call sites/views are untouched; the custom-script hook still runs as a post-processor after the engine. Settings thread through every call site via `toTrialPricingOptions(settings)`. **Price at point:** create/confirm snapshot the computed result into `estimate.result`; list/detail render that snapshot (fallback: recompute), so changing criteria never re-prices historical estimates. Old `/settings/apps/trial-estimate` redirects to SY02. Env-scoped app on/off flags remain in `feature_flags` (`/admin/apps`).

**Numbering** — `lib/numbering.ts` handles all document numbers with monthly-reset sequences (`numbering_sequences` table). Formats: `QOT-YYYYMM-NNNNN`, `ORD-YYYYMM-NNNNN`, `PO-YYYYMM-NNNNN` (素材発注書), `DRN-YYYYMM-NNNNN`, `INV-YYYYMM-NNNNN`. Work order / lot numbers are global serial integers.

**File storage** — SeaweedFS via S3 API. All uploaded/generated files stored as `files` table rows (`storage_key`, `filename`, `mime_type`).

**Design** — Mantine v9 with `primaryColor: 'blue'`, `defaultRadius: 'sm'`, global `size: 'sm'` defaults. Page patterns: list → `DataTable` + filter bar in `Paper`; detail → summary grid + `Tabs`; form → `Paper` sections + `@mantine/form` with `zodResolver` + Server Actions. See `_specs/design.md` for full component specs and status-badge color map.

## Deployment & Remote Server

**Branch → environment (deploy to dev first, always)** — All work lands on `dev` and is **deployed to `ckk-dev.kai-lab.net` first** for verification. **Feature-branch PRs always target `dev` — never open a PR against `main`.** Promotion to production is by **PR `dev` → `main`**; `main` deploys to **`ckk.kai-lab.net`**. Never deploy straight to `main`/production — verify on `ckk-dev.kai-lab.net`, then open the PR.

**nextjs-web deploys via Coolify** (all other stacks use the rsync + rebuild flow below). Coolify (`~/stacks/coolify`, dashboard `https://deploy.ckk-tool.co.jp`, LAN fallback `http://192.168.50.15:8000`) builds the app from GitHub per branch — see `docker-compose/coolify/README.md` for full topology, bootstrap, and webhook setup:

| App | Branch | Host port | Public host |
|-----|--------|-----------|-------------|
| `nextjs-web-dev` | `dev` | `:3004` | `ckk-dev.kai-lab.net` (legacy alias: `dev.kai-lab.net`) |
| `nextjs-web-main` | `main` | `:3005` | `ckk.kai-lab.net` |

- Deploy: `docker-compose/coolify/deploy.sh dev` (or `main`) after pushing; GitHub push auto-deploy activates once Coolify is exposed via the tunnel (see README).
- **Rollback (main)**: Coolify UI → nextjs-web-main → Deployments → redeploy a previous build, or `deploy.sh main <git-sha>`. Deployment images are kept, so rollback is fast.
- Ingress is decoupled from deploys: cloudflared/nginx target the stable socat relays `web:3000` (→ `:3004`) and `web-main:3000` (→ `:3005`) in the `nextjs-web` stack, so routing never changes on redeploys/rollbacks.
- Coolify apps run on the external `coolify` docker network; `shared-db`, `po-extract`, `gotenberg`, `seaweedfs` are attached to it so `DATABASE_URL`/`GOTENBERG_URL`/`SEAWEED_FILER_URL`/`PO_EXTRACT_URL` resolve by container name. App env vars are managed in Coolify (not compose).
- Both apps currently share the one business DB (`shared-db`/`ckk`); split a prod DB before real production traffic.

**Database migrations (shared-db)** — Schema source of truth is `shared-db/prisma/schema/` (one `.prisma` per PG schema); migrations are owned by `shared-db` and NEVER run from nextjs-web. Authoring flow (from `shared-db/`): edit schema → `pnpm validate` → `pnpm migrate:dev -- --name <change>` → `pnpm generate` → sync consumer copies (`cd docker-compose/nextjs-web && pnpm db:sync-schema && pnpm db:generate`; same for `docker-compose/prisma-studio`).

**Applying to the dev DB** after a merge to `dev` (all idempotent). Note: the dev DB has **no published host port** — it is only reachable inside Docker on the server, so a workstation cannot hit `192.168.50.15:15432` directly. From **this Mac** (has `ssh 192.168.50.15` + the repo + `shared-db/.env`), use the `:remote` scripts — they open an SSH tunnel to the `shared-db` container (`scripts/remote-db.sh`) and run the same command against it:

```bash
cd shared-db
pnpm migrate:status:remote     # inspect pending migrations first
pnpm migrate:deploy:remote     # 1. apply pending migrations (real prisma migrate deploy)
pnpm grants:remote             # 2. re-grant (needed whenever tables/roles were added)
pnpm import:legacy:remote      # 3. legacy data (BP/材種/製品) — ALWAYS after a reset/re-provision
```

`scripts/remote-db.sh <cmd>` is the general form (tunnel + DATABASE_URL rewrite, e.g. `pnpm remote psql "$DATABASE_URL" -c '\\dt app.*'`). Overrides: `DB_SSH_HOST`, `DB_CONTAINER`, `DB_TUNNEL_PORT`. If the host port is ever republished on the LAN, the plain `pnpm migrate:deploy` / `sh -c '. ./.env; psql "$DATABASE_URL" …'` forms work again from a LAN machine.

Step 3 applies the committed `data-migration/imports/*.sql.gz` (idempotent upserts generated from the FileMaker migration). There is no demo seed — master/BP data comes from this import. Regenerate artifacts with `data-migration/make_imports.sh` (needs `mapped.sqlite`).

Skipping `grants.sql` after adding tables makes the app 500 on those tables (role `app` has no rights). **From a cloud Claude session** (sandbox has no LAN route — no SSH, no 192.168.50.x): run the same steps through Claude Code Remote in the Mac bridge environment (`kaisei-mac-studio:ckk-tool-v3`) — `create_trigger` with `create_new_session_on_fire: true` + that `environment_id`, then `fire_trigger`; have the session post its result as a PR comment and subscribe to the PR to receive it.

**Server** — `192.168.50.15` (hostname `docker-mac-pro`; despite the name it runs Linux — Ubuntu noble / t2 kernel). Access: `ssh 192.168.50.15` (key-based, user `kaiseisawada`). All services run as Docker Compose stacks orchestrated by **Dockge**, one dir per stack under `~/stacks/` on the server: `nextjs-web`, `coolify`, `shared-db`, `prisma-studio`, `metabase`, `ai-stack`, `monitoring`, `vpn-ldap`, `kot-import`, `admintools`, `nginx-proxy`, `cloudflared`, `portainer`.

**Source ↔ server** — Each `~/stacks/<stack>` mirrors `docker-compose/<stack>` in this repo, but the **server copies are not git repos** and there is no deploy script/CI. Deploy = rsync the source up, then rebuild. The server's `.env` holds secrets and lives **only on the server** — never overwrite or delete it (always `--exclude '.env'`).

**Secrets (never commit)** — The **Cloudflare DNS API token** (acme.sh DNS-01 for `nginx-proxy`; `Zone:DNS:Edit` on `kai-lab.net` + `ckk-tool.co.jp`) has its operational copy in the server's `~/stacks/nginx-proxy/.env` (`CLOUDFLARE_DNS_API_TOKEN`). A local backup lives in this Mac's login Keychain — retrieve with `security find-generic-password -s ckk-cloudflare-dns-api-token -w`. The **Cloudflare Tunnel API token** (account-scoped, `Cloudflare Tunnel:Edit` — used to manage the tunnel's public-hostname ingress rules via API, e.g. adding `deploy.ckk-tool.co.jp`) lives only in the Keychain: `security find-generic-password -s ckk-cloudflare-tunnel-api-token -w`. Tunnel config API: `PUT /accounts/f3ed926bb74cda704944f32bea936b5e/cfd_tunnel/3c8475a0-8285-4f44-a8d2-b1e0efb50c5b/configurations` (GET first, edit the `ingress` array, PUT back whole). If either token is exposed, rotate it in Cloudflare and update its storage place(s).

**Deploy a non-Coolify stack** — use `docker-compose/deploy-stack.sh <stack>`. It
rsyncs `docker-compose/<stack>/` up to `~/stacks/<stack>/` (always excluding the
server-only `.env`; no `--delete`, so server-only files/certs/data survive) and runs
`docker compose up -d --build`. This covers **every stack except the Coolify-built
apps** (the nextjs-web app + admintools, which deploy via `coolify/deploy.sh`).

```bash
cd docker-compose
./deploy-stack.sh                    # list deployable stacks
./deploy-stack.sh ai-stack --dry-run # preview the rsync file set (do this first)
./deploy-stack.sh ai-stack           # rsync + rebuild
# server host override: DEPLOY_HOST=<ip> ./deploy-stack.sh <stack>
```

Always `--dry-run` first to confirm the file set. The nextjs-web Dockerfile builds Next.js `output: "standalone"`; PDF templates under `src/pdf-templates/` reach the runtime image via `outputFileTracingIncludes` in `next.config.ts` (file tracing can't follow `fs.readFile` paths). `pnpm install --frozen-lockfile` runs in-build, so never let the lockfile drift.

**nextjs-web topology** — the app containers are Coolify-managed (dev `:3004`, main `:3005`, container `:3000`; host `:3000` is taken by open-webui). Public access `https://ckk-dev.kai-lab.net` (dev) / `https://ckk.kai-lab.net` (main) via the `cloudflared` stack; LAN TLS via `nginx-proxy` (same hostnames, shared `ckk.kai-lab.net` SAN cert); both reach the apps over the `nextjs-web_default` network at `http://web:3000` (dev) / `http://web-main:3000` (main) — socat relays in the `nextjs-web` stack, which also keeps `gotenberg` and `seaweedfs`. PDF generation uses `http://gotenberg:3000` (`GOTENBERG_URL`); generated PDFs persist in the `seaweedfs` filer (`SEAWEED_FILER_URL=http://seaweedfs:8888`).

**Cross-stack services** — the `ai-stack` runs `ollama` (`:11434`, local models) and `po-extract` (`:8000`, the document→JSON extractor, model `qwen2.5vl`); `metabase` (`:3003`, OSS, postgres app DB) holds the BI dashboards. Cross-stack reachability is by attaching a service to the other stack's external network — the Coolify-built nextjs-web reaches `shared-db`, `po-extract`, `gotenberg`, `seaweedfs` because those are attached to the `coolify` network; nothing is reachable cross-stack by default.

**Manage / verify** — `docker ps`, `docker compose logs -f <svc>`, `docker compose restart <svc>`, `docker compose up -d --build` (rebuild after source change). Health/smoke-test from inside the network, e.g. `docker run --rm --network nextjs-web_default curlimages/curl -sf http://web:3000/`. Postgres-backed stacks (`shared-db`, `metabase-db`, `ckk-legacy-db`) are siblings — back up with `docker exec <db> pg_dump` and restore with `pg_restore`/`psql` before mutating live data.

**Backups** — `shared-db` is continuously backed up by the `db-backup` stack (PG17 incremental base backups; hourly kept 72h, daily kept 14 days, monthly kept 12, under `/data/db-backups` on the server). Restore runbook, monitoring, and the one-time live-cluster setup: `docker-compose/db-backup/README.md`. `pg_dump` remains the ad-hoc pre-mutation tool and the only method for `metabase-db`/`ckk-legacy-db`.
