# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
Always commit per feature and record change.

## Git workflow (required)

**Always create a new feature branch _before_ starting any feature or change —
never begin work on `dev` or `main`.** Branch first (`git checkout -b <name>`
off up-to-date `dev`), do the work there, and **open a PR against `dev` once the
work is done**. Never commit straight to `dev` or `main`.

**You may merge PRs into `dev`, but NEVER merge to `main`** — production promotion
(`dev`→`main`) is the user's and is done only by them. So: branch first → work →
PR → merge to `dev` = allowed; merging to `main` = not allowed (prepare the
promotion PR and leave it for the user).

**Promotion merge method (required)** — the `dev`→`main` promotion PR must be
merged with **"Create a merge commit"**, never squash/rebase. A squash promotion
creates a `main`-only commit, so `dev` and `main` histories diverge and **every
later promotion PR conflicts** on files touched since (this happened with
`docs-tree.ts`). If histories have already diverged (`git merge-base
--is-ancestor origin/main origin/dev` fails), first land a sync PR into `dev`
that merges `origin/main` back in (resolve conflicts in favor of `dev` unless
`main` has content `dev` lacks), then promote. CI enforces both rules on PRs to
`main` via `.github/workflows/promotion-guard.yml` (head must be `dev`; `dev`
must already contain `main`). A sync/merge PR into `dev` must itself be merged
with a merge commit — squashing it flattens the join and defeats the fix.

**Branch cleanup (required)** — after a PR is merged into `dev`, **delete its
feature branch** (remote: `gh pr merge --delete-branch`, or
`git push origin --delete <branch>`; local: `git branch -d <branch>`). Merged
branches are archived/pruned to keep the branch list clean — never leave merged
feature branches behind, and run `git fetch --prune` so stale remote refs drop
off. Long-lived branches are only `dev` and `main`.

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
# Install — pnpm workspace: ルートで 1 回（lockfile はルートの 1 本。変更禁止）
# workspace = nextjs-web / nextjs-kiosk / packages/*（authz-core 等の共有パッケージ）
pnpm install --frozen-lockfile   # リポジトリルートで実行

# Dev server (Turbopack) — 各アプリディレクトリで実行
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

**Doc intake / OCR** — Customer order PDFs (incl. scans) are imported via email (imapflow), a watched folder, or upload, then extracted to structured JSON by the **self-hosted** `po-extract` API (no external API/keys). po-extract is **Coolify-managed, one instance per environment** — `po-extract-dev` (branch `dev`) and `po-extract-main` (branch `main`), both **internal only** (no host port, no domain; reachable on the `coolify` network via the stable aliases `po-extract-dev` / `po-extract-main`). Source stays at `docker-compose/ai-stack/extractor/`; register with `coolify/add-po-extract-apps.sh`, deploy with `coolify/deploy.sh po-extract-dev|po-extract-main`. The GPU service `ollama` stays in `ai-stack` and is **shared by both environments** (one GPU set). It runs a **3-stage hybrid pipeline** for accuracy: (1) an **OCR** text layer from PaddleOCR's PP-OCR models on **ONNXRuntime** (RapidOCR — PaddlePaddle's native inference SIGSEGVs on this Xeon host, so the same models run via ONNX), (2) a **vision-model** transcription (`qwen2.5vl`), then (3) an **LLM** that cross-checks both readings and emits the schema JSON (+ non-destructive numeric reconciliation). Both model stages default to one resident model so the GPU never swaps mid-request (~48s/doc). Endpoints:
- `POST /extract/<doc_type>` (multipart: `file` + optional `prompt`) — uses a **built-in schema** per type. Types: `order-request` (受注請書 intake — the primary one), `quote`, `invoice`, `delivery-note`, `purchase-order`. Each schema matches the v3 data model.
- `POST /extract` — same, but the caller supplies its own `schema` (JSON Schema string) for ad-hoc shapes.
- `GET /healthz` (status + model + types), `GET /schemas` (the built-in schemas).

Powers the AI-first 受注請書 intake (scan image + auto-filled form → user confirms; on extraction failure, the user enters every field from scratch). Source: `docker-compose/ai-stack/extractor/app.py`.

