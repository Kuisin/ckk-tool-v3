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
`docs-tree.ts`).

**`git merge-base --is-ancestor origin/main origin/dev` failing is NORMAL — do
not open a sync PR for it.** Each promotion leaves a merge commit that exists
only on `main`, so `dev` legitimately "does not contain" `main` right after every
promotion. `promotion-guard.yml` knows this: it first tries `is-ancestor`, and if
that fails it runs `git merge-tree` to test whether the merge would *actually*
conflict. Only a real conflict fails the check. (Two needless sync PRs were
opened against this misreading — the guidance here was stale, not the guard.)

A sync PR into `dev` is only needed when the guard reports a **real conflict**
(`merge-tree` exit 1) — i.e. content genuinely diverged, usually from a squashed
promotion. Then merge `origin/main` into `dev` (resolve in favour of `dev` unless
`main` has content `dev` lacks), and merge that PR **with a merge commit** —
squashing it flattens the join and defeats the fix.

CI enforces both rules on PRs to `main` via
`.github/workflows/promotion-guard.yml` (head must be `dev`; the merge must not
conflict).

**Branch cleanup — the remote side is automatic.** `.github/workflows/branch-archive.yml`
runs on every merged PR: it tags the head branch as **`refs/tags/archive/<branch>`**
and then deletes the branch. Restore one with
`git push origin refs/tags/archive/<name>:refs/heads/<name>`. Long-lived branches
are only `dev`, `main` and `gh-pages`, and the workflow skips them by name —
**do not** turn on GitHub's *Automatically delete head branches* setting instead:
this repo is private on a plan without branch protection / rulesets (the API
returns 403), so that setting would delete `dev` the moment a `dev`→`main`
promotion PR is merged.

Locally you still prune yourself: `git fetch --prune`, then
`git branch -d <branch>` (or `git branch -vv | grep ': gone]'` to find them all).

## Project Overview

Manufacturing Company Business Management System — a Next.js fullstack monolith covering sales, purchasing, production, shipping, billing, and master data. Specs live in `_specs/`; implementation follows those documents.

## Specs

@_specs/structure.md
@_specs/techstack.md
@_specs/tables.md
@_specs/feature.md
@_specs/design.md
@_specs/i18n-glossary.md

## Commands

```bash
# Install — pnpm workspace: ルートで 1 回（lockfile はルートの 1 本）
# 依存を足すときは相談してから `pnpm add` をルートで実行し、lockfile を必ずコミット
#   （方針は coolify/apps/nextjs-web/CLAUDE.md「依存ライブラリ」）
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

**RBAC** — Always query the `user_permissions` view (not the raw relation tables). It aggregates roles → permissions per user and returns only the highest `SCOPE` per `(user_id, action, permission_code)`. Roles and grants are owned by two idempotent seeds — `shared-db/sql/rbac-seed.sql` (the 18 permission codes + `admin`/`staff`) and `roles-seed.sql` (the 15 operational roles) — **not** by the app. `system` and `kiosk` are admin-only and deliberately excluded from every business role; a new app needing a new code must add it to `rbac-seed.sql` and to the roles that should have it. Two derived references are regenerated, never hand-edited: `_docs/rbac-role-matrix.xlsx` (`tools/rbac-matrix/build_rbac_xlsx.py`, reads the live DB + `app-list.ts`) and the DC02 internal doc「ロールと権限」(`content/internal/rbac/`). Launcher visibility is a separate axis — `feature_flags` (`feature-flags-seed.sql`) decides what is published on `main`, so a grant never publishes an app.

**Auth** — Auth.js v5, DB session + short JWT. Identity sourced from Samba AD via LDAP/OAuth. **SSO only completes on the LAN/VPN**, and that is a property of the network, not a bug: the app is public (`app.ckk-tool.co.jp` via cloudflared) but the IdP is not. `AUTH_AUTHENTIK_ISSUER` is `http://auth.ckk-tools.loc:9000/...`, a **separate server** reached over the VPN — on this host the name exists only as a `vpn-ldap` network alias (socat → `21.10.10.10:9000`), so the server's own resolver cannot resolve it and neither can an off-network browser. The server-to-server token exchange works from any network (container-to-container), but the **browser** legs (`/api/sso` → authorize → the Authentik flow UI) need the client to be on the LAN or VPN; off-network they hang on Authentik's loading screen. Publishing the IdP (e.g. `auth.ckk-tool.co.jp` on the tunnel) is what would change that — deliberately not done. A local `authentik` stack used to exist here; it was unused and was stopped and **removed from the repo** on 2026-08-25 (the server volume is kept).

**Realtime** — SSE via Next.js Route Handlers. Pub/Sub and presence through Valkey (keys + TTL).

**PDF** — HTML + vanilla CSS templates sent to Gotenberg (`app/api/pdf/`). No headless browser. Generated PDFs are stored in SeaweedFS and referenced via the `files` table.

**Jobs** — BullMQ backed by Valkey. AD → PostgreSQL employee sync runs as a repeatable job. Monthly billing closing also runs as a BullMQ job.

