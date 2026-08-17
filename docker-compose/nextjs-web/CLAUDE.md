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

**pnpm workspace.** This app is a member of the repo-root pnpm workspace — run
`pnpm install` at the REPO ROOT (single root `pnpm-lock.yaml`; no per-app
lockfile). Shared packages live in `packages/*` (`@ckk/authz-core` = RBAC core;
consumed as TS source via `transpilePackages`).

**No new dependencies.** The lockfile is frozen (`pnpm install --frozen-lockfile`
runs in the Docker build). Build utilities in-house instead — precedents:
`lib/csv.ts` (CSV), `lib/js-highlight.ts` (syntax highlight/format). If a dep is
truly required, raise it explicitly; don't edit `pnpm-lock.yaml` casually.
Sanctioned exception (explicit sign-off): the docs stack — `fumadocs-ui` /
`fumadocs-core` / `fumadocs-mdx` / `@orama/tokenizers` (+ `@types/mdx`) for
`/manual` + `/internal-docs`. Second sanctioned exception: the rich-text stack —
`@mantine/tiptap` (version-pinned **exactly** to `@mantine/core`) + `@tiptap/react`
/ `@tiptap/pm` / `@tiptap/starter-kit` / `@tiptap/extension-link` for the 文書メモ
/ コメント (`ui/MemoPanel.tsx`).

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
  `lib/product-settings.ts` (製品項目/種別 SY03/SY04). Namespaces are
  `"<ns>.<field>"`.
- **App on/off**: `feature_flags` table via `lib/app-flags.ts`. On `main`, an app
  shows only with an explicit `app:<key>:main` = true row
  (`../../shared-db/sql/feature-flags-seed.sql`); `dev` shows all by default.
- **Registries** (keep in sync when adding an app): `lib/app-list.ts` (launcher +
  home), `lib/operation-codes.ts` (`{CAT}{MODE}{IDX}` jump codes),
  `lib/icons.ts` (name→Tabler icon).

## Docs system (`/manual` public + `/internal-docs` auth) — fumadocs

Two content trees, both fumadocs-mdx collections (`source.config.ts`):

- `content/manual/` — public user manual, served at `/manual/<lang>/<slug>`
  (**no login** — `manual` + `llms-manual` are excluded in `src/proxy.ts`).
  Two top-level sections: **`operations/<category>/<app>/user.md`** (操作方法 —
  how to work each screen, grouped by the same categories as `lib/app-list.ts`)
  and **`process/<domain>.md`** (プロセス — the business flow and which app is
  used at each step). Old `apps|masters|system|kiosk/...` URLs 308-redirect
  (`MANUAL_APP_CATEGORY` in `next.config.ts`) — keep that map in sync when an
  app page moves. Note pages sit 3 deep, so images are `../../../assets/…`.
- `content/internal/` — internal docs (kiosk setup, admin) at
  `/internal-docs/<lang>/<slug>` — proxy-gated AND `auth()`-checked in the layout.

Conventions: locale by filename suffix (`page.md` = ja, `page.en.md`,
`page.zh.md`; same for `meta.json`/`meta.en.json`/`meta.zh.json`); frontmatter
`title` + `description` + (manual only) `screenshots: [ids]`; ordering via
`meta.json` `pages`. GFM tables/nested lists are fine (old no-tables rule is
gone). Sources: `lib/manual-source.ts` / `lib/internal-source.ts` — **public
routes must never import `internal-source.ts`** (that import boundary is what
keeps internal content out of the public search index / llms endpoints).
Search: `/manual/search` (public) + `/internal-docs/search` (session-checked),
Orama with ja/zh tokenizers. LLM: `/manual/llms.txt` + raw markdown at
`/manual/<lang>/<slug>.md` (rewrite → `/llms-manual`); no internal equivalents.
Old `/docs/...?lang=xx` URLs 308-redirect (see `next.config.ts`). Screenshots:
`content/manual/assets/screenshots/<id>.png`, captured/linted by
`tools/docs-screenshots` (see its README).

**Field help (the "?" next to inputs)** — summaries and manual anchors live in
ONE place, `lib/field-help.ts` (31 apps / 212 fields); call sites just spread it:
`<TextInput label={<HelpLabel {...fieldHelp("quote", "deliveryDate")} />} />`.
`HelpLabel` shows a hover popup with the summary + 「もっと読む」 into the manual
(plain tooltip when no `manual` target). Two variants for awkward call sites:
`fieldHelp(app, field, { label })` keeps the screen's own wording when the manual
merges several inputs under one heading (`名称 / よみがな`), and `fieldHelpTip`
returns only `{ help, manual }` for components that build the label themselves
(`LocalizedTextInput`'s 「〜（日本語）」). Read-only `FieldValue` labels get no `?`.

**`field-help.ts` is generated from the manual** — label + summary come from each
`### 見出し [#field-x]` and its first paragraph, so the same sentence is never
written twice. Fix wording in `content/manual/**`, not in the registry. The manual
side must use **explicit heading ids** because auto ids derive from Japanese
heading text and break easily. `lib/field-help.test.ts` reads the real markdown and
fails if any registered anchor is missing in ja/en/zh, which is what keeps these
links from rotting (`docs:lint` is not in CI).

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
- **File uploads never go through a Server Action** — the Server Action request
  body is capped at **1MB** by default, so anything bigger fails with
  `Error: Body exceeded 1 MB limit` (413) *before* your code runs, and the
  client sees an error page instead of the action's `ActionResult`. Upload via a
  Route Handler + `fetch` instead: `/api/attachments/upload`, `/api/admin/files`,
  `/api/avatars`. (Known offender still on the old pattern:
  `uploadFloorMapImage` in `settings/kiosk-devices/actions.ts`, allows 10MB.)
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