**Search** — PGroonga extension on PostgreSQL (not a separate service).

**Logging** — App logs via pino → Loki. Row-level audit via `audit_logs` (before_data / after_data JSON). System events (login, PDF generation, CSV export) in `system_logs`. Nginx access logs → Loki via Alloy. Alerts in Grafana.

**i18n** — UI strings via `next-intl` + `messages/` JSON. DB multilingual fields are `{ ja: '', en: '' }` JSON objects — always write both locales.

**Accounting** — `lib/csv-export.ts` produces 弥生会計 Next CSV. Journal logic is isolated in `lib/journal.ts`.

**Data fetching** — React Server Components for server state; Zustand for client-only state.

**System settings & app config** — The システム category has **no hub app** (the former システム設定 hub `SY01` was removed — no other category has one; `/settings` redirects to the home システム section). All システム apps live under `/settings/*`: **ユーザー管理** (`SY01`, `/settings/users` — read-only user directory: list + detail with role assignments and effective permissions from the `user_permissions` view; `lib/users-admin.ts`), 試算計算 `SY02`, 製品項目 `SY03`, 製品種別 `SY04`, **アプリ管理** (`SY05`, `/settings/apps`), **ファイル管理** (`SY06`, `/settings/files` — the「システムファイル」toggle hides **OS/tool leftovers only** (`.DS_Store`, `~$x.xlsx`, `*.tmp`, dot-dirs — `lib/system-files.ts`); business PDFs/attachments are never "system files" and always list), **操作履歴** (`SY07`, `/settings/activity` — `audit_logs` rows carry `kiosk_device_id` when the operation came from a shared tablet, shown as a device-name badge in both SY07 and every 履歴 tab; Web operations have none), **注文書取込** (`SY0C`, `/settings/order-intake` — the 受注請書 intake watched folder (`INTAKE_DIR`) from the browser: drop many order PDFs in at once, see 取込待ち / 取込済 / 失敗, 今すぐスキャン, and push a failed file back to the queue; `lib/intake-folder.ts` + `POST /api/intake/folder` — putting a file there is all it does, the existing poller still does the numbering + extraction. dev only so far: `main` has no `INTAKE_DIR`) — old `/admin/*` paths redirect. Personal settings live under the profile: **プロフィール写真** is uploaded in-app at `/profile` (never pulled from AD): the picker opens a square cropper (`components/ui/ImageCropModal.tsx` — canvas + pointer events, no dependency; drag / slider / wheel / pinch) which writes **two sizes** — 大 512px + 小 96px — so nothing is resized at display time. Both are stored in SeaweedFS as `avatars/{userId}-{large|small}-{epoch ms}.{ext}` (`lib/file-naming.ts` `avatarStorageKey`) + `files` rows, referenced by `app.users.avatar_file_id` / `avatar_thumb_file_id`, served by `/api/avatars/[userId]?v=<fileId>[&size=sm]` (login required; missing thumb falls back to 大). Upload/delete go through `POST`/`DELETE /api/avatars` (never a Server Action — see the app CLAUDE.md), logic in `lib/avatar.ts`, which **enforces square + max px server-side** via the in-house header parser `lib/image-size.ts`. Always render avatars with `components/ui/UserAvatar.tsx` — it is a true circle (`radius={9999}`, not `radius="xl"`) and picks 大/小 by display size (≤48px → 小, so every list/header/history icon loads the 96px file). Photos also appear in the 履歴 timeline (`AuditTimeline` bullet, actor URL from `lib/audit.ts`). **通知設定** is `/profile/notifications` (old `/settings/notifications` redirects), **ホーム画面設定** is `/profile/home` (per-user home customize — favorite apps pinned on top, 標準/カスタム display mode, custom groups; stored in `app.user_home_settings`, logic in `lib/home-settings-core.ts` + `lib/home-settings.ts`), and the avatar menu holds プロフィール / 通知設定 / ホーム画面設定 / ログアウト. All configurable app logic persists to the ONE generic table `app.system_settings` (key→JSON KV) via `lib/app-config.ts` (`readConfigNamespace` / `writeConfigValues`) — no schema change per new setting. The **試算計算** app (op code `SY02`, `/settings/trial-pricing-engine`, dedicated システム app, `system` permission; typed adapter `lib/system-settings.ts`) configures 試算 pricing: material-price policy, default coefficients, **admin-defined criteria**, **custom inputs**, **admin-defined 工具種** (tool types — add/remove from `/settings/trial-pricing-engine/tool-types`; built-in ROUND_BAR/CYLINDER/OH are locked, custom types delete only while unused by estimates; per-type pages also assign which criteria + which final 見積単価 apply, writing the same `toolTypes` membership as the criteria pages; `estimates.tool_type` is varchar, definitions live in `trial_pricing.tool_types`), and admin-defined lookup tables. The SY02 main page **lists** the criteria (reorder/enable/delete/add, persisted immediately via `updateCriteria`); each criterion's fields are edited on its own page (`/settings/trial-pricing-engine/criteria/[id]`, `.../new`). The engine (`lib/trial-pricing-engine.ts`) computes 見積単価 as the sum of an ordered **criteria** list (each criterion scopable per 工具種 via `toolTypes`; empty = all) — each a JS **expression** over the simulation-input variables (+ custom inputs, `quantity`, `subtotal`, `r.<id>`, and curated `round()`/lookup helpers), evaluated per lot in the isomorphic sandbox (`lib/trial-pricing-script.ts` `compileSandboxed`; dangerous globals shadowed). `DEFAULT_CRITERIA` (`lib/trial-pricing-criteria.ts`) reproduce the legacy formula 1:1 (kept as `calcTrialPricingLegacy`, the parity-test oracle); reference matrices stay data in `lib/trial-pricing-data.ts`. `calcTrialPricing(input, opts)` + `TrialResult` are unchanged, so all call sites/views are untouched. (The old free-form custom-script post-processor is **retired** — its settings UI was removed and the engine no longer applies it; `customScriptEnabled`/`customScript` remain in the type only for compatibility, marked `@deprecated`.) Settings thread through every call site via `toTrialPricingOptions(settings)`. **Price at point:** create/confirm snapshot the computed result into `estimate.result`; list/detail render that snapshot (fallback: recompute), so changing criteria never re-prices historical estimates. Old `/settings/apps/trial-estimate` redirects to SY02. Env-scoped app on/off flags remain in `feature_flags` (`/settings/apps`).