**Doc intake / OCR** — Customer order PDFs (incl. scans) are imported via email (imapflow), a watched folder, or upload, then extracted to structured JSON by the `po-extract` API. **Which model runs is configurable at runtime** — SY0E (below) picks between the local ollama (the default) and OpenAI-compatible / Anthropic / Google Gemini; nothing changes until an admin configures one, and the **OCR stage is always local**. po-extract is **Coolify-managed, one instance per environment** — `po-extract-dev` (branch `dev`) and `po-extract-main` (branch `main`), both **internal only** (no host port, no domain; reachable on the `coolify` network via the stable aliases `po-extract-dev` / `po-extract-main`). Source stays at `coolify/apps/po-extract/`; register with `coolify/platform/add-po-extract-apps.sh`, deploy with `coolify/platform/deploy.sh po-extract-dev|po-extract-main`. The GPU service `ollama` stays in `ai-stack` and is **shared by both environments** (one GPU set). It runs a **3-stage hybrid pipeline** for accuracy: (1) an **OCR** text layer from PaddleOCR's PP-OCR models on **ONNXRuntime** (RapidOCR — PaddlePaddle's native inference SIGSEGVs on this Xeon host, so the same models run via ONNX), (2) a **vision-model** transcription (`qwen2.5vl`), then (3) an **LLM** that cross-checks both readings and emits the schema JSON (+ non-destructive numeric reconciliation). Both model stages default to one resident model so the GPU never swaps mid-request (~48s/doc). Endpoints:
- `POST /extract/<doc_type>` (multipart: `file` + optional `prompt`) — uses a **built-in schema** per type. Types: `order-request` (注文請書 intake — the primary one), `quote`, `invoice`, `delivery-note`, `purchase-order`. Each schema matches the v3 data model.
- `POST /extract` — same, but the caller supplies its own `schema` (JSON Schema string) for ad-hoc shapes.
- `GET /healthz` (status + model + types + tasks), `GET /schemas` (the built-in schemas).

It also exposes a **paper-free** side for in-app AI tools — no OCR, no vision, one LLM call (seconds, not minutes), JSON body `{ input, prompt? }`:
- `POST /generate/<task>` — built-in task schema + prompt. Tasks: `keywords` (製品・素材マスタのキーワード候補 — MS04 / MS06 の「AI で候補を出す」). `GET /tasks` lists them.
- `POST /generate` — caller supplies `prompt` + `schema` for one-off shapes.
- App side goes through `lib/po-extract.ts` (`generateJson`), never `fetch` directly; a new tool = one entry in `TASK_SCHEMAS`/`TASK_PROMPTS` + one route handler (see `/api/ai/keywords`).

**Model backend is pluggable** (`_chat()` in `app.py` — the single outbound LLM call). The connection is pushed **per request** by nextjs-web as the header `X-AI-Config` (base64url JSON: provider / baseUrl / models / apiKey). **Not a body field** — `/generate/{task}` treats every non-`prompt` body key as model input when `input` is omitted, so a token there would be sent straight into the prompt. No header = the env defaults = the old behaviour, byte for byte. A non-ollama provider with a missing token or model **fails loudly** (`ai_not_configured`) rather than falling back to local. Schema dialects are normalised per provider (Gemini takes no unions and no `additionalProperties`; Anthropic prefers `anyOf`; the existing `OBJ()` is already OpenAI-strict-conformant), and Anthropic is never sent `temperature` (newer models reject it with a 400). Failures come back as HTTP 502 with `detail = "ai_<kind>: …"`, which `lib/intake-extract-error.ts` maps to a cause + a next step — and marks key/model mistakes **non-retryable** so they don't burn the 3-attempt intake budget. `POST /probe` runs one struct + one vision call for the 接続テスト button.

Powers the AI-first 注文請書 intake (scan image + auto-filled form → user confirms; on extraction failure, the user enters every field from scratch). Source: `coolify/apps/po-extract/app.py`.

**Search** — PGroonga extension on PostgreSQL (not a separate service).

**Logging** — App logs via pino → Loki. Row-level audit via `audit_logs` (before_data / after_data JSON). **Authentication events (both apps, success *and* failure) go to `app.login_attempts`** — `audit_logs` presumes an actor and a failed login is exactly the case where the actor is unresolved. Read it in SY0D (`/settings/login-history`). `system_logs` from `_specs/tables.md` was never built; `login_attempts` implements its LOGIN half, so anything else (PDF generation, CSV export) is still unlogged — don't double-record auth if you add it. Nginx access logs → Loki via Alloy. Alerts in Grafana.

