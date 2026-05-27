# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Manufacturing Company Business Management System — a Next.js fullstack monolith covering sales, purchasing, production, shipping, billing, and master data. Specs live in `_specs/`; implementation follows those documents.

## Specs

@_specs/structure.md
@_specs/techstack.md
@_specs/tables.md

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

**PDF** — HTML + vanilla CSS templates sent to Gotenberg (`app/api/pdf/`). No headless browser in the app.

**Jobs** — BullMQ backed by Valkey. AD → PostgreSQL employee sync runs as a repeatable job.

**Search** — PGroonga extension on PostgreSQL (not a separate service).

**Logging** — App logs via pino → Loki. Row-level audit via `audit_logs` (before_data / after_data JSON). Nginx access logs → Loki via Alloy. Alerts in Grafana.

**i18n** — UI strings via `next-intl` + `messages/` JSON. DB multilingual fields are `{ ja: '', en: '' }` JSON objects — always write both locales.

**Accounting** — `lib/csv-export.ts` produces 弥生会計 Next CSV. Journal logic is isolated in `lib/journal.ts`.

**Data fetching** — React Server Components for server state; Zustand for client-only state.