**Numbering** — `lib/numbering.ts` handles all document numbers with monthly-reset sequences (`numbering_sequences` table). Formats: `QOT-YYYYMM-NNNNN`, `ORD-YYYYMM-NNNNN`, `PO-YYYYMM-NNNNN` (素材発注書), `DRN-YYYYMM-NNNNN`, `INV-YYYYMM-NNNNN`. Work order / lot numbers are global serial integers.

**File storage** — SeaweedFS via S3 API. All uploaded/generated files stored as `files` table rows (`storage_key`, `filename`, `mime_type`).

**Design** — Mantine v9 with `primaryColor: 'blue'`, `defaultRadius: 'sm'`, global `size: 'sm'` defaults. Page patterns: list → `DataTable` + filter bar in `Paper`; detail → summary grid + `Tabs`; form → `Paper` sections + `@mantine/form` with `zodResolver` + Server Actions. See `_specs/design.md` for full component specs and status-badge color map.

## Deployment & Remote Server

**Branch → environment (deploy to dev first, always)** — All work lands on `dev` and is **deployed to `ckk-dev.kai-lab.net` first** for verification. **Feature-branch PRs always target `dev` — never open a PR against `main`.** Promotion to production is by **PR `dev` → `main`**; `main` deploys to **`ckk.kai-lab.net`**. Never deploy straight to `main`/production — verify on `ckk-dev.kai-lab.net`, then open the PR.

**nextjs-web deploys via Coolify** (all other stacks use the rsync + rebuild flow below). Coolify (`~/stacks/coolify`, dashboard `https://deploy.ckk-tool.co.jp`, LAN fallback `http://192.168.50.15:8000`) builds the app from GitHub per branch — see `docker-compose/coolify/README.md` for full topology, bootstrap, and webhook setup. **pnpm workspace build**: the 4 apps build with `base_directory` = `/` (repo root context, root lockfile + `packages/*`) and `dockerfile_location` = `/docker-compose/nextjs-<app>/Dockerfile`; watch_paths cover the app dir + `packages/**` + root manifests (applied by `setup.sh` / `add-kiosk-apps.sh`):

