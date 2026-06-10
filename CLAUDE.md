# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

**RBAC** — Always query the `user_permissions` view (not the raw relation tables). It aggregates roles → permissions per user and returns only the highest `SCOPE` per `(user_id, action, permission_code)`. Scopes (`REGION/COUNTRY/FACTORY/DEPARTMENT/TEAM`) resolve against the `org_units` hierarchy via `user_org_assignments`; business documents carry an `org_unit_id` (originating factory) used for visibility filtering.

**Multi-nation** — All DB timestamps are `timestamptz` (UTC); render in user/site timezone via `@date-fns/tz`. One currency per document (inherited quote → invoice, never changed mid-flow); resolve prices only from matching-currency `price_lists` rows. Tax rates come from `tax_rates` (country × tax_type × valid_from) and are snapshotted on the invoice, as is the JPY exchange rate (`exchange_rates`).

**Auth** — Auth.js v5, DB session + short JWT. Identity sourced from Samba AD via LDAP/OAuth.

**Realtime** — SSE via Next.js Route Handlers. Pub/Sub and presence through Valkey (keys + TTL).

**PDF** — HTML + vanilla CSS templates sent to Gotenberg (`app/api/pdf/`). No headless browser. Generated PDFs are stored in SeaweedFS and referenced via the `files` table.

**Jobs** — BullMQ backed by Valkey. AD → PostgreSQL employee sync runs as a repeatable job. Monthly billing closing also runs as a BullMQ job.

**Search** — PGroonga extension on PostgreSQL (not a separate service).

**Logging** — App logs via pino → Loki. Row-level audit via `audit_logs` (before_data / after_data JSON). System events (login, PDF generation, CSV export) in `system_logs`. Nginx access logs → Loki via Alloy. Alerts in Grafana.

**i18n** — UI strings via `next-intl` + `messages/` JSON. DB multilingual fields are `{ ja: '', en: '' }` JSON objects — always write both locales.

**Accounting** — Adapter-based export: `lib/journal.ts` generates common journal entries; the site's `org_units.accounting_system` adapter formats them (JP sites: 弥生会計 Next CSV via `lib/csv-export.ts`; other countries: generic journal CSV). Double-export guarded by `invoices.accounting_exported_at`.

**Data fetching** — React Server Components for server state; Zustand for client-only state.

**Numbering** — `lib/numbering.ts` handles all document numbers with monthly-reset sequences (`numbering_sequences` table). Formats: `QOT-YYYYMM-NNNNN`, `ORD-YYYYMM-NNNNN`, `DRN-YYYYMM-NNNNN`, `INV-YYYYMM-NNNNN`. Work order / lot numbers are global serial integers.

**File storage** — SeaweedFS via S3 API. All uploaded/generated files stored as `files` table rows (`storage_key`, `filename`, `mime_type`).

**Design** — Mantine v9 with `primaryColor: 'blue'`, `defaultRadius: 'sm'`, global `size: 'sm'` defaults. Page patterns: list → `DataTable` + filter bar in `Paper`; detail → summary grid + `Tabs`; form → `Paper` sections + `@mantine/form` with `zodResolver` + Server Actions. See `_specs/design.md` for full component specs and status-badge color map.
