@AGENTS.md

# nextjs-web — app guide

The main app (BFF + UI + API) for the CKK manufacturing system. This file is
scoped to `docker-compose/nextjs-web`; the repo-wide guide is the root
`../../CLAUDE.md` and the specs live in `../../_specs/`. UI conventions are in
`./design.md`.

> **Read `AGENTS.md` first** — this is a pinned, breaking-change Next.js. Check
> `node_modules/next/dist/docs/` before using an API you're unsure about.

## Commands (run from this directory)

```bash
pnpm dev                 # Turbopack dev server
pnpm build               # next build (output: standalone)
pnpm lint                # Biome check
pnpm format              # Biome format --write
pnpm test                # Vitest (unit)
pnpm test -- src/lib/x.test.ts
pnpm db:sync-schema      # copy shared-db/prisma/schema → prisma/schema (see below)
pnpm db:generate         # prisma generate
```

**No new dependencies.** The lockfile is frozen (`pnpm install --frozen-lockfile`
runs in the Docker build). Build utilities in-house instead — precedents:
`lib/markdown.ts` (Markdown), `lib/csv.ts` (CSV), `lib/js-highlight.ts`
(syntax highlight/format). If a dep is truly required, raise it explicitly; don't
edit `pnpm-lock.yaml` casually.

## Layout

- `src/app/(dashboard)/<domain>/...` — pages. `page.tsx` (list) · `new/page.tsx`
  · `[id]/page.tsx` (detail) · `[id]/edit/page.tsx`. `(auth)/login`. `api/` route
  handlers (pdf, sse, export).
- `src/components/{ui,<domain>}/` — `ui/` = the shared design system (see
  `design.md`); domain folders (sales, production, master, settings, …).
- `src/lib/` — server + isomorphic logic. `src/hooks/` — client hooks
  (`useViewport`/`useIsMobile`, `useUrlState`). `src/content/docs/` — in-app
  manuals (Markdown). `src/types/`, `messages/` (next-intl).

## Server Actions (the write path)

Master/config writes are Server Actions returning `ActionResult` (`lib/server-action.ts`):

```ts
export async function createX(input: XInput): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "CREATE");   // RBAC, always first
  if (!authz.ok) return actionError(authz.error);
  const parsed = xSchema.safeParse(input);                    // zod validate
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  try {
    const row = await prisma.x.create({ data: { name: localizedInput(v.nameJa, v.nameEn), ... } });
    await recordAudit({ action: "CREATE", tableName: "x", recordId: String(row.id), after: {...} });
    revalidatePath(BASE_PATH);
    return actionOk({ id: row.id });
  } catch (e) { return actionError(prismaErrorMessage(e, "作成に失敗しました")); }
}
```

Rules: `checkPermission` first · zod-validate · `localizedInput`/`localizedInputOrNull`
for `{ ja, en }` JSON columns · `recordAudit` before/after · `revalidatePath` ·
map DB errors with `prismaErrorMessage`. The client branches on `result.ok` and
shows `@mantine/notifications`.

## RBAC

Server-enforced via `checkPermission(code, action)` (`lib/authz.ts`) — it reads the
aggregated `user_permissions` view (never the raw relation tables). Do the check
inside the Server Action / route handler, not only in the UI.

## Configuration & app registry

- **Generic settings store**: everything configurable persists to the ONE table
  `app.system_settings` (key→JSON) via `lib/app-config.ts`
  (`readConfigNamespace`/`writeConfigValues`) — **no schema change per setting**.
  Each app has a typed adapter: `lib/system-settings.ts` (試算/SY02),
  `lib/product-settings.ts` (製品項目/種別 SY04/SY05). Namespaces are
  `"<ns>.<field>"`.
- **App on/off**: `feature_flags` table via `lib/app-flags.ts`. On `main`, an app
  shows only with an explicit `app:<key>:main` = true row
  (`../../shared-db/sql/feature-flags-seed.sql`); `dev` shows all by default.
- **Registries** (keep in sync when adding an app): `lib/app-list.ts` (launcher +
  home), `lib/operation-codes.ts` (`{CAT}{MODE}{IDX}` jump codes),
  `lib/settings-apps.ts` (アプリ設定 hub), `lib/icons.ts` (name→Tabler icon).

## Docs system (`/docs`)

In-app manuals: `src/content/docs/<slug>/<lang>.md` (ja/en/zh) + tree in
`lib/docs-tree.ts` + dep-free renderer `lib/markdown.ts` + full-text search
(`lib/docs-search.ts` + `⌘K`). `next.config.ts` `outputFileTracingIncludes` ships
the md into the standalone image. Renderer supports a safe subset only — **no
tables, no nested lists**.

## Prisma / DB

`prisma/schema/` is a **synced copy** — the source of truth is
`../../shared-db/prisma/schema/`. Never author schema or run migrations here;
edit in `shared-db`, then `pnpm db:sync-schema && pnpm db:generate`. Migrations
are owned by `shared-db` (see root CLAUDE.md).

## Conventions that bite

- **RSC boundary**: don't pass functions/handlers from a Server Component to a
  Client Component (pass a string like `component="a"`, or mark the child
  `"use client"`). `server-only` modules (`import "server-only"`) may be imported
  by client code only as **`import type`**.
- Pages that read runtime state use `export const dynamic = "force-dynamic"`.
- i18n: DB `{ ja, en }` fields always carry both (`localizedInput`); UI strings are
  Japanese-first. Terminology + status-color map are fixed — see `design.md` /
  `_specs/design.md §9, §17`.
- **Testing**: pure logic lives in isomorphic `lib/*` with vitest. The pricing
  engine keeps a **parity test** (`calcTrialPricing` == `calcTrialPricingLegacy`) —
  keep it green when touching `lib/trial-pricing*`.

## Deploy

**Always branch → PR → merge; never commit straight to `dev`.** You may merge PRs
into `dev`, but **never merge to `main`** — prepare the `dev`→`main` promotion PR
and leave the merge to the user. Coolify **auto-deploys** on merge to `dev`/`main`,
so do not trigger deploys manually. See root CLAUDE.md for the full topology.