| App | Branch | Host port | Public host |
|-----|--------|-----------|-------------|
| `nextjs-web-dev` | `dev` | `:3004` | `ckk-dev.kai-lab.net` (legacy alias: `dev.kai-lab.net`) |
| `nextjs-web-main` | `main` | `:3005` | `ckk.kai-lab.net` |
| `nextjs-kiosk-dev` | `dev` | `:3006` | `ckk-kiosk-dev.kai-lab.net` |
| `nextjs-kiosk-main` | `main` | `:3007` | `ckk-kiosk.kai-lab.net` |
| `po-extract-dev` | `dev` | — (internal) | — (alias `po-extract-dev:8000`) |
| `po-extract-main` | `main` | — (internal) | — (alias `po-extract-main:8000`) |

- Deploy: `docker-compose/coolify/deploy.sh dev` (or `main`, `kiosk-dev`, `kiosk-main`) after pushing; GitHub push auto-deploy activates once Coolify is exposed via the tunnel (see README).
- **Rollback (main)**: Coolify UI → nextjs-web-main → Deployments → redeploy a previous build, or `deploy.sh main <git-sha>`. Deployment images are kept, so rollback is fast.
- Ingress is decoupled from deploys: cloudflared/nginx target the stable socat relays `web:3000` (→ `:3004`) and `web-main:3000` (→ `:3005`) in the `nextjs-web` stack, so routing never changes on redeploys/rollbacks.
- Coolify apps run on the external `coolify` docker network; `shared-db`, `gotenberg`, `seaweedfs`, `ollama` are attached to it so `DATABASE_URL`/`GOTENBERG_URL`/`SEAWEED_FILER_URL` resolve by container name. `PO_EXTRACT_URL` points at the per-environment Coolify app (`http://po-extract-dev:8000` / `http://po-extract-main:8000`) — Coolify containers are hash-named, so those names come from `custom_network_aliases`, not the container name. App env vars are managed in Coolify (not compose).
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

