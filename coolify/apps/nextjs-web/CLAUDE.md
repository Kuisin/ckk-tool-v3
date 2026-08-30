@AGENTS.md

# nextjs-web — app guide

The main app (BFF + UI + API) for the CKK manufacturing system. This file is
scoped to `coolify/apps/nextjs-web`; the repo-wide guide is the root
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

## 依存ライブラリ — 入れてよい。ただし勝手に決めず、必ず相談する

既定は「入れない」でも「入れる」でもない。**トレードオフを示して利用者に選んでもらう**。
以前この節は「No new dependencies / 自前で書け」だったが、それだと
「500KB 足すほどではない」と**黙って自前実装する**判断も、逆に軽く足す判断も、
どちらも書いた人の一存で決まってしまう。ライブラリを入れるかどうかは
保守を引き受ける人の判断なので、こちらで閉じない。

**手順**

1. **何が要るのかを先に決める。** 形（何を描く / 何を解く）を決めてから
   ライブラリを探す。形が決まると「そもそも要らない」ことも普通にある。
2. **両方の案を書く。** 「入れる場合」と「自前で書く場合」を並べ、
   少なくとも次を書く:
   - それで何が手に入るか / 自前だと何行くらいで、どこが難しいか
   - 大きさ（bundle への影響）とライセンス
   - 保守の見込み（更新頻度・メンテナ・破壊的変更の履歴）
   - この構成に馴染むか（Mantine v9 / App Router / `output: standalone`）
   - **責務の境界** — どこまでをライブラリに渡し、何を自前のロジックに残すか
3. **利用者に聞く。** 一存で決めない。**「必要なら入れてよい」と言われていても、
   何を入れるかは提案して確認する。**
4. 合意できたら: **リポジトリルート**で `pnpm add`（lockfile はルートの 1 本）、
   **バージョンは完全固定**、`pnpm-lock.yaml` を必ずコミット、そして**下の一覧に
   理由と責務の境界を書き足す**。Docker ビルドは `--frozen-lockfile` なので、
   lockfile のコミット漏れはビルドを落とす。

**自前で書くのが正解だったこと**もある（形が単純で、ライブラリのほうが縛りに
なる場合）。前例: `lib/csv.ts`（CSV）、`lib/js-highlight.ts`（構文強調）、
`lib/qr.ts`（QR）、`components/forms/SummaryBars.tsx`（1 系列の件数の横棒 —
必要な形が 1 つだけで、日本語の長いラベルは横棒のほうが読めた）。
**これは「自前が既定」という意味ではない** — 上の 3. を踏んだ結果そうなった、という記録。

### 入れているライブラリ（採用理由と、責務の境界）

- **ドキュメント基盤** — `fumadocs-ui` / `fumadocs-core` / `fumadocs-mdx` /
  `@orama/tokenizers`（+ `@types/mdx`）。`/manual` + `/admin-manual`。
- **リッチテキスト** — `@mantine/tiptap`（`@mantine/core` と**完全に同一バージョン**に
  固定）+ `@tiptap/react` / `@tiptap/pm` / `@tiptap/starter-kit` /
  `@tiptap/extension-link`。文書メモ / コメント（`ui/MemoPanel.tsx`）。
- **UI 翻訳** — `next-intl`。`_specs/techstack.md` が当初から名指ししていたもの（§i18n）。
- **工程フロー図** — `@xyflow/react`（React Flow, MIT, 完全固定）。
  `components/production/WorkflowGraphCanvas.tsx`。X6 / JointJS / rete と比べて
  React ネイティブで、HTML（Mantine）のノードを描けるので日本語の工程名を
  省略せずに済み、レイアウトは自前のものを渡せる。
  **描画層に限る**: `lib/workflow-core.ts` の `layoutWorkflowGraph` が layer/lane を、
  `branchableQuantity` / `canStartStep` / `validateComposition` が妥当性を持ち続ける
  — ここをライブラリへ移すと、キオスクの twin file（`workflow-core.ts`）が黙って
  食い違う。`next/dynamic` + `ssr:false` で読み込み、React Flow の帰属表示は
  `proOptions={{ hideAttribution: true }}` で隠す（MIT の範囲内。ただし作者は
  有償 Pro を求めている）。キオスクには入れない（フロー図が無い）。
