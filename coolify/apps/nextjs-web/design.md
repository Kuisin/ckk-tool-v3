# nextjs-web — design & UI conventions

The **exhaustive** design spec (tokens, page anatomy, status-color map,
terminology, accessibility) is `../../_specs/design.md` — read it for the "what".
This file is the "where": the actual in-repo component system you build UI from.
Stack: **Mantine v9** + `mantine-datatable`-style custom `DataTable` + Tabler icons.

## Golden rules

- **Never use a raw Mantine `<Button>`** in feature code — use the named
  components in `components/ui/buttons.tsx`. Size is `sm` everywhere (theme
  default); don't pass `size`.
- **Never build a list/detail/form page by hand** — compose the shells in
  `components/ui/shells.tsx` + `PageHeader`. One consistent shell drives ~all
  screens.
- Reference **semantic tokens**, not hardcoded colors/spacing (Mantine theme vars).
- `withinPortal` on every Popover/Menu/Modal; keep Mantine focus rings; `aria-label`
  on icon-only `ActionIcon`.
- Responsive branch with `useIsMobile()` (`hooks/useViewport.ts`), never a raw
  media query in JS — avoids SSR mismatch. Breakpoints: `sm` 768, `lg` 1024.
  Desktop-first, except the step-execution screen (tablet-first).

## Theme

`src/app/layout.tsx` → `MantineProvider` with `createTheme({ primaryColor: 'blue',
defaultRadius: 'sm', fontFamily: 'Noto Sans JP…' })` and global `size: 'sm'`
defaults for Button/inputs/Badge/Table. Light/dark via
`lib/mantine-color-scheme-script.ts`; switch logos with
`useComputedColorScheme(...)` (never `useColorScheme` — SSR flash).

## Buttons — `components/ui/buttons.tsx`

Role: `PrimaryButton` `SecondaryButton` `GhostButton` `DangerButton`.
Action (label+icon+role baked in): `SaveButton` (`type=submit`, 保存/💾),
`CancelButton`, `CreateButton` (新規作成/＋), `EditButton`, `CopyButton`,
`DeleteButton`, `ApproveButton`, `RejectButton`. Plus `PdfButton`
(`ui/PdfButton.tsx`), `NewButton`. All accept any Mantine Button prop **plus**
`href` (renders a Next `<Link>`) and `external` (new-tab `<a>`).

## Page shells — `components/ui/shells.tsx`

- `ListShell` — filter bar `Paper` + `DataTable`, header + create action.
- `DetailShell` — `PageHeader` + `SummaryGrid` + `Tabs` + `ResourceActions`
  (edit/pdf/copy/cancel menu; collapses to a `…` menu on mobile).
- `FormShell` — `PageHeader` + `<form>` + `LoadingOverlay` + stacked
  `FormSection`s + `FormActions`. `FormSection` = one bordered `Paper`
  (title + divider + fields). **Don't wrap `FormSection` in another `Paper`**
  (double card).
- `FormActions` — **the only place a 保存 button may live.** Never put
  保存/キャンセル in `PageHeader actions` (that row is for detail-screen actions:
  編集 / PDF / ⋯). It renders キャンセル + 保存 itself and pins them to the bottom
  of the viewport on desktop (sticky, `globals.css .form-actions`), so the
  buttons stay visible however long the form is; mobile stacks them full-width
  at the end of the body (the soft keyboard already owns the screen bottom):

  ```tsx
  <FormActions loading={isPending} onCancel={back} onSave={save} />   // 独自フォーム
  <FormActions loading={isPending} onCancel={back} />                 // <form> 送信（type=submit）
  ```

  `FormShell` uses it automatically. Screens that build their own form (試算 /
  受注請書ドラフト / 材種の既定単価 / キオスク設定 …) call it directly — pass
  `children` only when the button set really differs.
- `PageHeader` (`ui/PageHeader.tsx`) — breadcrumbs (desktop) / **mobile "← back"
  link to the nearest linkable parent** / `order={2→3}` title / status / actions.
- `PlaceholderPage` for un-built routes.

## Lists — `components/ui/DataTable.tsx`

One generic table for every index screen: client sorting, pagination (page-size +
range), row selection + bulk-action bar, per-row action menu, column-visibility
toggle, **drag-to-resize columns + single-line truncate** (`Column.truncate:false`
to opt out), sticky header, row-click → detail, and a mobile divider-row list
(`renderCard` or the default two-line card). Set `urlState` on the **one** primary
table per screen (page/size/sort in the URL); never on a sub-table in a detail tab.

## Display & inputs

