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
  `FormSection`s + submit/cancel row. `FormSection` = one bordered `Paper`
  (title + divider + fields). **Don't wrap `FormSection` in another `Paper`**
  (double card).
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
  `PdfAttachmentPanel`.
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