- **一般カテゴリ（CM02 フォーム / CM03 社内文書）** — `react-markdown` + `remark-gfm`
  (MIT)、`diff`（jsdiff, BSD-3）、`@dnd-kit/core` + `@dnd-kit/sortable` +
  `@dnd-kit/utilities` (MIT)。いずれも完全固定。
  - `react-markdown` + `remark-gfm` … 社内文書の描画
    (`components/documents/MarkdownView.tsx`)。HTML 文字列ではなく React 要素を
    組み立てるのが要点 — このリポジトリには **HTML サニタイザが無い**ので、
    マークアップを生成する作りにすると保存 XSS の受け皿になる。
    **`rehype-raw`（および生 HTML を通すプラグイン）は足さないこと。** その 1 行で
    保証が消える。リンクと画像の URL は `urlTransform` + 自前の `a` / `img` で絞る。
  - `diff`（jsdiff）… 行差分と「旧版 N 行目 → 新版何行目」の写像。行コメントの追従と
    blame の土台。**差分のプリミティブに限る** — 再アンカーの方針・outdated の扱い・
    `MAX_DOC_LINES` は `lib/line-anchor.ts` が持つ。
  - `@dnd-kit/*` … フォームビルダーの並べ替え。**描画層に限る**:
    `lib/form-schema.ts` が `order` の正規化と検証を持つので、ドラッグを使わずに
    （キーボード、将来の API）組んでも結果は同じ。
  - キオスクには入れない（どちらのアプリも無い）。
- **3D プレビュー** — `online-3d-viewer` (MIT, 完全固定)。設計依頼で受け取った
  3D モデル（STL / OBJ / PLY / GLB / 3MF …）を製品マスタ・指示書・設計依頼の
  画面で見るため。自前だと WebGL のカメラ・ライト・当たり判定まで書くことに
  なり、それは「図面を見せる」ために引き受ける保守ではない。
  **描画層に限る**: どの形式を見せてよいかは `lib/design-file-kind.ts` が持ち、
  ライブラリはもらった URL を描くだけ（React Flow と同じ約束）。
  `next/dynamic` + `ssr:false` で読み込む（document / WebGL を直に触るため）。
  - **npm 版はエンジンだけを同梱していて、STEP / IGES / 3DM / IFC が要る wasm
    は入っていない。** そのため対応形式を `design-file-kind.ts` の
    `MODEL_3D_EXT` に絞ってある — 読めないものを「見られます」と出す方が害が
    大きい。STEP を見せたくなったら occt-import-js を `public/` へ持ち込む
    判断が別途要る。
  - **DXF は入れていない。** 唯一実用的な `dxf-viewer` が MPL-2.0 で、既存の
    依存が全て許容的ライセンスで揃っている一貫性を崩すため（利用者判断）。
    DXF はダウンロードのみ。
  - キオスクには入れない（図面を見る画面が無い）。

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

## 印刷する QR（統一フォーマット）

社内で刷る QR は**全て** `CKK:<KIND>:<KEY>` の 1 形式（`lib/qr-payload.ts` —
kiosk との twin ファイル）。1 つのリーダー（キオスクのスキャナ）が種別を見て
画面を振り分けられるようにするため。

- **URL は入れない** — 長い URL は QR を細かくして現場の読み取りを落とすし、
  紙が外に出たときにホスト名を晒す。KEY は書類の**表示番号**だけにする。
- 種別は `QR_KINDS`（CARD / WO / QOT / ORD / PO / DRN / INV / INSP）。
  増やすときはキオスク側の振り分けも一緒に見ること。
- キオスクのログイン読み取りは `extractCardId`（`nextjs-kiosk/src/lib/
  kiosk-auth-core.ts`）が 3 形式を受ける: 統一形式 / **配布済みの素の 16 桁
  カード**（後方互換 — 刷り直さない）/ 旧 URL 形式。CARD 以外の統一 QR は
  空文字を返す = ログインには使えない。
- 原寸印刷は `@page` を**長さ**で書く（キーワードは縮小されうる）。
  寸法定義: `lib/kiosk-card-sheet.ts`（QRカード）/ `lib/work-order-strip-sheet.ts`
  （指示書ストリップ 180×40mm × 6/A4）。

## RBAC

Server-enforced via `checkPermission(code, action)` (`lib/authz.ts`) — it reads the
aggregated `user_permissions` view (never the raw relation tables). Do the check
inside the Server Action / route handler, not only in the UI.

## Configuration & app registry

- **Generic settings store**: everything configurable persists to the ONE table
  `app.system_settings` (key→JSON) via `lib/app-config.ts`
  (`readConfigNamespace`/`writeConfigValues`) — **no schema change per setting**.
  Each app has a typed adapter: `lib/system-settings.ts` (価格試算/SY02),
  `lib/product-settings.ts` (製品項目/種別 SY03/SY04). Namespaces are
  `"<ns>.<field>"`.
- **App on/off**: `feature_flags` table via `lib/app-flags.ts`. On `main`, an app
  shows only with an explicit `app:<key>:main` = true row
  (`../../shared-db/sql/feature-flags-seed.sql`); `dev` shows all by default.
- **Registries** (keep in sync when adding an app): `lib/app-list.ts` (launcher +
  home), `lib/operation-codes.ts` (`{CAT}{MODE}{IDX}` jump codes),
  `lib/icons.ts` (name→Tabler icon).