- Status/enums: `StatusBadge` (enum→color per `_specs/design.md §9`), `ActiveBadge`.
- Values: `FieldValue`, `MoneyText`, `JsonLocalizedText` (`{ja,en}` renderer),
  `DocNumber` (`ff="mono"` doc numbers), `EmptyState`, `HelpLabel`.
- Panels: `HistoryPanel` (audit timeline), `AttachmentsPanel` /
  `PdfAttachmentPanel`, `MemoPanel` (メモ / コメント — 下記）,
  `ProcedurePanel` (手続き状況 — 下記）。
- 進捗表示: **`ProcedurePanel` が唯一の書類進捗カード**（`_specs/design.md §12.10`）。
  ライフサイクルのある 12 書類すべてが同じ形・同じ位置（ActionCard → サマリ →
  **手続き状況** → タブ）で載せる。**画面に生の `<Stepper>` を書かないこと** —
  以前は表示が 3 通りに割れ、`approvalStepDescription` が 4 ファイルに重複して
  いた。前後関係は `sourceGroups`（前の書類から）/ `handoffGroups`（次の書類へ）で
  渡す。承認段は `approvalStage()` を使い、文言は `lib/approval-flow.ts` の
  `approvalStepDescription` が唯一の定義（段数は承認設定 MS0B が決めるため）。
- Rich text: `MemoPanel` を詳細画面の Tabs に 1 枚差すだけで社内メモ
  （`mode="memo"` = 1 文書 1 件）またはコメントスレッド（`mode="comment"`）が付く。
  データは `lib/document-memos.listMemos(ownerType, ownerId)` を `page.tsx` で
  取って渡す（owner キーは `fetchAuditEntries` と同じ値）。パネルのタブは
  **`keepMounted={false}`** にすること — エディタ（prosemirror, ~426KB）を
  タブを開くまで読み込ませないため。表示専用は `RichTextView`、入力は
  `RichTextEditorField`（`@mantine/tiptap`）。本文は HTML ではなく
  **ProseMirror JSON** で保存し、`lib/rich-text-core.ts` が許可リスト検証・
  平文射影・HTML 化を担う。
- 閲覧⇄編集: **`EditablePanel`**（`_specs/design.md §10.10`）。タブやセクションを
  「既定は閲覧、押して編集」にする枠。**タブを編集フォームで開かないこと** —
  読みに来ただけの人に編集画面が開いていると、いま何が設定されているのかが
  読めない。`view` に読める形を、`edit` に既存のエディタを渡す。保存 /
  キャンセルの行は**編集側**が `FormActions` で持ち、渡された `close` を呼んで
  閲覧へ戻す。閉じるとエディタはアンマウントされるので、キャンセルの復元処理は
  書かなくてよい（props からドラフトを作るエディタなら自動で元に戻る）。
  既定で画面遷移するキャンセルを持つエディタ（`ApprovalFlowEditor`）には
  **必ず `onCancel` を渡す**。
- Selects: `SearchSelect` (async option search), `F4SearchModal` + `f4-presets.ts`
  (F4 master lookup), `CustomerSelect`/`FactorySelect` (two-level).
- Destructive confirm: `openConfirm` (`ui/modals.tsx`, wraps `@mantine/modals`)
  with `confirmProps={{ color: 'red' }}`. Use toasts (`@mantine/notifications`)
  for success/error, **not** for confirms or field errors.

## Forms

`@mantine/form` + `zodResolver` (`lib/form.ts`). Submit calls a Server Action;
branch on `ActionResult.ok`, `notifications.show`, navigate to the **detail** page
on success. `withAsterisk` for required; money = `NumberInput prefix="¥"
thousandSeparator=","`; dates = `DatePickerInput valueFormat="YYYY/MM/DD"` locale
`ja`; `searchable`/`clearable` per `_specs/design.md §15`. For admin JS-expression
editing use `components/settings/CodeExpressionEditor.tsx` (dep-free highlight +
clickable variable palette + format).

## Icons — `lib/icons.ts`

`app-list.ts` stores icon **names** (strings); components resolve via `ICON_MAP`.
Register a new Tabler icon there (import + map entry) before referencing it.

## Adding a screen — checklist

1. Route under `app/(dashboard)/<domain>/` (+ `dynamic = "force-dynamic"` if it
   reads runtime data). 2. Build with `ListShell`/`DetailShell`/`FormShell`.
3. Reuse `ui/*` components; **no raw buttons/tables**. 4. Register the app in
   `app-list.ts` + `operation-codes.ts` (+ `settings-apps.ts` if it has settings,
   + `icons.ts` for a new icon). 5. Server Actions per `CLAUDE.md` (RBAC + zod +
   audit + `ActionResult`). 6. Match the terminology/status colors in
   `_specs/design.md`.