**Kiosk (共有端末)** — second Next.js app `docker-compose/nextjs-kiosk` (Coolify dev `:3006` / main `:3007`, hostnames `ckk-kiosk-dev.kai-lab.net` / `ckk-kiosk.kai-lab.net`, relays `kiosk` / `kiosk-main`, dedicated `ckk-kiosk.kai-lab.net` SAN cert in nginx-proxy). Plant-floor shared tablets: employees log in with a QR card + required PIN (scan-only only when the card was used **on that device** within 48h AND the last PIN verification is within 2 weeks — first login on a new device always asks PIN, and PIN is re-asked every 2 weeks regardless of activity; 5 fails → 15-min lock) against `app.kiosk_cards`/`kiosk_sessions` (custom DB-session cookies, not Auth.js; 8h hard + 5-min idle). Device trust = 30-day token; enrollment is profile-first: admin creates a device profile in SY09 (open), the TABLET shows a link code/QR (kiosk_link_requests, 10 min), admin scans/types it in SY09 to link — only onto open (PENDING) profiles — and only LINKED profiles can be activated; リンク解除 reopens a profile (kills token/sessions/attestation key, keeps name/plant/map pin) for re-linking a replaced device. Runs a custom Node server (`src/server.ts`, no standalone) exposing WebSocket `/api/kiosk/ws` for live device presence — kiosk tablets connect with the device cookie; the main app's admin UI connects as a monitor using an HMAC token from the shared `KIOSK_WS_SECRET` env (set in both apps; generated by `coolify/add-kiosk-apps.sh`). `kiosk_devices.name` is a localized `{ ja, en }` JSON (SY09 edits both; kiosk screens resolve ja per the pre-login ja-fixed rule; read it via `lib/format.ts` `deviceName()`, which also accepts pre-migration plain strings). Admin UIs live in nextjs-web: QRカード管理 `SY08` `/settings/kiosk-cards` (issue/assign/print/revoke, PIN reset), 端末管理 `SY09` `/settings/kiosk-devices` (per-plant device list + activation, floor maps `/settings/kiosk-devices/map` with drag-placed pins showing live online status; images in SeaweedFS via `files`). Both gated by permission code `kiosk` (admin-only). The kiosk launcher filters apps by the `user_permissions` view; its app registry (`nextjs-kiosk/src/lib/app-list.ts`) declares apps with an i18n `labelKey` (not a hard-coded label). **工程実行** (`/steps`, permission `work_order`) is the first business app: the operator sees the steps assigned to them (assignment = a `work_order_step_plans` row for their user), and can 開始 / 一時停止 / 再開 / 完了 with 受入数 recorded at start and 産出数 at complete (per the step's `quantity_tracking` mode). **一時停止 is derived, not a status** — `STEP_STATUS` gets no `PAUSED`; pause closes the open `work_order_step_actuals` row and releases `session_locked_by`, so 一時停止中 = `IN_PROGRESS AND session_locked_by IS NULL`, resume re-claims the lock and opens a new actual row (one row per work session ⇒ accumulated work time). This keeps every nextjs-web rule (`isWorkOrderComplete` / `computeWipByStep` / rollback guards / the actual+inspection `IN_PROGRESS` gates) unchanged. The kiosk owns its write path end-to-end (`src/lib/step-execution.ts` + `POST /api/kiosk/steps/[stepId]`, gated by session → `authz.hasPermission('work_order','UPDATE')` → row-level assignment) — it deliberately does **not** call any nextjs-web internal API. Twin pure-TS modules shared by copy between the two apps (`qr.ts` QR encoder, `crockford.ts`, `ws-auth.ts`/`kiosk-ws-token.ts`) — update both when changing. Additionally, `workflow-core.ts`, `workflow-core.test.ts`, **`inventory.ts`** and **`inspection-core.ts`** (+ its test — 検査項目の型別自動合否・抜取サンプル数の判定規則) are **byte-identical copies** of the nextjs-web originals (the kiosk completes the final step, which posts inventory, and records inspections): re-copy with `pnpm twin:sync` and review both sides — `src/lib/twin-files.test.ts` fails the build on any drift. **Device attestation**: the Android wrapper `android-kiosk/` (Kotlin WebView, built in Android Studio — no SDK on this Mac) injects `window.KioskDevice` backed by a hardware Keystore P-256 key; the login page runs challenge→sign→`/api/kiosk/attest`, the key TOFU-binds to the device row (`device_public_key`/`fingerprint`, shown in SY09 with a 鍵リセット action), and with env `KIOSK_ATTESTATION=required` login APIs + WS demand the resulting 12h attest cookie — plain browsers are blocked.

**Cross-stack services** — the `ai-stack` runs `ollama` (`:11434`, local models — attached to the `coolify` network so the per-environment `po-extract` apps can reach it; **shared by dev and main** because there is one GPU set); `metabase` (`:3003`, OSS, postgres app DB) holds the BI dashboards. Cross-stack reachability is by attaching a service to the other stack's external network — the Coolify-built nextjs-web reaches `shared-db`, `gotenberg`, `seaweedfs` because those are attached to the `coolify` network (and `po-extract-dev`/`-main` because they are Coolify apps on it); nothing is reachable cross-stack by default.

**Manage / verify** — `docker ps`, `docker compose logs -f <svc>`, `docker compose restart <svc>`, `docker compose up -d --build` (rebuild after source change). Health/smoke-test from inside the network, e.g. `docker run --rm --network nextjs-web_default curlimages/curl -sf http://web:3000/`. Postgres-backed stacks (`shared-db`, `metabase-db`, `ckk-legacy-db`) are siblings — back up with `docker exec <db> pg_dump` and restore with `pg_restore`/`psql` before mutating live data.

**Backups** — `shared-db` is continuously backed up by the `db-backup` stack (PG17 incremental base backups; hourly kept 72h, daily kept 14 days, monthly kept 12, under `/data/db-backups` on the server). Restore runbook, monitoring, and the one-time live-cluster setup: `docker-compose/db-backup/README.md`. `pg_dump` remains the ad-hoc pre-mutation tool and the only method for `metabase-db`/`ckk-legacy-db`.