## Docs system (`/manual` public + `/admin-manual` auth) — fumadocs

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
  `/admin-manual/<lang>/<slug>` — proxy-gated AND `auth()`-checked in the layout.

Conventions: locale by filename suffix (`page.md` = ja, `page.en.md`,
`page.zh.md`; same for `meta.json`/`meta.en.json`/`meta.zh.json`); frontmatter
`title` + `description` + (manual only) `screenshots: [ids]`; ordering via
`meta.json` `pages`. GFM tables/nested lists are fine (old no-tables rule is
gone). Sources: `lib/manual-source.ts` / `lib/internal-source.ts` — **public
routes must never import `internal-source.ts`** (that import boundary is what
keeps internal content out of the public search index / llms endpoints).
Search: `/manual/search` (public) + `/admin-manual/search` (session-checked),
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

## i18n & 表示設定（言語 / 日付 / 時刻 / タイムゾーン）

**訳す前に `_specs/i18n-glossary.md` を読む — 例外なし。** 翻訳ルール（§2: キーの
付け方 / 変数と複数形 / 言語別の書き方 / 確認項目）と、全用語の ja/en/zh 対訳表
（§3）はあの 1 本が正。表にある語を別の言い方で訳し直さない。必要な語が無ければ
**まず表に足してから**使い、判断が要るものは §5「未決」に上げて、決まるまで使わない
（決着済みの呼び方は §4）。共有端末アプリ（`nextjs-kiosk/src/lib/i18n/messages/`）と
重なる語（状態・工程・数量）は両アプリで同じ訳にする — 食い違いは表に寄せる。
**DB に入る文字列（マスタ名称・取引先名・ロール名）は対象外** — 訳すのは
ハードコードされた UI 文言だけ。

Per-user display settings live on **`app.users`** — `locale` (shared with the
kiosk, which writes the same column) plus `date_format` / `time_format` /
`time_zone`. Edited at `/profile/preferences`; read via
`lib/user-preferences.ts` (`getCurrentPreferences()`, `cache()`d per request).
Timestamps stay **UTC in the DB** — `time_zone` only changes how they are read
back for display.

**UI strings — `next-intl`, without i18n routing.** The language comes from the
user's DB setting, not the URL. `src/i18n/request.ts` (`getRequestConfig`) reads
the preferences and returns `locale` / `messages` / `timeZone`;
`next.config.ts` wires it with `createNextIntlPlugin`. Catalogs are
`messages/{ja,en,zh}.json` — **ja is the source of truth**, and `src/global.d.ts`
augments `AppConfig["Messages"]` with `typeof ja` so a wrong key fails the build.
Server: `await getTranslations("shell")`. Client: `useTranslations("shell")`.
`NextIntlClientProvider` is mounted in the **`(dashboard)` layout only** — do not
move it to the root layout, or the public `/manual` pages lose static rendering
(the request config touches the session).

**Migration status: most screens still have Japanese hard-coded in JSX**, and
that's fine — they render Japanese regardless of the setting. Move strings into
`messages/*.json` as you touch a screen; keep `messages/*.json` key-identical
across the three languages (`lib/user-preferences-core.test.ts` enforces it).

**Dates/times are NOT next-intl's job here.** The user picks an explicit order
(`YYYY/MM/DD` … `MM/DD/YYYY`) which no `Intl` option expresses, so `lib/format.ts`
owns it: `createFormatters(prefs)` → `useFormat()` (client) /
`getServerFormatters()` (server); plain helpers take `Formatters` as an argument.
Never keep "current user" in module state — on the server that leaks across
requests. **PDFs and mail use `documentFormatters`** (JST, fixed): a finished
document must not change with whoever opens it. **The document's *language* is the
recipient's**, not the viewer's — 見積書 / 納品書 / 請求書 render in the partner's
configured language and fall back to the default (ja) when unset (glossary §2.7,
decided 2026-08-30; the partner-language column and the multilingual templates are
not built yet).

`lib/i18n/index.ts` keeps only locale identity (`LOCALES`, `normalizeLocale`,
`INTL_LOCALES`) — no messages; those belong to next-intl. The kiosk app keeps its
own tiny in-house dictionary (`nextjs-kiosk/src/lib/i18n`) — it is not worth a
dependency there, so the two apps deliberately differ.

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
  `/api/avatars`, `/api/floor-maps/[mapId]/image`.
- **A second, quieter cap: the proxy** — every request body passes through
  `proxy.ts`, and Next caps what it buffers (default **10MB**). Over that, the
  body is silently **truncated** — you get a corrupt file plus one server log
  line (`Request body exceeded 10MB … Only the first 10MB will be available`),
  not an error. `experimental.proxyClientMaxBodySize` in `next.config.ts` is set
  above the largest per-handler limit (attachments / intake = 20MB) for that
  reason; raise it before raising any `MAX_*_BYTES`, and keep rejecting
  oversized files in the handler itself.
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