**Device identity & ownership** — Every auth event carries the source IP, UA, and a **device signature**: an in-house, dependency-free fingerprint of browser characteristics (`lib/device-signals-core.ts`, a web⇄kiosk twin). Only *stable* signals feed the hash — UA version, window size and clock skew are recorded but excluded, or a second monitor would make every login look like a new device. **The server always recomputes the hash**; a client-supplied one is a self-asserted ID (replay a known device to look familiar, or randomise to defeat correlation). It is a **correlation key, never an authentication factor**. Signals reach the server through one HMAC-signed `ckk_dev` cookie (`SameSite=Lax`) so they survive the SSO round-trip; `/api/device-signals` must stay excluded from the `proxy.ts` matcher or the unauthenticated POST 307s and the feature dies silently. Ownership (社用/私用) is **auto-detected only** and always carries the strength of its evidence (`lib/device-ownership-core.ts`): a signed Android-wrapper profile is PROVEN, a corporate-CIDR match is CIRCUMSTANTIAL — "on the office network" is **not** "company-issued", and no browser API can prove ownership. `ownership` is display + alerting only and **never gates access**. Env: `LOGIN_ATTEMPT_PEPPER` (identical in both apps or the HMAC correlation keys don't line up), `CORPORATE_CIDRS`, `TRUSTED_PROXY_HOPS` (0 = right-most XFF entry; **never trust the left-most**), web-only `DEVICE_SIGNALS_SECRET`. All of them degrade rather than crash when unset.

**i18n** — UI strings via `next-intl` + `messages/` JSON (ja/en/zh; **ja is the source**). **`_specs/i18n-glossary.md` is the single source of truth for both the translation rules (§2) and every term's ja/en/zh wording (§3) — read it before writing, adding, or changing ANY user-facing string, in either app.** Never invent a second rendering of a term that is already in the table; if a needed word is missing, add the row there first (and put judgement calls in §5 rather than guessing). It governs `nextjs-web/messages/*.json` and `nextjs-kiosk/src/lib/i18n/messages/*` alike — shared vocabulary (statuses, steps, quantities) must match across the two apps. **Data is out of scope** — master names, partner names, role names and other DB-held strings are not translated by the glossary. DB multilingual fields are `{ ja: '', en: '' }` today; the decided shape is a **variable-key JSON keyed by locale, edited in one modal** (never one input per language), so a language can be added without touching every form — decided, not yet built (glossary §2.10). **Documents sent to a partner (見積書 / 納品書 / 請求書) are rendered in the recipient's language**, falling back to the default (ja) — never the viewer's setting.

**Accounting** — `lib/csv-export.ts` produces 弥生会計 Next CSV. Journal logic is isolated in `lib/journal.ts`.

**Data fetching** — React Server Components for server state; Zustand for client-only state.

**System settings & app config** — The システム category has **no hub app** (the former システム設定 hub `SY01` was removed — no other category has one; `/settings` redirects to the home システム section). All システム apps live under `/settings/*`: **ユーザー管理** (`SY01`, `/settings/users` — read-only user directory: list + detail with role assignments and effective permissions from the `user_permissions` view; `lib/users-admin.ts`), 価格試算計算 `SY02`, 製品項目 `SY03`, 製品種別 `SY04`, **アプリ管理** (`SY05`, `/settings/apps`), **ファイル管理** (`SY06`, `/settings/files` — the「システムファイル」toggle hides **OS/tool leftovers only** (`.DS_Store`, `~$x.xlsx`, `*.tmp`, dot-dirs — `lib/system-files.ts`); business PDFs/attachments are never "system files" and always list), **操作履歴** (`SY07`, `/settings/activity` — `audit_logs` rows carry `kiosk_device_id` when the operation came from a shared tablet, shown as a device-name badge in both SY07 and every 履歴 tab; Web operations have none), **AI プロバイダ** (`SY0E`, `/settings/ai-provider` — the model backend for document extraction and the paper-free AI tools: provider / base URL / vision + struct model / API token, applied to **every** AI call. Default is the local ollama, so nothing changes until it is set. The token is **AES-256-GCM encrypted** in `system_settings` (`lib/secret-box.ts`) under **`SETTINGS_ENCRYPTION_KEY`** — a general-purpose settings key, not an AI-specific one, so the next secret reuses it. The envelope carries a `kid` (key fingerprint) so "the key was rotated" is distinguishable from "the ciphertext is corrupt" without attempting decryption, and a plaintext `last4` so the UI can render `●●●●●●ab3x` even with no key. **Saving is refused when the key is unset** — deliberately unlike the `DEVICE_SIGNALS_SECRET` "degrade when unset" precedent, because degrading here means either plaintext storage or borrowing `AUTH_SECRET`. The plaintext token is reachable from exactly one function (`aiConfigHeaders()`), so it cannot reach a form or `audit_logs`; audit rows record only `****last4`), **通知メール** (`SY0F`, `/settings/notification-email` — 通知を**メールで**送るときのまとめ方。既定は Microsoft Teams の「不在時のアクティビティ」と同じで、**見逃した（猶予を過ぎても未読の）通知だけを、間隔をあけて 1 通**にまとめる。アプリ内やプッシュで先に読んだ通知はメールされない — 送信量が減るのはここ。以前は 1 件 = 1 通で、既読のものにも同じだけ飛んでいた。判定規則は `lib/notification-email-core.ts`（純粋・試験あり）、掃き出しは `lib/notification-digest.ts`、設定は `system_settings` の `notification_email.*`。印は `notifications.email_sent_at` の**1 列だけ**で、(1) 二度送らないための印と (2) その人へ最後に送った時刻（`MAX()` で引く = 送信間隔の基準）を兼ねる。種別ごとに「待たせず即時 1 通」も選べるが**既定は空**。掃き出しは BullMQ ではなく `instrumentation.ts` の `setInterval`（締日オートラン・取込ポーラーと同じ流儀。刻みは `NOTIFICATION_DIGEST_TICK_MS`、既定 5 分 — 刻みは送信間隔ではなく、送るかどうかは毎回設定を読んで決めるので変更に再起動が要らない）), **ログイン履歴** (`SY0D`, `/settings/login-history` — Web + kiosk auth events; server-side filtering incl. CIDR via `inet <<=`; detail is a drawer that writes one `VIEW` audit row on open), **注文書取込** (`SY0C`, `/settings/order-intake` — the 受注請書 intake watched folder (`INTAKE_DIR`) from the browser: drop many order PDFs in at once, see 取込待ち / 取込済 / 失敗, 今すぐスキャン, and push a failed file back to the queue; `lib/intake-folder.ts` + `POST /api/intake/folder` — putting a file there is all it does, the existing poller still does the numbering + extraction. dev only so far: `main` has no `INTAKE_DIR`) — old `/admin/*` paths redirect. Personal settings live under the profile: **プロフィール写真** is uploaded in-app at `/profile` (never pulled from AD): the picker opens a square cropper (`components/ui/ImageCropModal.tsx` — canvas + pointer events, no dependency; drag / slider / wheel / pinch) which writes **two sizes** — 大 512px + 小 96px — so nothing is resized at display time. Both are stored in SeaweedFS as `avatars/{userId}-{large|small}-{epoch ms}.{ext}` (`lib/file-naming.ts` `avatarStorageKey`) + `files` rows, referenced by `app.users.avatar_file_id` / `avatar_thumb_file_id`, served by `/api/avatars/[userId]?v=<fileId>[&size=sm]` (login required; missing thumb falls back to 大). Upload/delete go through `POST`/`DELETE /api/avatars` (never a Server Action — see the app CLAUDE.md), logic in `lib/avatar.ts`, which **enforces square + max px server-side** via the in-house header parser `lib/image-size.ts`. Always render avatars with `components/ui/UserAvatar.tsx` — it is a true circle (`radius={9999}`, not `radius="xl"`) and picks 大/小 by display size (≤48px → 小, so every list/header/history icon loads the 96px file). Photos also appear in the 履歴 timeline (`AuditTimeline` bullet, actor URL from `lib/audit.ts`). **通知設定** is `/profile/notifications` (old `/settings/notifications` redirects), **ホーム画面設定** is `/profile/home` (per-user home customize — favorite apps pinned on top, 標準/カスタム display mode, custom groups; stored in `app.user_home_settings`, logic in `lib/home-settings-core.ts` + `lib/home-settings.ts`), and the avatar menu holds プロフィール / 通知設定 / ホーム画面設定 / ログアウト. All configurable app logic persists to the ONE generic table `app.system_settings` (key→JSON KV) via `lib/app-config.ts` (`readConfigNamespace` / `writeConfigValues`) — no schema change per new setting. The **価格試算計算** app (op code `SY02`, `/settings/trial-pricing-engine`, dedicated システム app, `system` permission; typed adapter `lib/system-settings.ts`) configures 価格試算 pricing: material-price policy, default coefficients, **admin-defined criteria**, **custom inputs**, **admin-defined 工具種** (tool types — add/remove from `/settings/trial-pricing-engine/tool-types`; built-in ROUND_BAR/CYLINDER/OH are locked, custom types delete only while unused by estimates; per-type pages also assign which criteria + which final 見積単価 apply, writing the same `toolTypes` membership as the criteria pages; `estimates.tool_type` is varchar, definitions live in `trial_pricing.tool_types`), and admin-defined lookup tables. The SY02 main page **lists** the criteria (reorder/enable/delete/add, persisted immediately via `updateCriteria`); each criterion's fields are edited on its own page (`/settings/trial-pricing-engine/criteria/[id]`, `.../new`). The engine (`lib/trial-pricing-engine.ts`) computes 見積単価 as the sum of an ordered **criteria** list (each criterion scopable per 工具種 via `toolTypes`; empty = all) — each a JS **expression** over the simulation-input variables (+ custom inputs, `quantity`, `subtotal`, `r.<id>`, and curated `round()`/lookup helpers), evaluated per lot in the isomorphic sandbox (`lib/trial-pricing-script.ts` `compileSandboxed`; dangerous globals shadowed). `DEFAULT_CRITERIA` (`lib/trial-pricing-criteria.ts`) reproduce the legacy formula 1:1 (kept as `calcTrialPricingLegacy`, the parity-test oracle); reference matrices stay data in `lib/trial-pricing-data.ts`. `calcTrialPricing(input, opts)` + `TrialResult` are unchanged, so all call sites/views are untouched. (The old free-form custom-script post-processor is **retired** — its settings UI was removed and the engine no longer applies it; `customScriptEnabled`/`customScript` remain in the type only for compatibility, marked `@deprecated`.) Settings thread through every call site via `toTrialPricingOptions(settings)`. **Price at point:** create/confirm snapshot the computed result into `estimate.result`; list/detail render that snapshot (fallback: recompute), so changing criteria never re-prices historical estimates. Old `/settings/apps/trial-estimate` redirects to SY02. Env-scoped app on/off flags remain in `feature_flags` (`/settings/apps`).

**Numbering** — `lib/numbering.ts` handles all document numbers with monthly-reset sequences (`numbering_sequences` table). Formats: `QOT-YYYYMM-NNNNN`, `ORD-YYYYMM-NNNNN`, `PO-YYYYMM-NNNNN` (素材発注書), `DRN-YYYYMM-NNNNN`, `INV-YYYYMM-NNNNN`, `WOR-YYYYMM-NNNNN` (指示書の書類番号 — key `WORK_ORDER_DOC`). Lot numbers (= `work_orders.work_order_number`, shared with `order_lines.lot_number` and inventory lots) remain global serial integers (key `WORK_ORDER`) and stay the business key for approvals/memos/audit/QR (`CKK:WO:<int>`) and the kiosk; the WO doc number is the display identity, and `/production/work-orders/[id]` accepts both forms.

**File storage** — SeaweedFS via S3 API. All uploaded/generated files stored as `files` table rows (`storage_key`, `filename`, `mime_type`).

**Design** — Mantine v9 with `primaryColor: 'blue'`, `defaultRadius: 'sm'`, global `size: 'sm'` defaults. Page patterns: list → `DataTable` + filter bar in `Paper`; detail → summary grid + `Tabs`; form → `Paper` sections + `@mantine/form` with `zodResolver` + Server Actions. See `_specs/design.md` for full component specs and status-badge color map.

## Deployment & Remote Server

**Branch → environment (deploy to dev first, always)** — All work lands on `dev` and is **deployed to `app-dev.ckk-tool.co.jp` first** for verification. **Feature-branch PRs always target `dev` — never open a PR against `main`.** Promotion to production is by **PR `dev` → `main`**; `main` deploys to **`app.ckk-tool.co.jp`**. Never deploy straight to `main`/production — verify on `app-dev.ckk-tool.co.jp`, then open the PR.

**The repo is private, so Coolify clones over an SSH deploy key** — all apps use `git@github.com:Kuisin/ckk-tool-v3.git` with `applications.private_key_id = 1`. `private_key_id` **cannot be set through the REST API**, so a newly created app comes up on the built-in "Public GitHub" source and fails to build until the DB row is updated by hand; when several unrelated apps fail at once with `could not read Username for 'https://github.com'`, this is why. Details + the SQL: `coolify/platform/README.md`.

**nextjs-web deploys via Coolify** (all other stacks use the rsync + rebuild flow below). Coolify (`~/stacks/coolify`, dashboard `https://deploy.ckk-tool.co.jp`, LAN fallback `http://192.168.50.15:8000`) builds the app from GitHub per branch — see `coolify/platform/README.md` for full topology, bootstrap, and webhook setup. **pnpm workspace build**: the 4 apps build with `base_directory` = `/` (repo root context, root lockfile + `packages/*`) and `dockerfile_location` = `/coolify/apps/nextjs-<app>/Dockerfile`; watch_paths cover the app dir + `packages/**` + root manifests (applied by `setup.sh` / `add-kiosk-apps.sh`). **watch_paths must be separated by real newlines** — writing the two characters `\n` makes Coolify treat the whole value as one pattern that matches nothing, so pushes stop deploying with no error anywhere; check with `jq '.watch_paths | split("\n") | length'` after any API write:

| App | Branch | Host port | Public host |
|-----|--------|-----------|-------------|
| `nextjs-web-dev` | `dev` | `:3004` | `app-dev.ckk-tool.co.jp` (legacy alias: `app-dev.ckk-tool.co.jp`) |
| `nextjs-web-main` | `main` | `:3005` | `app.ckk-tool.co.jp` |
| `nextjs-kiosk-dev` | `dev` | `:3006` | `ckk-kiosk-dev.kai-lab.net` |
| `nextjs-kiosk-main` | `main` | `:3007` | `ckk-kiosk.kai-lab.net` |
| `po-extract-dev` | `dev` | — (internal) | — (alias `po-extract-dev:8000`) |
| `po-extract-main` | `main` | — (internal) | — (alias `po-extract-main:8000`) |

- Deploy: `coolify/platform/deploy.sh dev` (or `main`, `kiosk-dev`, `kiosk-main`) after pushing; GitHub push auto-deploy activates once Coolify is exposed via the tunnel (see README).
- **Rollback (main)**: Coolify UI → nextjs-web-main → Deployments → redeploy a previous build, or `deploy.sh main <git-sha>`. Deployment images are kept, so rollback is fast.
- Ingress is decoupled from deploys by **`custom_network_aliases`**: each app claims a stable name on the `coolify` network (`web` / `web-main` / `kiosk` / `kiosk-main` / `admin-dev` / `admin` / `dockge` / `open-webui` / `po-extract-*` / `ckk-db-*`), so routing never changes on redeploys or rollbacks. The socat relays that used to do this were removed on 2026-08-25 — nginx and cloudflared now attach to **one** network (`coolify`) and resolve everything by alias. Chasing per-stack compose network names is what kept breaking them on every migration.
- Coolify apps run on the external `coolify` docker network; everything they need (`ckk-db-*`, `gotenberg-*`, `seaweedfs-*`, `ollama`) is on it. App env vars are managed in Coolify (not compose).
- **Coolify renames named volumes** to `<appUUID>_<name>` even when the compose declares `external: true` — so a named volume cannot be shared between apps, and a redeploy can silently come up on an empty one. Anything with data that must survive uses a **host bind mount** instead: `/data/ckk-secrets`, `/data/seaweed-dev`, `/data/seaweed-main`, `/data/ollama`, `/data/open-webui`. Bind mounts pass through Coolify unchanged.
- dev and production share **nothing**: separate DB, object storage and PDF renderer (`ckk-db-dev`/`-main`, `seaweedfs-dev`/`-main`, `gotenberg-dev`/`-main`). The one accepted exception is `ollama` (a single GPU set).

**Polymorphic children are cascaded by trigger, not FK** — 承認依頼 (`approval_requests.target_type/target_id`), メモ (`document_memos`), メモ改訂 (`document_memo_revisions`), 添付 (`document_attachments`) all point at a document by its **business-key string**, not an FK, so deleting a document would leave them behind — and if 採番 is ever reset, a reused number inherits them (this happened on dev: an approval record predating the document). Each document table therefore carries an `AFTER DELETE` trigger `purge_children_after_delete` → `app.purge_document_children()` (migration `20260911090000_document_children_cascade`) covering the 12 owner tables. It is invisible to the Prisma schema, so **add the trigger when you add a document table**. `audit_logs` is deliberately excluded — audit records outlive the document. The app has no document-delete path at all; the trigger exists because real deletions happen via psql/scripts/restores.

**Database migrations (shared-db)** — Schema source of truth is `shared-db/prisma/schema/` (one `.prisma` per domain); migrations are owned by `shared-db` and NEVER run from nextjs-web. Authoring flow (from `shared-db/`): edit schema → `pnpm validate` → `pnpm migrate:dev -- --name <change>` → `pnpm generate` → sync **all three** consumer copies (`coolify/apps/nextjs-web`, `nextjs-kiosk`, `prisma-studio` — each has `pnpm db:sync-schema && pnpm db:generate`).

The history was **squashed on 2026-08-24** into 9 readable migrations: `20260824000001`–`000006` are the schema baseline (schemas/enums → master tables → business tables → system tables → constraints+indexes+FKs → views/functions/triggers; FKs live in the constraints file so table-file membership never matters), and `000007`–`000009` are the one-shot seed data (材種 + 工程マスタ + 試算設定 + 通貨 + `system` user; RBAC permissions + roles; feature flags). **A brand-new DB needs nothing but `prisma migrate deploy`** — no seed runbook. Master data that must NOT be in a fresh production DB (素材, 拠点, 不良種類, 承認フロー) cannot live in a migration, since migrations apply to every environment identically — it sits in `shared-db/sql/extended-master-seed.sql`, which dev/screenshot DBs load and production does not. `prisma migrate diff` against such a DB must be **empty**; GIN `match_names` indexes and the `settings_code` default are declared in the schema now, so any diff is a real change.

Never paste a pg_dump preamble into a migration: `set_config('search_path','')` blinds Prisma to `_prisma_migrations` and the deploy dies with **P1014** *after* writing data.

**The DB is Coolify's, and migrations apply themselves — never by hand.** The databases are Coolify apps (`ckk-db-dev` / `ckk-db-main`), and merging to `dev` / `main` triggers the Coolify apps `db-migrate-dev` / `db-migrate-main` (watch path `shared-db/**`), which run `prisma migrate deploy` and then re-apply the three idempotent, evolving artifacts — `grants.sql`, `kiosk-cron.sql`, `analytics-views.sql` — which are deliberately **not** migrations because they must re-run as the schema grows. A failure fails the deployment, visibly, in the Coolify UI.

**There is no manual apply path, on purpose.** `migrate:deploy`, `migrate:deploy:remote`, `grants:remote` and `cron:remote` were removed from `shared-db/package.json` (and from the pre-approved command list) on 2026-08-25. A hand-applied migration produces exactly the failures that are hardest to see later: dev and main drifting apart, `grants.sql` applied but `analytics-views.sql` forgotten, or a migration marked applied in `_prisma_migrations` that no deployment ever ran. If a migration must land, **merge it** — that is the mechanism. If the migrator fails, fix the migration and merge again; read its deployment log for the reason.

Skipping `grants.sql` after adding tables makes the app 500 on those tables (role `app` has no rights) — which is why the migrator always runs it, every deploy.

**Inspection (read-only)** — the DBs publish no host port, so from this Mac use `scripts/remote-db.sh`, which opens an SSH tunnel to the container and rewrites `DATABASE_URL`:

```bash
cd shared-db
pnpm migrate:status:remote     # applied/pending を見る（読むだけ）
pnpm remote psql "$DATABASE_URL" -c '\dt app.*'
pnpm import:legacy:remote      # 取引先マスタ (010_bp) — 再構築後のデータ投入（マイグレーションではない）
```

Overrides: `DB_SSH_HOST`, `DB_CONTAINER`, `DB_TUNNEL_PORT`. **From a cloud Claude session** (sandbox has no LAN route — no SSH, no 192.168.50.x): run the same steps through Claude Code Remote in the Mac bridge environment (`kaisei-mac-studio:ckk-tool-v3`) — `create_trigger` with `create_new_session_on_fire: true` + that `environment_id`, then `fire_trigger`; have the session post its result as a PR comment and subscribe to the PR to receive it.

**Server** — `192.168.50.15` (hostname `docker-mac-pro`; despite the name it runs Linux — Ubuntu noble / t2 kernel). Access: `ssh 192.168.50.15` (key-based, user `kaiseisawada`). **Almost everything is Coolify-managed** — 14 apps in the `common` environment (`ai-stack`, `app-support`, `cloudflared`, `fx-rates`, `kot-import`, `legacy-db`, `mailrelay`, `metabase`, `monitoring`, `portainer`, `prisma-studio`, `secrets`, `vpn-ldap`) plus the per-environment apps in `development` / `production`. Only **three** things are deployed directly with `coolify/common/deploy-stack.sh`, each for a stated reason:

| Stack | なぜ Coolify に入れないか |
|---|---|
| `coolify` | Coolify 自身 |
| `nginx-proxy` | LAN の TLS 終端。Coolify がアプリに `ports_exposes: 80,443` を見ると自前の Traefik を起動して 80/443 を奪う（実際に LAN の TLS を落とした） |
| `db-backup` | バックアップは**復旧手段**なので、復旧したい相手（Coolify）に依存させない |

Browsing/inspection is **Portainer** (`dock.kai-lab.net` — the hostname and its `dockge` network alias are leftovers from Dockge, which is gone).

**The stack map is `coolify/README.md`** — every stack grouped by role (Edge / Coolify apps / app support / data / AI / ops / identity), which containers it owns, how it deploys, and the cross-stack network edges. Read it before adding a service, and add the new service there. Rule of the map: **every container belongs to a stack** — nothing is started with a bare `docker run`.

**Source ↔ server** — Each `~/stacks/<stack>` mirrors `coolify/common/<stack>` in this repo, but the **server copies are not git repos** and there is no deploy script/CI. Deploy = rsync the source up, then rebuild. The server's `.env` holds secrets and lives **only on the server** — never overwrite or delete it (always `--exclude '.env'`).

**Secrets (never commit)** — The **Cloudflare DNS API token** (acme.sh DNS-01 for `nginx-proxy`; `Zone:DNS:Edit` on `kai-lab.net` + `ckk-tool.co.jp`) has its operational copy in the server's `~/stacks/nginx-proxy/.env` (`CLOUDFLARE_DNS_API_TOKEN`). A local backup lives in this Mac's login Keychain — retrieve with `security find-generic-password -s ckk-cloudflare-dns-api-token -w`. The **Cloudflare Tunnel API token** (account-scoped, `Cloudflare Tunnel:Edit` — used to manage the tunnel's public-hostname ingress rules via API, e.g. adding `deploy.ckk-tool.co.jp`) lives only in the Keychain: `security find-generic-password -s ckk-cloudflare-tunnel-api-token -w`. Tunnel config API: `PUT /accounts/f3ed926bb74cda704944f32bea936b5e/cfd_tunnel/3c8475a0-8285-4f44-a8d2-b1e0efb50c5b/configurations` (GET first, edit the `ingress` array, PUT back whole). If either token is exposed, rotate it in Cloudflare and update its storage place(s).

**Deploy a non-Coolify stack** — use `coolify/common/deploy-stack.sh <stack>`. It
rsyncs `coolify/common/<stack>/` up to `~/stacks/<stack>/` (always excluding the
server-only `.env`; no `--delete`, so server-only files/certs/data survive) and runs
`docker compose up -d --build`. This covers **every stack except the Coolify-built
apps** (the nextjs-web app + admintools, which deploy via `coolify/platform/deploy.sh`).

```bash
cd coolify/common
./deploy-stack.sh                    # list deployable stacks
./deploy-stack.sh ai-stack --dry-run # preview the rsync file set (do this first)
./deploy-stack.sh ai-stack           # rsync + rebuild
# server host override: DEPLOY_HOST=<ip> ./deploy-stack.sh <stack>
```

Always `--dry-run` first to confirm the file set. The nextjs-web Dockerfile builds Next.js `output: "standalone"`; PDF templates under `src/pdf-templates/` reach the runtime image via `outputFileTracingIncludes` in `next.config.ts` (file tracing can't follow `fs.readFile` paths). `pnpm install --frozen-lockfile` runs in-build, so the lockfile must always match
`package.json` — 依存を足したら `pnpm-lock.yaml` を必ず同じコミットに含める
（足すかどうかの決め方は `coolify/apps/nextjs-web/CLAUDE.md`「依存ライブラリ」）。

**nextjs-web topology** — the app containers are Coolify-managed (dev `:3004`, main `:3005`, container `:3000`; host `:3000` is taken by open-webui). Public access `https://app-dev.ckk-tool.co.jp` (dev) / `https://app.ckk-tool.co.jp` (main) via the `cloudflared` stack; LAN TLS via `nginx-proxy` (same hostnames, shared `app.ckk-tool.co.jp` SAN cert); both reach the apps over the **`coolify`** network at `http://web:3000` (dev) / `http://web-main:3000` (main) — those are Coolify `custom_network_aliases` on the app containers themselves (the socat relays that used to provide them were removed on 2026-08-25). PDF generation and file storage are per-environment services in the `app-support` stack: `GOTENBERG_URL=http://gotenberg-{dev|main}:3000`, `SEAWEED_FILER_URL=http://seaweedfs-{dev|main}:8888`.

**Kiosk (共有端末)** — second Next.js app `coolify/apps/nextjs-kiosk` (Coolify dev `:3006` / main `:3007`, hostnames `ckk-kiosk-dev.kai-lab.net` / `ckk-kiosk.kai-lab.net`, `coolify` 網の別名 `kiosk` / `kiosk-main`, dedicated `ckk-kiosk.kai-lab.net` SAN cert in nginx-proxy). Plant-floor shared tablets: employees log in with a QR card + required PIN (scan-only only when the card was used **on that device** within 48h AND the last PIN verification is within 2 weeks — first login on a new device always asks PIN, and PIN is re-asked every 2 weeks regardless of activity; 5 fails → 15-min lock) against `app.kiosk_cards`/`kiosk_sessions` (custom DB-session cookies, not Auth.js; 8h hard + 5-min idle). Device trust = 30-day token; enrollment is profile-first: admin creates a device profile in SY09 (open), the TABLET shows a link code/QR (kiosk_link_requests, 10 min), admin scans/types it in SY09 to link — only onto open (PENDING) profiles — and only LINKED profiles can be activated; リンク解除 reopens a profile (kills token/sessions/attestation key, keeps name/plant/map pin) for re-linking a replaced device. Runs a custom Node server (`src/server.ts`, no standalone) exposing WebSocket `/api/kiosk/ws` for live device presence — kiosk tablets connect with the device cookie; the main app's admin UI connects as a monitor using an HMAC token from the shared `KIOSK_WS_SECRET` env (set in both apps; generated by `coolify/platform/add-kiosk-apps.sh`). `kiosk_devices.name` is a localized `{ ja, en }` JSON (SY09 edits both; kiosk screens resolve ja per the pre-login ja-fixed rule; read it via `lib/format.ts` `deviceName()`, which also accepts pre-migration plain strings). Admin UIs live in nextjs-web: QRカード管理 `SY08` `/settings/kiosk-cards` (issue/assign/print/revoke, PIN reset), 端末管理 `SY09` `/settings/kiosk-devices` (per-plant device list + activation, floor maps `/settings/kiosk-devices/map` with drag-placed pins showing live online status; images in SeaweedFS via `files`). Both gated by permission code `kiosk` (admin-only). **メンテナンス退出 PIN** (右上 5 タップ → Android 設定へ抜ける番号) は全端末共通で、現行値は `system_settings['kiosk.unlock_pin']` の 1 行を pg_cron が毎日 4:00 に**上書き**する (`shared-db/sql/kiosk-cron.sql`)。ところが端末側はその値を**ローカルに保持する** (`PinSync` → SharedPreferences)。つまり **オフラインの端末が受け付けるのは現行値ではなく「最後に同期できた時点の値」** で、上書きしかしていなかった頃はそれを引く手段が無かった（バックアップからの復元しかなかった）。そのため rotate ジョブは同じ 1 本で履歴 `app.kiosk_unlock_pins` にも 1 行残し、400 日を超えた行を刈る。さらに **どの端末が何を受け取ったかは推測しない** — `GET /api/kiosk/unlock-pin` が渡せたときだけ `kiosk_devices.unlock_pin_synced_at` / `.unlock_pin_rotated_at` に受け渡しを記録し、SY09 端末詳細はそこから履歴の行を引いて「この端末が保持している PIN」を出す。`last_activity_at` では代用できない（通信できていても未リンク・トークン切れの 401 や PinSync 以前の APK では PIN は届いていない）。`unlock_pin_synced_at` が null = 一度も受け取れていない = 端末は **ビルド時の既定 PIN**（`BuildConfig.KIOSK_UNLOCK_PIN` — `~/.gradle/gradle.properties` の `KIOSK_UNLOCK_PIN`、無ければ `246810`。サーバー側には存在しない）のまま。表示はいずれも監査ログ記録。The kiosk launcher filters apps by the `user_permissions` view; its app registry (`nextjs-kiosk/src/lib/app-list.ts`) declares apps with an i18n `labelKey` (not a hard-coded label). **工程実行** (`/steps`, permission `work_order`) is the first business app: the operator sees the steps assigned to them (assignment = a `work_order_step_plans` row for their user), and can 開始 / 一時停止 / 再開 / 完了 with 受入数 recorded at start and 産出数 at complete (per the step's `quantity_tracking` mode). **一時停止 is derived, not a status** — `STEP_STATUS` gets no `PAUSED`; pause closes the open `work_order_step_actuals` row and releases `session_locked_by`, so 一時停止中 = `IN_PROGRESS AND session_locked_by IS NULL`, resume re-claims the lock and opens a new actual row (one row per work session ⇒ accumulated work time). This keeps every nextjs-web rule (`isWorkOrderComplete` / `computeWipByStep` / rollback guards / the actual+inspection `IN_PROGRESS` gates) unchanged. **指示書スキャン** (`/wo-scan`, permission `work_order`) is the second business app: scan the work-order QR (`CKK:WO:<番号>` — already printed on 指示書帳票/検査表, `qr-payload.ts`; manual number entry as fallback) to see ALL of that work order's steps in 工程順 and open the same execution view (`/steps/[stepId]?from=wo`, back goes to the WO view). The row-level gate for this is `canOperateStep` (`step-execution.ts`) — operable = own plan row / own lock / **step has zero plan rows** (未計画は開放 — deliberate policy so a worker holding the paper can run unplanned ad-hoc steps; steps planned for someone else stay locked to them; the scan itself is never an authorization factor since WO numbers are guessable serials). The same rule gates the detail page (`getMyStep`) and the API. The kiosk owns its write path end-to-end (`src/lib/step-execution.ts` + `POST /api/kiosk/steps/[stepId]`, gated by session → `authz.hasPermission('work_order','UPDATE')` → row-level `canOperateStep`) — it deliberately does **not** call any nextjs-web internal API. Twin pure-TS modules shared by copy between the two apps (`qr.ts` QR encoder, `crockford.ts`, `ws-auth.ts`/`kiosk-ws-token.ts`) — update both when changing. Additionally, `workflow-core.ts`, `workflow-core.test.ts`, **`inventory.ts`** and **`inspection-core.ts`** (+ its test — 検査項目の型別自動合否・抜取サンプル数の判定規則) are **byte-identical copies** of the nextjs-web originals (the kiosk completes the final step, which posts inventory, and records inspections): re-copy with `pnpm twin:sync` and review both sides — `src/lib/twin-files.test.ts` fails the build on any drift. **Device attestation**: the Android wrapper `external/android-kiosk/` (Kotlin WebView; the Android SDK is installed on this Mac at `~/Library/Android/sdk`, so `./gradlew assembleDevDebug` works from the CLI — point `JAVA_HOME` at `/Applications/Android Studio.app/Contents/jbr/Contents/Home` and keep `local.properties` with `sdk.dir` out of git) injects `window.KioskDevice` backed by a hardware Keystore P-256 key; the login page runs challenge→sign→`/api/kiosk/attest`, the key TOFU-binds to the device row (`device_public_key`/`fingerprint`, shown in SY09 with a 鍵リセット action), and with env `KIOSK_ATTESTATION=required` login APIs + WS demand the resulting 12h attest cookie — plain browsers are blocked.

**Cross-stack services** — the `ai-stack` runs `ollama` (`:11434`, local models — attached to the `coolify` network so the per-environment `po-extract` apps can reach it; **shared by dev and main** because there is one GPU set); `metabase` (`:3003`, OSS, postgres app DB) holds the BI dashboards. Cross-stack reachability is by attaching a service to the other stack's external network — the Coolify-built nextjs-web reaches `shared-db`, `gotenberg`, `seaweedfs` because those are attached to the `coolify` network (and `po-extract-dev`/`-main` because they are Coolify apps on it); nothing is reachable cross-stack by default.

**Manage / verify** — `docker ps`, `docker compose logs -f <svc>`, `docker compose restart <svc>`, `docker compose up -d --build` (rebuild after source change). Health/smoke-test from inside the network, e.g. `docker run --rm --network coolify curlimages/curl -sf http://web:3000/`. Coolify containers are hash-named, so find one by alias rather than by name (`docker run --rm --network coolify alpine getent hosts web`). Postgres-backed services (`ckk-db-dev`/`-main`, `metabase-db`, `ckk-legacy-db`) — back up with `docker exec <db> pg_dump` and restore with `pg_restore`/`psql` before mutating live data.

**Backups** — `shared-db` is continuously backed up by the `db-backup` stack (PG17 incremental base backups; hourly kept 72h, daily kept 14 days, monthly kept 12, under `/data/db-backups` on the server). Restore runbook, monitoring, and the one-time live-cluster setup: `coolify/common/db-backup/README.md`. `pg_dump` remains the ad-hoc pre-mutation tool and the only method for `metabase-db`/`ckk-legacy-db`.
