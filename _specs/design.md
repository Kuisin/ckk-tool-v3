# Design

UI component structure and Mantine v9 design rules for the CKK manufacturing management system.

---

## 1. Design Tokens

All tokens are derived from Mantine's theme object. Reference semantic tokens in component code — never hardcode raw values.

### 1.1 Color

**Primitive palette** — Mantine's built-in 10-step color scales (`blue.0`–`blue.9`, etc.). Do not reference these directly in components; use semantic roles below.

**Semantic roles**

| Role | Mantine token | Usage |
|------|---------------|-------|
| `primary` | `blue` | CTAs, links, active states |
| `danger` | `red` | Destructive actions, error states |
| `success` | `green` | Completed states, confirmations |
| `warning` | `orange` | Partial states, caution |
| `info` | `violet` | In-progress / active production states |
| `surface` | `var(--mantine-color-body)` | Page background |
| `surface-alt` | `gray.0` (light) / `dark.8` (dark) | Main content area background |
| `border` | `var(--mantine-color-default-border)` | Dividers, table borders |
| `text-muted` | `dimmed` prop | Secondary / supporting text |
| `text-mono` | `ff="mono"` prop | Document numbers, codes |

**Category color map** — used for ThemeIcon and section headers throughout the app.

| Category | Color |
|----------|-------|
| 一般 | `indigo` |
| 販売 | `blue` |
| 購買 | `teal` |
| 生産 | `violet` |
| 出荷 | `orange` |
| 請求 | `pink` |
| マスタ | `gray` |
| ドキュメント | `cyan` |
| システム | `dark` |

**Unread notification accent** — `blue.5` left border (3px) on unread items.

### 1.2 Typography

```ts
fontFamily: "'Noto Sans JP', system-ui, -apple-system, sans-serif"
```

| Scale | Mantine prop | Usage |
|-------|-------------|-------|
| `xs` | `size="xs"` | Timestamps, labels, dimmed metadata |
| `sm` | `size="sm"` | Body text, table cells, form inputs |
| `md` | `size="md"` | (default, rarely used explicitly) |
| `lg` | `size="lg"` | Section titles when needed |
| Heading 2 | `<Title order={2}>` | Page title (desktop) |
| Heading 3 | `<Title order={3}>` | Page title (mobile), detail sub-titles |
| Heading 4 | `<Title order={4}>` | Form section labels |
| Heading 5 | `<Title order={5}>` | Card headings, panel titles |
| Heading 6 | `<Title order={6}>` | Notification panel title |

**Numeric/tabular figures** — apply `style={{ fontVariantNumeric: 'tabular-nums' }}` to operation codes, amounts, and counts.

**Monospace** — apply `ff="mono"` to all document numbers (QOT-/ORD-/DRN-/INV- etc.) and operation codes.

### 1.3 Spacing

Based on Mantine's 4px grid. Props: `gap`, `p`, `px`, `py`, `m`, `mx`, `my`.

| Token | Value | Common use |
|-------|-------|------------|
| `2xs` / `4` | 4px | Tight icon-label gaps, minor offsets |
| `xs` / `8` | 8px | Dense list row padding |
| `sm` / `12` | 12px | Filter bar gaps, card padding |
| `md` / `16` | 16px | Standard section padding, page padding |
| `lg` / `24` | 24px | Between major sections |
| `xl` / `32` | 32px | Between category groups |

### 1.4 Radius

| Token | Usage |
|-------|-------|
| `sm` (default) | Buttons, inputs, badges |
| `md` | Cards (Paper), app card grids, launcher icons |
| `xl` | Avatar circles |

`defaultRadius: 'sm'` is set globally in the theme.

### 1.5 Shadows / Elevation

| Token | Usage |
|-------|-------|
| `xs` | Filter bar Paper, form section Paper |
| `sm` | App card hover lift, menu shadow |
| `md` | Popover dropdowns (app launcher, notifications) |

Main content area: `boxShadow: '0 0 5px 0 light-dark(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.5))'`

### 1.6 Z-index Layers

Handled by Mantine internals. Do not set manual z-index values. Use `withinPortal` on all Popover / Modal / Menu components to ensure correct stacking.

### 1.7 Breakpoints

| Name | Value | Behavior |
|------|-------|----------|
| `sm` | 768px | Mobile → tablet transition |
| `lg` | 1024px | Tablet → desktop transition |

Pages are primarily desktop-first (≥ 1024px). The manufacturing step execution page is the exception — it is tablet-first.

**Viewport detection** — use `useIsMobile()` hook (from `src/hooks/useViewport.ts`) for JS-driven layout switches (column counts, button sizes). This avoids SSR mismatches on the preview and production app.

---

## 2. Mantine Theme Configuration

`src/app/layout.tsx` wraps the app in `MantineProvider` with the following theme:

```ts
createTheme({
  primaryColor: 'blue',
  defaultRadius: 'sm',
  fontFamily: "'Noto Sans JP', system-ui, -apple-system, sans-serif",
  components: {
    Button:          Button.extend({ defaultProps: { size: 'sm' } }),
    TextInput:       TextInput.extend({ defaultProps: { size: 'sm' } }),
    Select:          Select.extend({ defaultProps: { size: 'sm' } }),
    NumberInput:     NumberInput.extend({ defaultProps: { size: 'sm' } }),
    DatePickerInput: DatePickerInput.extend({ defaultProps: { size: 'sm' } }),
    Badge:           Badge.extend({ defaultProps: { size: 'sm', radius: 'sm' } }),
    Table:           Table.extend({
      defaultProps: {
        striped: true,
        highlightOnHover: true,
        withTableBorder: true,
        withColumnBorders: false,
      },
    }),
  },
})
```

---

## 3. AppShell Layout

The app uses a **header + footer** shell with **no sidebar**. Navigation is done via the AppLauncher popover (see §4) and the dashboard home page (see §5).

```
AppShell
├── AppShell.Header (height: 60, overflow: visible)
│   └── AppHeader (see §4.1)
├── AppShell.Main
│   style: boxShadow inner, backgroundColor: gray.0 / dark.8
│   └── <page content>
└── AppShell.Footer (height: 40)
    └── AppFooter (see §4.3)
```

File: `src/components/layout/AppShell.tsx` — `'use client'`

---

## 4. Shell Components

### 4.1 AppHeader

`src/components/layout/AppHeader.tsx` — `'use client'`

```
AppShell.Header
└── Group (h="100%", px="md", py="xs", justify="space-between", wrap="nowrap")
    ├── LEFT: Popover (app launcher)
    │   ├── Popover.Target → ActionIcon (CKK logo SVG, size="lg", variant="subtle", color="gray")
    │   │   light mode: /design-assets/logo.svg
    │   │   dark mode:  /design-assets/dark_logo.svg
    │   └── Popover.Dropdown (width=544, position="bottom-start", shadow="md", trapFocus)
    │       └── AppLauncher (see §5)
    ├── CENTER: OperationCodeJump (compact mode) — search input (see §6)
    └── RIGHT: Group (gap="xs")
        ├── Popover (notifications, width=320, position="bottom-end")
        │   ├── Popover.Target → ActionIcon
        │   │   └── Indicator (label=unreadCount, color="red", processing=true when >0)
        │   │       └── IconBell size={20}
        │   └── Popover.Dropdown (p=0) — notification panel
        │       ├── Group "通知" + "すべて既読" link
        │       ├── Divider
        │       └── ScrollArea mah={360}
        │           └── [per notification]
        │               Box (borderLeft: 3px blue.5 when unread, bg: blue.0 / gray.0)
        │               └── Group: Stack(title + message) + timestamp
        └── Menu (user menu, shadow="md", width=200, position="bottom-end")
            ├── Menu.Target → Avatar (size="sm", radius="xl", color="blue", initials)
            └── Menu.Dropdown
                ├── Menu.Label — Avatar(md) + displayName + department
                ├── Divider
                ├── Menu.Item プロフィール (IconUser) → /profile
                ├── Menu.Item 通知設定 (IconBell) → /profile/notifications
                ├── Menu.Item ホーム画面設定 (IconLayoutDashboard) → /profile/home
                ├── Divider
                └── Menu.Item ログアウト (IconLogout, color="red")
```

### 4.2 Dark mode logo switching

Use `useComputedColorScheme('light', { getInitialValueInEffect: false })` to switch between light and dark logo variants. Never use `useColorScheme()` (causes SSR flash).

### 4.3 AppFooter

`src/components/layout/AppFooter.tsx` — `'use client'`

```
AppShell.Footer (paddingBottom: env(safe-area-inset-bottom, 0px))
└── Group (h="100%", px="md", justify="center", gap="lg")
    ├── Text size="xs" c="dimmed" — company name
    ├── Text size="xs" c="dimmed" — "v{NEXT_PUBLIC_APP_VERSION}"
    └── [dev only] Badge size="xs" color="orange" variant="outline" — "DEV"
```

---

## 5. AppLauncher

`src/components/layout/AppLauncher.tsx` — `'use client'`

Opened via the header logo button Popover (§4.1). Contains app grid organized by category plus operation code search.

```
Stack (gap="sm", w="100%")
├── Group (wrap="nowrap", align="stretch", px="xs")
│   ├── UnstyledButton (home icon) → navigate to /
│   └── TextInput (placeholder="操作コード / アプリ名...", leftSection=IconSearch, autoFocus)
├── Divider
└── ScrollArea.Autosize (mah={420})
    ├── [when searching] search results list
    │   └── [per result] UnstyledButton → Group(ThemeIcon + code + label + category)
    └── [default] app grid by category
        └── [per category] Stack
            ├── Group — ThemeIcon(variant="light", category color, size="md") + Title order={5} c="dimmed"
            ├── SimpleGrid cols={3} spacing="sm"
            │   └── [per app] UnstyledButton.appCard
            │       └── Paper (withBorder, radius="md", p="md")
            │           └── Stack align="center"
            │               ├── ThemeIcon (variant="light", category color, size="xl", radius="md")
            │               │   └── <AppIcon size={28} />
            │               ├── Text size="sm" ta="center" fw={500} lh={1.3} — label
            │               └── Text size="xs" c="dimmed" tabular-nums — operationCode
            └── Divider mt="xs" (between categories)
```

**App card hover** (CSS module `AppLauncher.module.css`):
```css
.appCard:hover { background: var(--mantine-color-gray-0); border-radius: var(--mantine-radius-md); }
```

---

## 6. Operation Codes

Operation codes provide keyboard-shortcut navigation. Format: `{CAT}{MODE}{IDX}` (4 characters).

| Part | Position | Values |
|------|----------|--------|
| CAT | 1–2 | `CM` `SA` `PU` `PD` `SH` `BL` `MS` `DC` `SY` |
| MODE | 3 | `0`=list `1`=new `2`=detail |
| IDX | 4 | `1`–`9`, `A`–`Z` |

**Full table** — 実装の正は `coolify/apps/nextjs-web/src/lib/app-list.ts`
（コードの組み立ては `src/lib/operation-codes.ts`）。`design-preview/` 配下は
デザイン確認用の複製なので、参照しないこと。

| Category | IDX | Base label | list | new | detail |
|----------|-----|-----------|------|-----|--------|
| 共通 | — | ダッシュボード | CM00 | — | — |
| 一般 | 1 | 承認・予定 | CM01 | — | — |
| 販売 | 1 | 試算 | SA01 | SA11 | SA21 |
| 販売 | 2 | 価格表 | SA02 | SA12 | SA22 |
| 販売 | 3 | 見積書 | SA03 | SA13 | SA23 |
| 販売 | 4 | 注文請書 | SA04 | SA14 | SA24 |
| 販売 | 5 | 注文明細 | SA05 | — | SA25 |
| 販売 | 6 | 設計依頼書 | SA06 | SA16 | SA26 |
| 購買 | 1 | 購買依頼 | PU01 | PU11 | PU21 |
| 購買 | 2 | 素材発注書 | PU02 | PU12 | PU22 |
| 購買 | 3 | 素材入荷 | PU03 | PU13 | PU23 |
| 購買 | 4 | 外注依頼 | PU04 | PU14 | PU24 |
| 生産 | 2 | 指示書 | PD02 | PD12 | PD22 |
| 生産 | 4 | 在庫管理 | PD04 | — | — |
| 生産 | 5 | 未処理指示書 | PD05 | — | — |
| 出荷 | 1 | 出荷書 | SH01 | SH11 | SH21 |
| 出荷 | 2 | 納品書 | SH02 | SH12 | SH22 |
| 出荷 | 3 | 未処理出荷書 | SH03 | — | — |
| 請求 | 1 | 請求書 | BL01 | BL11 | BL21 |
| 請求 | 2 | 締日処理 | BL02 | BL12 | BL22 |
| マスタ | 1 | 取引先 | MS01 | MS11 | MS21 |
| マスタ | 4 | 製品 | MS04 | MS14 | MS24 |
| マスタ | 5 | 材種 | MS05 | MS15 | MS25 |
| マスタ | 6 | 素材 | MS06 | MS16 | MS26 |
| マスタ | 7 | 採番構成 | MS07 | — | — |
| マスタ | 8 | 工程マスタ | MS08 | MS18 | MS28 |
| マスタ | 9 | 検査表テンプレート | MS09 | MS19 | MS29 |
| マスタ | A | 不良種類 | MS0A | MS1A | MS2A |
| マスタ | B | 承認設定 | MS0B | MS1B | MS2B |
| マスタ | C | 拠点 | MS0C | MS1C | MS2C |
| マスタ | D | 作業場所 | MS0D | — | — |
| マスタ | E | 保管場所 | MS0E | — | — |
| ドキュメント | 1 | マニュアル | DC01 | — | — |
| ドキュメント | 2 | 管理マニュアル | DC02 | — | — |
| システム | 1 | ユーザー管理 | SY01 | — | — |
| システム | 2 | 試算計算 | SY02 | — | — |
| システム | 3 | 製品項目 | SY03 | — | — |
| システム | 4 | 製品種別 | SY04 | — | — |
| システム | 5 | アプリ管理 | SY05 | — | — |
| システム | 6 | ファイル管理 | SY06 | — | — |
| システム | 7 | 操作履歴 | SY07 | — | — |
| システム | 8 | QRカード管理 | SY08 | — | — |
| システム | 9 | 端末管理 | SY09 | — | — |
| システム | A | キオスク設定 | SY0A | — | — |
| システム | B | リンク管理 | SY0B | — | — |
| システム | C | 注文書取込 | SY0C | — | — |
| システム | D | ログイン履歴 | SY0D | — | — |

> `CM00`（ダッシュボード）は**アプリ一覧（`lib/app-list.ts`）には登録されて
> いない** — ホーム自体だから。ランチャーに出るアプリの正は常に
> `lib/app-list.ts`。
>
> `PD03` / `PD13` / `PD23` は**欠番**。旧 承認管理 は 一般カテゴリの
> 承認・予定（`CM01`, `/general/tasks` — 自分の作業予定 + 承認待ちの
> 横断一覧）へ移設した。旧 `/production/approvals` はリダイレクト。
>
> `PD01` / `PD11` / `PD21` は**欠番**。旧 注文請書 は注文請書の明細に統合され、
> 注文明細（`SA05`）として販売カテゴリへ移った。注文明細は新規・編集画面を
> 持たない（作成は注文請書の明細エディタ）ため `SA15` も欠番で、一覧 `SA05` と
> 詳細 `SA25` だけを登録する。

`OperationCodeJump` component (`src/components/layout/OperationCodeJump.tsx`) renders as a compact TextInput in the header center. Pressing Enter or clicking a result navigates to that screen.

---

## 7. Dashboard — HomeApps

`src/app/(dashboard)/page.tsx` (server component) + `src/components/home/HomeApps.tsx` (`'use client'`)

```
Stack (gap="xl", p="md", maw={1200})
├── Card (withBorder, shadow="xs", radius="md", padding="lg") — user profile
│   └── Group (justify="space-between", align="flex-start", wrap="nowrap")
│       ├── Group
│       │   ├── Avatar (size=72, radius="xl", color="blue") — initials or image
│       │   └── Stack gap={4}
│       │       ├── Title order={3} — displayName
│       │       ├── Text size="sm" c="dimmed" — username
│       │       └── Badge variant="light" color="blue" size="sm" — department
│       └── img (company logo SVG, h=56, opacity=0.75)
│           light: /design-assets/logo-with-label.svg
│           dark:  /design-assets/dark_logo-with-label.svg
├── [if starred apps] Stack gap="sm" — お気に入り section（ホーム画面設定 /profile/home で選択。
│   yellow IconStarFilled section icon; app cards identical to category cards; Divider after）
└── [per section] Stack gap="sm" — 標準モード: カテゴリ別 / カスタムモード: ユーザー定義グループ別
    （custom group sections use IconLayoutDashboard + color blue; 未所属アプリは「その他」）
    ├── Group gap="xs" — section header
    │   ├── ThemeIcon variant="light" color={category.color} size="sm" radius="sm"
    │   │   └── <CategoryIcon size={14} />
    │   └── Title order={5} c="dimmed" — category name
    ├── SimpleGrid cols={isMobile ? 2 : 4} spacing="sm"
    │   └── [per app] UnstyledButton.appCard
    │       └── Paper (withBorder, radius="md", p="md", h="100%")
    │           └── Stack align="center" gap="sm"
    │               ├── ThemeIcon (variant="light", color={category.color}, size={56}, radius="md")
    │               │   └── <AppIcon size={28} />
    │               ├── Text size="sm" ta="center" fw={500} lh={1.3} — label
    │               └── Text size="xs" c="dimmed" tabular-nums — operationCode
    └── Divider mt="xs" (between categories, not after last)
```

**App card hover** (CSS module `HomeApps.module.css`):
```css
.appCard { transition: transform 120ms ease, box-shadow 120ms ease; }
.appCard:hover { transform: translateY(-2px); box-shadow: var(--mantine-shadow-sm); }
@media (prefers-reduced-motion: reduce) { .appCard { transition: none; } }
```

**App icon map** — icons from `@tabler/icons-react`:

| App | Icon |
|-----|------|
| 試算 | `IconCalculator` |
| 価格表 | `IconCurrencyYen` |
| 見積書 | `IconFileText` |
| 注文請書 | `IconClipboardCheck` |
| 設計依頼書 | `IconRuler2` |
| 試算 | `IconCalculator` |
| 素材入荷 | `IconPackageImport` |
| 外注依頼 | `IconTruckDelivery` |
| 素材発注書 | `IconShoppingCart` |
| 指示書 | `IconSettings2` |
| 未処理指示書 | `IconProgress` |
| 承認・予定 | `IconClipboardList` |
| 製品在庫 | `IconBoxSeam` |
| 素材在庫 | `IconStack2` |
| 出荷書 | `IconTruck` |
| 未処理出荷書 | `IconTruckLoading` |
| 納品書 | `IconReceipt` |
| 請求書 | `IconFileInvoice` |
| 締日処理 | `IconCalendarDue` |
| 取引先 | `IconBuilding` |
| 製品 | `IconCylinder` |
| 材種 | `IconAtom` |
| 素材 | `IconBolt` |
| 工程マスタ | `IconGitBranch` |
| 検査表テンプレート | `IconListCheck` |
| 不良種類 | `IconAlertTriangle` |
| 承認設定 | `IconUsersGroup` |
| 拠点 | `IconBuildingWarehouse` |
| ユーザー管理 | `IconUserCog` |
| 試算計算 | `IconMathFunction` |
| 製品項目 | `IconListDetails` |
| 製品種別 | `IconCategory` |
| アプリ管理 | `IconLayoutGrid` |
| ファイル管理 | `IconFolder` |
| 操作履歴 | `IconHistory` |
| QRカード管理 | `IconQrcode` |
| 端末管理 | `IconDeviceTablet` |
| 注文書取込 | `IconFileImport` |
| ログイン履歴 | `IconShieldLock` |
| マニュアル | `IconBook2` |

---

## 8. Page Patterns

All pages live inside `src/app/(dashboard)/`. Each page uses server components by default; interactive parts are extracted into `'use client'` components.

### 8.1 List Page

Used for every index route (`page.tsx`). Responsive: filter bar stacks on mobile; on mobile the table becomes a divider-separated row list (no per-row cards).

```
Stack (gap="md")
├── Group (justify="space-between", align="flex-end", wrap="nowrap")
│   ├── Stack (gap=2, minWidth=0)
│   │   ├── [desktop only] Breadcrumbs
│   │   │   └── Text size="sm" per segment
│   │   └── Title order={isMobile ? 3 : 2}
│   └── Button leftSection=<IconPlus> size="sm"
│       text: isMobile ? "新規" : "新規作成"
├── Paper (shadow="xs", p="sm")
│   ├── [mobile filter bar] Stack gap="xs" mb="sm"
│   │   ├── TextInput (search, leftSection=<IconSearch size={14}>)
│   │   └── Group gap="xs"
│   │       ├── Select[] (status / other filters, flex=1, clearable)
│   │       └── Button variant="subtle" size="sm" — リセット
│   ├── [desktop filter bar] Group mb="sm" align="flex-end"
│   │   ├── TextInput (flex=1, search)
│   │   ├── Select[] (w={160}, clearable)
│   │   └── Button variant="subtle" — リセット
│   ├── [mobile] DataTable row list — Stack gap={0}, rows split by <Divider>
│   │       each row: Group [Checkbox (left of title, when selectable)] + content
│   └── [desktop] DataTable (mantine-datatable) or DesktopTable
│       columns: defined per section in §14
│       totalRecords / page / onPageChange (URL search params)
└── [empty state] Center > Stack align="center"
    ├── ThemeIcon size="xl" variant="light" color="gray"
    ├── Text c="dimmed" size="sm"
    └── Button variant="subtle" size="sm"
```

**Mobile row pattern** — rows are divider-separated (no card chrome). When
selectable, the checkbox sits to the left of the row title. Each record renders as:
```
Box
├── [if not first] Divider
└── Group (gap="sm", py="sm", wrap="nowrap", align="flex-start")
    ├── [selectable] Checkbox size="xs" mt={2}   ← left of the title
    └── Box (flex-1, min-w-0, cursor="pointer")
        └── Group (justify="space-between", wrap="nowrap", align="flex-start")
            ├── Stack gap={3} style={{ minWidth: 0 }}
            │   ├── Text size="xs" ff="mono" c="dimmed" — document number
            │   ├── Text size="sm" fw={600} truncate — primary field (customer, etc.)
            │   ├── Text size="xs" c="dimmed" truncate — secondary field
            │   └── Group gap="md" mt={2}
            │       ├── Text size="xs" c="dimmed" — quantity
            │       └── Text size="xs" fw={500} — amount
            └── Stack gap={4} align="flex-end" flexShrink=0
                ├── StatusBadge
                └── Text size="xs" c="dimmed" — date
```

Pagination and filters use URL search params — `'use client'` wrapper component holding filter bar + table/card-list.

Component path: `src/components/<section>/<EntityName>Table.tsx`

### 8.2 Detail Page

Used for every `[id]/page.tsx`.

```
Stack (gap="md")
├── Group (justify="space-between", align="flex-start", wrap="nowrap")
│   ├── Stack (gap=4, minWidth=0)
│   │   ├── [desktop only] Breadcrumbs
│   │   └── Group gap="sm" align="center" wrap="nowrap"
│   │       ├── Title order={isMobile ? 3 : 2} whiteSpace="nowrap"
│   │       └── StatusBadge (see §9)
│   └── [desktop] Group gap="xs" flexShrink=0
│       ├── Button variant="default" leftSection=<IconEdit size={14}>  → /edit
│       ├── Button variant="default" leftSection=<IconFileTypePdf size={14}> (PDF)
│       └── Menu shadow="sm"
│           └── Menu.Dropdown: コピー / Divider / キャンセル(red)
│   └── [mobile] Menu shadow="sm" position="bottom-end"
│       ├── Menu.Target → Button variant="default" px="xs" size="sm" → <IconDotsVertical>
│       └── Menu.Dropdown: 編集 / PDF / コピー / Divider / キャンセル(red)
├── [if an action is pending] ActionCard (see §10.9) — ヘッダー直下・最上部
├── Paper (withBorder, p="md", radius="md") — summary card
│   ├── SimpleGrid cols={isMobile ? 1 : 3} spacing="md"
│   │   └── FieldValue[] (see §10.1)
│   └── [mobile] Group gap="xl" mt="sm" — timestamps inline
├── [if has approval] ApprovalStatusPanel (see §12.4)
├── [if work order] WorkOrderStepsPanel (see §12.2)
├── Tabs defaultValue="items"
│   ├── Tabs.List
│   │   ├── Tabs.Tab value="items"    明細
│   │   ├── Tabs.Tab value="related"  関連
│   │   └── Tabs.Tab value="history"  履歴
│   ├── Tabs.Panel value="items" pt="md"
│   │   └── Table / DataTable (line items)
│   ├── Tabs.Panel value="related" pt="md"
│   │   └── related document links
│   └── Tabs.Panel value="history" pt="md"
│       └── AuditTimeline (see §12.1)
└── [desktop only] Divider + Group gap="xl"
    └── Text size="xs" c="dimmed" — 作成 / 更新 timestamps
```

### 8.3 Form Page (New / Edit)

Used for `new/page.tsx` and `[id]/edit/page.tsx`.

**After submit** — navigate to the record's **detail (view) page**, not back to the
list, for both create and edit (`router.push(\`{BASE_PATH}/{id}\`)`). On create use
the id returned by the Server Action (demo: a deterministic key, e.g. the price-list
`entryKey`). Modals that create a record (copy / duplicate / convert) follow the same
rule.

```
Stack (gap="md")
├── Group (justify="space-between", align="flex-end")
│   ├── Stack gap={2}
│   │   ├── [desktop only] Breadcrumbs
│   │   └── Title order={isMobile ? 3 : 2}
│   └── [edit only] StatusBadge
├── Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative"
│   └── LoadingOverlay visible={isPending}
│   ├── Paper (shadow="xs", p="md", radius="md") — Section 1
│   │   ├── Title order={4} mb="xs" (section label)
│   │   ├── Divider mb="md"
│   │   └── SimpleGrid cols={isMobile ? 1 : 2} spacing="sm"
│   │       └── TextInput / Select / DatePickerInput / NumberInput / Textarea
│   ├── Paper (shadow="xs", p="md", radius="md") — Section 2 (line items)
│   │   ├── Title order={4} mb="xs"
│   │   ├── Divider mb="md"
│   │   ├── [mobile] Stack gap="sm" — Paper cards per item
│   │   └── [desktop] Table (withTableBorder, withColumnBorders=false)
│   │       └── ... inline form inputs in table cells
│   │   ├── Button variant="subtle" leftSection=<IconPlus> mt="sm"
│   │   │   text: "明細を追加" / fullWidth on mobile
│   │   ├── Divider mt="sm"
│   │   └── Group justify="flex-end" mt="sm"
│   │       └── Text "合計金額" + fw={700} amount
│   └── [mobile] Stack gap="xs" — full-width stacked buttons
│       ├── Button type="submit" loading={isPending} fullWidth
│       └── Button variant="default" fullWidth — キャンセル
│   └── [desktop] FormActions — Group justify="flex-end"
│       ├── Button variant="default" — キャンセル
│       └── Button type="submit" loading={isPending} — 保存
```

**Action row placement** — 保存 / キャンセルは **必ずフォーム下部の
`FormActions`（`shells.tsx`）**。画面ヘッダー（`PageHeader` の `actions`）に
保存ボタンを置いてはいけない — あの行は詳細画面の操作（編集 / PDF / ⋯）専用。
デスクトップ（≥768px）では `position: sticky; bottom` で画面下端に貼り付き、
フォームがどれだけ長くてもキャンセル / 保存が常に見える（globals.css
`.form-actions`。`bottom` は固定 AppShell フッターぶんを
`--app-shell-footer-offset` で避ける）。モバイルは本文末尾に全幅で積む
（保存が上）— ソフトキーボードが画面下を占有するため。

`FormActions` はキャンセル / 保存の並びを自分で描画する:

```tsx
<FormActions loading={isPending} onCancel={back} onSave={save} />  // 独自フォーム（type="button"）
<FormActions loading={isPending} onCancel={back} />                 // <form> 送信（type="submit"）
```

`FormShell` は自動でこれを使う。`FormShell` を使わない画面（試算 SA11 /
受注請書ドラフト / 材種の既定単価 / キオスク設定 など）も同じ 1 行を置くこと。
ボタン構成そのものが違うときだけ `children` を渡して差し替える。

---

## 9. Status Badges

`src/components/ui/StatusBadge.tsx` — maps enum values to Mantine `Badge` colors.

| Entity | Status | Color | Japanese label |
|--------|--------|-------|----------------|
| Estimate | DRAFT | gray | 下書き |
| Estimate | CONFIRMED | blue | 確定 |
| Estimate | REGISTERED | green | 価格表登録済 |
| Quote | DRAFT | gray | 下書き |
| Quote | ISSUED | blue | 発行済 |
| Quote | ACCEPTED | green | 受諾済 |
| Quote | REJECTED | red | 却下 |
| Quote | EXPIRED | orange | 期限切れ |
| OrderAcceptanceIntake | IMPORT | gray | 取込中 |
| OrderAcceptanceIntake | DRAFT | blue | 下書き |
| OrderAcceptanceIntake | REQUESTED | yellow | 承認依頼中 |
| OrderAcceptanceIntake | APPROVED | green | 承認済 |
| OrderAcceptanceIntake | COMPLETED | teal | 展開済 |
| OrderAcceptanceIntake | ARCHIVED | dark | アーカイブ |
| SalesOrder | DRAFT | gray | 下書き |
| SalesOrder | CONFIRMED | blue | 確定 |
| SalesOrder | IN_PRODUCTION | violet | 製造中 |
| SalesOrder | PARTIAL_SHIPPED | orange | 一部出荷 |
| SalesOrder | SHIPPED | green | 出荷済 |
| SalesOrder | CANCELLED | red | キャンセル |
| WorkOrder | DRAFT | gray | 下書き |
| WorkOrder | PENDING_APPROVAL | yellow | 承認待ち |
| WorkOrder | APPROVED | blue | 承認済 |
| WorkOrder | IN_PROGRESS | violet | 進行中 |
| WorkOrder | COMPLETED | green | 完了 |
| WorkOrder | CANCELLED | red | キャンセル |
| WorkOrder (approval) | NONE | gray | — |
| WorkOrder (approval) | PENDING | yellow | 承認待ち |
| WorkOrder (approval) | APPROVED | green | 承認済 |
| WorkOrder (approval) | REJECTED | red | 差し戻し |
| StepStatus | PENDING | gray | 未着手 |
| StepStatus | IN_PROGRESS | blue | 進行中 |
| StepStatus | COMPLETED | green | 完了 |
| StepStatus | CANCELLED | red | キャンセル |
| DeliveryOrder | DRAFT | gray | 下書き |
| DeliveryOrder | CONFIRMED | blue | 確定 |
| DeliveryOrder | SHIPPED | green | 出荷済 |
| DeliveryNote | DRAFT | gray | 下書き |
| DeliveryNote | ISSUED | blue | 発行済 |
| DeliveryNote | DELIVERED | green | 納品済 |
| Invoice | DRAFT | gray | 下書き |
| Invoice | ISSUED | blue | 発行済 |
| Invoice | SENT | violet | 送付済 |
| Invoice | PAID | green | 支払済 |
| MaterialPurchaseOrder | DRAFT | gray | 下書き |
| MaterialPurchaseOrder | REQUESTED | yellow | 承認依頼中 |
| MaterialPurchaseOrder | APPROVED | blue | 承認済 |
| MaterialPurchaseOrder | ORDERED | violet | 発注済 |
| MaterialPurchaseOrder | COMPLETED | green | 入荷完了 |
| MaterialPurchaseOrder | CANCELLED | red | キャンセル |
| InspectionRecord | PENDING | gray | 未実施 |
| InspectionRecord | PASS | green | 合格 |
| InspectionRecord | FAIL | red | 不合格 |
| InspectionRecord | APPROVED | teal | 承認済 |
| DesignRequest | DRAFT | gray | 下書き |
| DesignRequest | REQUESTED | yellow | 承認依頼中 |
| DesignRequest | PENDING | blue | 未着手 |
| DesignRequest | IN_PROGRESS | violet | 進行中 |
| DesignRequest | COMPLETED | green | 完了 |
| DesignRequest | REJECTED | red | 差し戻し |
| DesignRequest | CANCELLED | red | キャンセル |
| BillingClosing | PENDING | gray | 未処理 |
| BillingClosing | PROCESSED | blue | 処理済 |
| BillingClosing | EXPORTED | green | エクスポート済 |

---

## 10. Common UI Components

### 10.1 FieldValue

`src/components/ui/FieldValue.tsx`

```tsx
// props: label: string, value: ReactNode, fullWidth?: boolean
// fullWidth = SummaryGrid の 1 行を丸ごと使う（備考など長い値）。
// 列数に依らず gridColumn: '1 / -1' なので、モバイルの 1 列でも崩れない。
<Stack gap={2} style={fullWidth ? { gridColumn: '1 / -1' } : undefined}>
  <Text size="xs" c="dimmed">{label}</Text>
  <Text size="sm" fw={500}>{value ?? '—'}</Text>
</Stack>
```

### 10.2 PageHeader

`src/components/ui/PageHeader.tsx`

```tsx
// props: title, breadcrumbs, actions, status?, isMobile?
<Group justify="space-between" align="flex-start">
  <Stack gap={4}>
    {!isMobile && <Breadcrumbs>{...}</Breadcrumbs>}
    <Group gap="sm" align="center" wrap="nowrap">
      <Title order={isMobile ? 3 : 2}>{title}</Title>
      {status && <StatusBadge status={status} />}
    </Group>
  </Stack>
  <Group>{actions}</Group>
</Group>
```

### 10.3 EmptyState

`src/components/ui/EmptyState.tsx`

```tsx
// props: icon, message, action?
<Center py="xl">
  <Stack align="center" gap="sm">
    <ThemeIcon size="xl" variant="light" color="gray">
      {icon}
    </ThemeIcon>
    <Text c="dimmed" size="sm">{message}</Text>
    {action}
  </Stack>
</Center>
```

### 10.4 ConfirmModal

`src/components/ui/ConfirmModal.tsx` — `'use client'`

Wraps `modals.openConfirmModal` from `@mantine/modals`. Used for all destructive actions.

```tsx
modals.openConfirmModal({
  title: 'キャンセルの確認',
  children: <Text size="sm">この操作は取り消せません。</Text>,
  labels: { confirm: '実行', cancel: '戻る' },
  confirmProps: { color: 'red' },
  onConfirm: () => action(),
})
```

### 10.5 PdfButton

`src/components/ui/PdfButton.tsx` — `'use client'`

```tsx
// props: href: string (API route), label?: string
<Button
  component="a"
  href={href}
  target="_blank"
  variant="default"
  leftSection={<IconFileTypePdf size={16} />}
>
  {label ?? 'PDF'}
</Button>
```

### 10.6 JsonLocalizedText

`src/components/ui/JsonLocalizedText.tsx`

```tsx
// props: value: { ja: string; en: string } | null
const { locale } = useLocale()
return <>{value?.[locale] ?? value?.ja ?? '—'}</>
```

### 10.7 MoneyText

`src/components/ui/MoneyText.tsx`

```tsx
// props: value: number | null, currency?: string
new Intl.NumberFormat('ja-JP', { style: 'currency', currency: currency ?? 'JPY' }).format(value)
```

### 10.8 MemoPanel / RichTextEditorField / RichTextView

社内向けリッチテキストの メモ（1 文書 1 件）と コメント（投稿スレッド）。
詳細画面の `Tabs` にタブ 1 枚 + パネル 1 枚を足すだけで付く。

| コンポーネント | ファイル | 役割 |
|---|---|---|
| `MemoPanel` | `src/components/ui/MemoPanel.tsx` | `mode="memo"` = 共有メモ（誰でも編集）/ `mode="comment"` = 投稿スレッド（投稿者本人 + ADMIN のみ編集・削除） |
| `RichTextEditorField` | `src/components/ui/RichTextEditorField.tsx` | `@mantine/tiptap` ラッパ。太字 / 斜体 / 下線 / 打消 / コード / H3・H4 / 箇条書き / 番号付き / 引用 / コードブロック / 区切り線 / リンク |
| `RichTextView` | `src/components/ui/RichTextView.tsx` | 読み取り専用表示。React 要素を組み立てる（`dangerouslySetInnerHTML` 不使用） |

搭載画面: 見積書 / 注文明細 / 指示書 / 出荷書 / 請求書 = **メモ**、
価格表 / 試算 = **コメント**。既存の 備考（`notes`）は平文のまま別物として残り、
PDF 印字も従来どおり（メモ・コメントは社内限定で PDF に出ない）。

```tsx
// page.tsx（owner キーは fetchAuditEntries に渡す値と同一）
const memos = await listMemos("quotes", formatQuoteNumber(key));

// *Detail.tsx — keepMounted={false} でエディタをタブを開くまで遅延ロード
<Tabs.Tab value="memo">メモ</Tabs.Tab>
<Tabs.Panel keepMounted={false} pt="md" value="memo">
  <MemoPanel memos={memos} mode="memo" ownerId={quote.quoteNumber} ownerType="quotes" />
</Tabs.Panel>
```

本文は HTML 文字列ではなく **ProseMirror ドキュメント JSON** で
`app.document_memos` に保存する（保存 XSS を構造的に排除するため）。検証・
平文射影・HTML 化は `src/lib/rich-text-core.ts`、読み書きは
`src/lib/document-memos.ts`（`MEMO_OWNERS` が owner→権限コードの唯一の登録簿）。

### 10.9 ActionCard

`src/components/ui/ActionCard.tsx` — `'use client'`

書類詳細の**最上部**（ヘッダー直下・サマリより上）に 1 枚だけ出す「いま何を
すべきか」カード。承認フローの操作は以前 Stepper の下のボタン行にあり見落とさ
れやすかったため、状態と操作をここへまとめる。フロー（Stepper）のパネルは
表示専用に残る。

```
Paper (withBorder, p="md", radius="md")
  style: borderLeft 4px solid {color}-filled / backgroundColor {color}-light
└── Group (justify="space-between", wrap={isMobile ? "wrap" : "nowrap"})
    ├── Group gap="sm"
    │   ├── ThemeIcon (variant="light", color, size="lg", radius="md")
    │   └── Stack gap={2} — Text fw={600} size="sm" (title)
    │                     + Text c="dimmed" size="xs" (description)
    └── Group gap="xs" — 操作ボタン（無い状態は省略可）
```

**tone — 色はログイン中ユーザーの権限で決まる**

| tone | 色 | 意味 |
|------|----|------|
| `action` | blue | 自分で先へ進められる操作（承認依頼・注文確定・発注・入荷完了 …） |
| `approve` | green | 承認権限がある。承認 / 差し戻しできる |
| `wait` | gray | 権限が無いので待つだけ。タイトルは「承認待ち」 |
| `alert` | red | 差し戻しなど、対応が必要な状態 |

搭載画面: 指示書 (`WorkOrderApprovalCard`) / 注文請書 / 素材発注書 / 購買依頼。

---

## 11. Components: Variants and States

| Component | Variants | Required states |
|-----------|----------|-----------------|
| Button | `filled` (primary CTA), `default` (secondary), `subtle` (tertiary/ghost) | default, hover, focus, disabled, loading |
| TextInput | — | default, hover, focus, error, disabled |
| Select | — | default, hover, focus, error, disabled, loading |
| NumberInput | — | default, hover, focus, error, disabled |
| DatePickerInput | — | default, hover, focus, error, disabled |
| Badge | — (status colors per §9) | — |
| ThemeIcon | `light` (default for icons), `filled` (avoid in lists — too bold) | — |
| Paper | `withBorder` (detail/card), `shadow="xs"` (filter bar, form section) | — |
| Avatar | initials fallback when no `src` | — |

**Button loading state** — always use `loading={isPending}` from `useTransition`. Never disable the button without loading state; users need feedback.

### 11.1 Button components (global design system)

Never use a raw Mantine `<Button>` in feature code. Use the named components in
`src/components/ui/buttons.tsx`, which encode the variants above so every button
stays consistent. Size is `sm` everywhere (theme default) — do not pass `size`.

**Role buttons** — semantic wrappers over the §11 variants:

| Component | Variant | Use |
|-----------|---------|-----|
| `PrimaryButton` | `filled` | primary CTA |
| `SecondaryButton` | `default` | secondary action |
| `GhostButton` | `subtle` | tertiary / ghost (e.g. リセット) |
| `DangerButton` | `filled` red | destructive CTA |

**Action buttons** — recurring actions with label + icon + role baked in (label
overridable via children):

| Component | Built on | Default label / icon |
|-----------|----------|----------------------|
| `SaveButton` | Primary | 保存 / `IconDeviceFloppy` (`type="submit"`) |
| `CancelButton` | Secondary | キャンセル |
| `CreateButton` | Primary | 新規作成 / `IconPlus` |
| `EditButton` | Secondary | 編集 / `IconEdit` |
| `CopyButton` | Secondary | 複製 / `IconCopy` |
| `DeleteButton` | Danger | 削除 / `IconTrash` |
| `ApproveButton` | Primary green | 承認 / `IconCheck` |
| `RejectButton` | `outline` red | 差し戻し / `IconArrowBackUp` |
| `PdfButton` (`PdfButton.tsx`) | Secondary | PDF / `IconFileTypePdf` (external link) |

All accept any Mantine Button prop (`loading`, `disabled`, `fullWidth`, `onClick`,
`leftSection` override …) plus `href` (renders a Next.js `<Link>`) and `external`
(new-tab `<a>`). The shared shells (`shells.tsx`, `modals.tsx`) and `NewButton`
are built on these, so most screens get the design for free.

**Form field error state** — errors appear below the input as `Text size="xs" c="red"`. Mantine `@mantine/form` with `zodResolver` handles this automatically.

---

## 12. Section-Specific Components

### 12.1 AuditTimeline

`src/components/production/AuditTimeline.tsx`

```
Timeline (active={-1}, bulletSize={28}, lineWidth={2})
└── Timeline.Item (per audit_log row, reverse-chronological)
    bullet: Text size="xs" fw={700} — first character of user name
    title: action (CREATE / UPDATE / DELETE)
    ├── Text size="xs" c="dimmed" — timestamp + user
    └── Text size="sm" mt={4} — change detail / before_data → after_data diff
```

### 12.2 WorkOrderStepsPanel

`src/components/production/WorkOrderStepsPanel.tsx` — `'use client'`

```
Paper (withBorder, p="md", radius="md")
├── Group justify="space-between" mb="sm"
│   ├── Title order={5} "工程ワークフロー"
│   └── [if APPROVED or IN_PROGRESS] Anchor "工程実行ビューを開く"
└── Grid gap="md"  — 2 ペイン（デスクトップは余白を情報で埋める）
    ├── Grid.Col span={{ base: 12, lg: 7 }} — 工程リスト
    │   ├── [lg 未満のみ] SecondaryButton トグル + Collapse — フロー図の折りたたみ表示
    │   └── Stack gap="xs" — メインライン工程の StepCard 列（sortOrder 順）
    │       └── [分岐系列] 分岐元カード直下にネスト Paper（左 3px orange アクセント + ml="md"）
    │           ├── Group — IconArrowsSplit + "分岐系列" + Badge 数量 + [Badge 合流 → 工程名]
    │           │   └── [全工程 PENDING かつ実行可能] ActionIcon(red) 削除 → openConfirm → removeBranch
    │           └── Stack gap="xs" — 系列内 StepCard（分岐 off 分岐は再帰ネスト）
    └── Grid.Col span={{ base: 12, lg: 5 }} visibleFrom="lg" — フロー図（sticky top:76）
        └── WorkflowGraph — 縦型フローキャンバス（直列でも常時表示）
            `src/components/production/WorkflowGraph.tsx`（next/dynamic + ssr:false の
            薄い入口）→ `WorkflowGraphCanvas.tsx`（React Flow / @xyflow/react）。
            layer→Y（フロー方向）、レーン→X（メインライン=0 / 分岐系列=1..）。
            **座標は lib/workflow-core.ts の layoutWorkflowGraph が決める** —
            ライブラリにレイアウトも妥当性判定もさせない（描画層に留める）。
            メインラインの暗黙フロー（kind:"flow"）は灰色実線・無ラベル、
            分岐/合流エッジ（kind:"link"）は橙の破線 + 数量ラベル（動的エッジは
            解決値 or「全量」）。進行中工程へ入るエッジのみ animated。
            ノードクリックでリスト側の StepCard を選択・スクロール同期
            （highlighted = blue 強調枠）。Controls（拡大縮小・全体表示）+
            MiniMap（top-right・状態色）付き。ページのスクロールを奪わないよう
            zoomOnScroll=false / preventScrolling=false。工程の増減時のみ
            fitView で測り直す（数量だけの更新では視点を動かさない）。
            ノード本体は `WorkflowStepNode.tsx` = Mantine の HTML ノード
            （工程名 lineClamp 2 + 種別バッジ + 外注バッジ + 数量バッジ。
            アイコンは StepCard と STEP_STATUS_ICON を共有）
```

**ノードの色は「工程種別」、状態はアイコンとバッジ** — フロー図を見て最初に
知りたいのは「何の工程か」なので、ノードの色（左 4px アクセント + 種別バッジ +
アイコン地色）は `PROCESS_CATEGORY_COLOR`（`lib/enum-labels.ts`）で決める:

| 工程種別 | 色 |
|----------|----|
| 材料準備 MATERIAL_PREP | `teal` |
| 加工 MACHINING | `indigo` |
| コーティング COATING | `grape` |
| 検査 INSPECTION | `cyan` |
| 検査承認 APPROVAL | `violet` |
| 出荷 SHIPPING | `pink` |

状態色（§9 StepStatus の gray / blue / green / red）とぶつからないよう、その 4 色は
種別に使わない。**状態**はアイコン（時計 / スピナー / チェック / ✗）と、進行を
止めている状態のバッジだけで示す:

| 状態 | ノードの表示 |
|------|--------------|
| PENDING かつ開始可能（`canStart`） | 緑 `filled` バッジ「開始可」= いま着手できる |
| PENDING で依存未達 | 灰の小文字「未着手」 |
| IN_PROGRESS | 数量バッジ（受入 …）+ 流入エッジが animated |
| COMPLETED | 数量バッジ（受入 / 良品 / 不良内訳） |
| CANCELLED | 赤 `light` バッジ「キャンセル」 |

`canStart` はサーバーが `canStartStep`（`lib/workflow-core.ts`）で算出した値を
そのまま使う — 実行可否の判定をクライアントに持たせない。

**StepCard** (`src/components/production/StepCard.tsx`)

```
Paper (withBorder, p="sm", radius="sm")
├── Group (justify="space-between", wrap="nowrap")
│   ├── Group gap="sm"
│   │   ├── ThemeIcon (variant="light", size="sm", radius="xl", color by status)
│   │   │   PENDING:     gray  + IconClock
│   │   │   IN_PROGRESS: blue  + IconLoader
│   │   │   COMPLETED:   green + IconCheck
│   │   │   CANCELLED:   red   + IconX
│   │   ├── Text fw={600} size="sm" — step name
│   │   └── Badge variant="outline" size="xs" color={location === 'OUTSOURCE' ? 'orange' : 'gray'}
│   │       text: "外注" | "社内"
│   └── [desktop, if OUTSOURCE] Text size="xs" c="dimmed" — supplier name
├── [mobile, if OUTSOURCE] Text size="xs" c="dimmed" mt={4} pl={28} — supplier name
├── [if 担当者 or 作業時間] Group gap="md" mt="xs" pl={28} wrap="wrap"
│   ├── [担当者] Group gap={6} — Text c="dimmed" "担当" +
│   │   最大 3 名 × (UserAvatar size={18} + Text size="xs" 氏名) + "ほか N 名"
│   │   担当者 = 作業計画（work_order_step_plans）の割当ユーザー（重複排除・計画日順）
│   └── [作業時間] Text size="xs" c="dimmed" tabular-nums
│       "予定 {planned_work_hours}h / 実績 {actual_work_hours}h"
│       実績 = 実績行（work_order_step_actuals）の開始〜終了の累計
│       （lib/step-work-hours.ts sumActualWorkHours — 休止時間は入らない。
│        数えられる行が無ければ null なので、その場合は「予定」だけを出す）
├── [if OUTSOURCE] Group gap="xl" mt="xs" pl={28}
│   ├── Text size="xs" c="dimmed" "依頼: {outsource_requested_at}"
│   └── Text size="xs" c="dimmed" "入荷予定: {outsource_expected_at}"
├── [if COMPLETED] Group gap="xl" mt="xs" pl={28}
│   └── Text size="xs" c="dimmed" "完了: {completed_at}（{completed_by}）"
└── [if has quantities] Group gap="sm" mt="xs" pl={28} wrap="wrap"
    ├── Text size="xs" — "受入 {input_quantity}"
    ├── Text size="xs" c="green" — "良品 {output_success_quantity}"
    ├── [if output_defect_semi_finished] Badge size="xs" color="orange" variant="light" — "半製品 {n}"
    ├── [if output_defect_scrap]         Badge size="xs" color="red"    variant="light" — "廃棄 {n}"
    └── [if output_defect_rework]        Badge size="xs" color="yellow" variant="light" — "工程分岐 {n}"
```

Branch/merge edges (`work_order_step_links`) use the convention `routed_quantity > 0` =
static (the branched amount, only the source→head edge) and `routed_quantity = 0` =
dynamic (carries the source's full 良品数 — chain and merge edges), so in-series
defects propagate automatically. Branch quantity is capped at the source's
unallocated 工程分岐数 (良品+工程分岐 for terminal steps) — `branchableQuantity` in
`lib/workflow-core.ts`, enforced server-side and reflected in AddBranchModal.

**分岐は必ず「合流」か「在庫」で終わる（§7）** — 良品の行き先が無い分岐を
作らせない。終端の選び方は 2 つだけで、AddBranchModal は片方が決まるまで
確定できない（`confirmDisabled`）:

| 終端 | 表し方 | 完了時の入庫 |
|------|--------|--------------|
| 本流へ合流 | 終端工程 → 本流工程 の動的リンク（`routed_quantity = 0`） | 合流先へ流れる（入庫しない） |
| 在庫へ（半製品） | 終端工程の `branch_stock_disposition = SEMI_FINISHED` | 半製品在庫（`computeBranchSemiFinishedQuantity`） |
| 在庫へ（製品） | 終端工程の `branch_stock_disposition = PRODUCT` | 完成数に加算 → 製品在庫（ロット付き） |

分岐系列のヘッダには行き先バッジを出す（合流 → 工程名 / 半製品在庫へ /
製品在庫へ）。どちらも無い旧データは橙の**「行き先未設定」**で、直すまで
良品が完成数へ素通しされることが判るようにする。

**工程フロー変更の承認（§6）** — 承認済み・進行中の指示書で分岐を足す/直す/
消すと、承認設定（MS0B）の「工程フロー変更」フローに段が 1 つでもあれば
**工程を触らずに保留**され（`work_order_flow_changes`）、最終承認で初めて適用
される。1 段も無ければ保留せず即適用（**未設定 = 素通し**）。保留中は指示書
詳細の最上部に `FlowChangeCard`（§10.9 ActionCard。承認できる人は green +
承認/差し戻し、それ以外は gray の「承認待ち」）。差し戻すと適用されずに閉じ、
工程はそのまま。適用は承認後に通常の関数（addBranchSeries 等）を通すので、
待っている間に前提が崩れていれば FAILED として残る（古い前提のまま当てない）。

**作成後の編集** — 分岐系列ヘッダの鉛筆アイコンから、**分岐数量**（系列が
全て未着手のときのみ）と**終端**（終端工程が未着手のときのみ）を付け替えられる
（`updateBranch` → `updateBranchSeries`）。工程の入れ替えは削除して作り直す
（実績・計画の消え方が見える操作に寄せるため）。判定は
`branchSeriesList` / `danglingBranches`（`lib/workflow-core.ts` — kiosk と双子）。

### 12.3 WorkOrderStepExecutionPage

`src/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/page.tsx`

Field-operation page. Optimized for tablet — all interactive elements `size="lg"`, min touch target 44px.

```
Stack (gap="md", p="md")
├── Paper (withBorder, p="lg") — step identity
│   ├── Title order={3} — process step name
│   ├── Group
│   │   ├── Text "指示書 #" {work_order_number}
│   │   └── StatusBadge (step status)
│   └── [if session_locked_by != current user] Alert color="red" fullWidth
│       "別のユーザーがセッション中です"
├── [if IN_PROGRESS] StepQuantityForm (see below)
├── [if IN_PROGRESS] InspectionRecordForm (see 12.5)
├── DefectRecordForm (see 12.6)
└── Group (justify="center", mt="xl")
    ├── [if PENDING and can_start] Button size="lg" color="blue" — 工程開始
    ├── [if IN_PROGRESS] Button size="lg" color="green" — 工程完了
    └── [if IN_PROGRESS] Button size="lg" color="red" variant="outline"
        "キャンセル（巻き戻し）" → ConfirmModal
```

**StepQuantityForm** (`src/components/production/StepQuantityForm.tsx`) — tablet-first, `size="lg"`.
Records item flow & defect disposition for the step; persisted to `work_order_steps`.

```
Paper (withBorder, p="lg")
├── Title order={4} "数量・不良"
├── NumberInput "受入数 (input_quantity)" — 既定: 前工程の output_success_quantity
├── NumberInput "良品数 (output_success_quantity)" — 次工程へ渡る
└── Group grow — 不良内訳
    ├── NumberInput "半製品 (output_defect_semi_finished)"  // 在庫へ
    ├── NumberInput "廃棄 (output_defect_scrap)"
    └── NumberInput "工程分岐 (output_defect_rework)"          // 分岐で追加工程へ
// バリデーション: output_success + 不良合計 = input_quantity（不一致時はインライン警告）
```

### 12.4 ApprovalStatusPanel / WorkOrderApprovalCard

`src/components/production/ApprovalStatusPanel.tsx` — 2 つを出す。

**WorkOrderApprovalCard** — 画面最上部の ActionCard (§10.9)。承認依頼 / 第一・
承認 / 差し戻し（理由必須モーダル）を持つ唯一の場所。色は承認権限で決まる
（権限あり = green + 承認・差し戻し、権限なし = gray の「第一（第二）承認待ち」、
差し戻し中 = red + 再承認依頼）。操作が無い状態では何も描画しない。

**ApprovalStatusPanel** — フローと記録の**表示のみ**（操作ボタンは持たない）。

```
Paper (withBorder, p="md", radius="md")
├── Title order={5} mb="md" "承認状況"
├── Stepper (active={stepIndex}, size="sm", orientation={isMobile ? "vertical" : "horizontal"})
│   └── Stepper.Step × N — 段数・名称・グループは依頼時のスナップショット
│       （approval_requests.flow_snapshot）由来。承認設定 MS0B が決める
├── [if REJECTED] Alert color="red" — 差し戻し理由
└── approval_records list
    └── Group — approver name + acted_at + action badge + comment
```

### 12.5 InspectionRecordForm

`src/components/production/InspectionRecordForm.tsx` — `'use client'`

```
Stack
├── Title order={4} — template name
└── Table
    ├── thead: 検査項目 / 許容値 / 実測値 / 合否
    └── tbody: [per inspection_template_item]
        ├── Text (item_name)
        ├── Text (tolerance_min ~ tolerance_max unit)
        ├── TextInput (measured_value)
        └── SegmentedControl ["合格", "不合格"]
```

### 12.6 DefectRecordForm

`src/components/production/DefectRecordForm.tsx` — `'use client'`

```
Paper (withBorder, p="md")
├── Title order={4} "不良記録（任意）"
└── [per defect entry]
    ├── Select (defect_type_id)
    └── Textarea (description — required when type is selected)
└── Button variant="subtle" leftSection=<IconPlus> — 追加
```

### 12.7 InventoryBadge

`src/components/production/InventoryBadge.tsx`

```tsx
// props: available: number, reserved: number, unit: string
<Group gap="xs">
  <Text size="sm">{available} {unit}</Text>
  {reserved > 0 && (
    <Tooltip label={`予約中: ${reserved} ${unit}`}>
      <Badge color="orange" variant="light">予約 {reserved}</Badge>
    </Tooltip>
  )}
</Group>
```

### 12.8 CustomerSelect

`src/components/master/CustomerSelect.tsx` — `'use client'`

Two-level select: customer → branch.

```
Stack gap="xs"
├── Select label="顧客" data={customers} searchable withAsterisk
└── Select label="支店" data={branches filtered by customer}
    disabled when no customer or no branches available
    clearable
```

### 12.9 ProductPriceResolverInput

`src/components/sales/ProductPriceResolverInput.tsx` — `'use client'`

```
Group align="flex-end"
├── Select (product_id, searchable)
├── Select (order_type)
├── NumberInput (quantity)
├── NumberInput (unit_price) — auto-filled from price_list_tiers (resolved by 顧客×製品×注文種別×数量), editable override
└── Text ff="mono" — computed amount (= quantity × unit_price)
```

---

## 13. Master Data Pages

All master data entities follow the standard list + detail + form pattern (§8).

### 13.1 Business Partners (取引先)

顧客 / 最終需要家 / 仕入先・外注先 は **1 つの取引先マスタ**（`MS01`,
`/master/business-partners`）に統合されている。1 法人 = `business_partners` 1 行で、
使い道は `bp_role_assignments` の **ロール付与**（CUSTOMER / END_USER / VENDOR）で
決まる。旧 `MS02` 最終需要家 / `MS03` 外注企業 は廃止（欠番、旧パスは 308 リダイレクト）。

**List columns**: BPコード / 名称 / ロール / 支店数 / 状態 / 更新日
（フィルタ: 検索 + ロール + 状態）

**Detail tabs**: 概要 / 担当者 / 支店一覧 / 見積・受注履歴 / 履歴

概要は Paper セクションの縦積み — **一般**（備考など、ロールに依らない情報）→
付与されているロールの分だけ（顧客 / 最終需要家 / 仕入先・外注先）。ロール
セクションの見出しには一覧バッジと同色のドットを付ける。担当者はロール非依存
だが行数で伸びるため独立タブ（`ContactsTable` は `hideHeading` で使う）。

**Form**: 基本情報 → 住所・連絡先 → ロール（チェックボックス）→ チェックしたロールの
セクションだけが出る（顧客情報 / 最終需要家情報 / 仕入先・外注先情報 + 振込先）。
ロールを外すと割当は `is_active=false` に落ちるだけで属性行は残る（付け直すと復帰）。

**Branch**: nested under `/master/business-partners/[id]/branches/`. List shown in the
取引先 detail tabs.

### 13.2 Products

**List columns**: 製品コード / 名称 / 材種（+ φ直径×全長） / 単位 / 状態

**Detail**: `spec` JSON rendered as key-value table; design file link.

### 13.3 Process Steps (工程マスタ)

**List columns**: コード / 名称 / カテゴリ / 実施場所 / 同期可 / 検査工程 / 承認工程

**Detail**: use-dependency and exec-dependency tables.

### 13.4 Inspection Templates

**Detail tabs**: テンプレート情報 / 検査項目

Items sub-table has inline add/edit (no separate page).

### 13.5 Approval Groups

**Detail tabs**: グループ情報 / メンバー / 代理設定

### 13.6 Plants (拠点)

**List columns**: コード / 名称（ja） / 国 / 状態 / 更新日

**Detail**: summary grid (連絡先・住所); related tabs for 在庫サマリ（拠点別）/ 実行中工程.
Category color `gray` (マスタ), icon `IconBuildingWarehouse`.

---

## 14. DataTable Column Conventions

Use `mantine-datatable` `DataTableColumn[]`. Standard conventions:

| Column type | Render |
|-------------|--------|
| Document number | `Text ff="mono"` |
| Status | `StatusBadge` component |
| Amount / price | right-aligned, `MoneyText` |
| Date | `date-fns format(date, 'yyyy/MM/dd')` |
| Timestamp | `date-fns format(ts, 'yyyy/MM/dd HH:mm')` |
| Localized JSON | `JsonLocalizedText` |
| Boolean | `Badge` green "有効" / gray "無効" |
| Actions | `Group` of `ActionIcon` — rightmost column, `accessor: 'actions'` |

Row click navigates to detail page.

**Per-entity list columns:**

| Entity | Columns |
|--------|---------|
| Estimate | 試算番号 / 名称 / 工具種 / 顧客 / 製品 / 見積単価 / 状態 / 更新日 |
| PriceList | 顧客 / 製品 / 注文種別（バリアントのバッジ） / 段階 / 単価範囲 / 試算元 / 有効期間 / 状態 |
| Quote | 見積番号 / 顧客 / 有効期限 / 状態 / 更新日 |
| OrderAcceptance | 注文番号 / 顧客 / 顧客注文書番号 / 合計金額 / 状態 / 更新日 |
| SalesOrder | 注文明細番号 / 顧客 / 製品 / 数量 / 金額 / 納期 / 状態 |
| WorkOrder | 指示書番号 / 注文明細番号 / 種別 / 予定数量 / 承認状態 / 状態 / 更新日 |
| DeliveryOrder | 出荷書番号 / 注文明細番号 / 種別 / 状態 / 出荷日 |
| UnplannedOrderLine (PD05 未手配) | 注文明細番号 / 顧客 / 製品 / 受注数 / 手配済 / 未手配 / 在庫引当 / 納期 / 状態 |
| UnshippedOrderLine (SH03 未手配) | 注文明細番号 / 顧客 / 製品 / 完了ロット / 完成数 / 出荷手配済 / 未手配 / 納期 / 状態 |
| DeliveryNote | 納品番号 / 出荷書番号 / 納品先 / 方法 / 状態 / 納品日 |
| Invoice | 請求番号 / 顧客 / 請求期間 / 合計金額 / 状態 / 発行日 |
| BillingClosing | 顧客 / 締日 / 合計金額 / 状態 / 処理日 |
| DesignRequest | 依頼番号 / 区分 / 製品 / 担当者 / 希望納期 / 状態 / 更新日 |
| MaterialPurchaseOrder | 発注番号 / 仕入先 / 入荷先拠点 / 合計金額 / 状態 / 発注日 |
| MaterialReceipt | 素材 / 仕入先 / 入荷拠点 / 数量 / 入荷日 |
| OutsourceOrder | 外注先 / 工程 / 依頼日 / 入荷予定日 / 入荷日 / 状態 |
| BusinessPartner | BPコード / 名称 / ロール / 支店数 / 状態 / 更新日 |
| Plant | コード / 名称 / 国 / 状態 / 更新日 |
| Product | 製品コード / 名称 / 材種（+ φ直径×全長） / 単位 / 状態 |
| MaterialType | 材種コード / メーカー / 形状 / 名称 / 状態 |
| Material | 素材コード / 材種 / 直径 / 全長 / 黒皮研磨 / 状態 |
| ProcessStep | コード / 名称 / カテゴリ / 実施場所 / 同期可 / 検査 / 承認 |
| InspectionTemplate | コード / 名称 / 関連工程 / 状態 |
| DefectType | コード / 名称 / 状態 |
| ApprovalGroup | 名称 / 種別 / メンバー数 / 状態 |

---

## 15. Form Conventions

- Use `@mantine/form` with `zodResolver` for all forms.
- Server Actions handle submission (`action` or `onSubmit` that calls a server action).
- Show `notifications.show` (from `@mantine/notifications`) on success/error.
- `LoadingOverlay` during submission: `<Box pos="relative"><LoadingOverlay visible={isPending} /></Box>`.
- Required fields: `withAsterisk` prop.
- Monetary inputs: `NumberInput` with `prefix="¥"`, `thousandSeparator=","`, `decimalScale={2}`.
- Date fields: `DatePickerInput` from `@mantine/dates`, `valueFormat="YYYY/MM/DD"`, locale `ja`.
- All `Select` with `searchable` when options > 5.
- `clearable` on all optional Select and DatePickerInput fields.

**Validation timing** — `validateInputOnChange: false` (default). Validate on submit; show inline errors per field after first submit attempt.

**Grid field alignment** — fields inside a `FormSection` keep their **label at the
top** but push the **input box to the bottom** of the (stretched) grid cell
(`.form-section` rules in globals.css: `margin-top: auto` on `.mantine-Input-wrapper`).
So when fields in the same row differ in label/description height, the input boxes
line up horizontally — the gap above a shorter field's input simply grows.

**Line item tables (desktop)** — `<Table withTableBorder withColumnBorders={false}>` with form inputs inline in cells.

**Line item cards (mobile)** — each item is a `Paper withBorder p="sm"` containing a Stack of full-width fields.

---

## 16. Behavior & Feedback

### 16.1 Notification (Toast)

Use `notifications.show()` from `@mantine/notifications` for:
- Successful create/update/delete
- PDF generation complete
- Export complete

```ts
notifications.show({ title: '保存しました', message: '見積書を作成しました', color: 'green' })
notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' })
```

Do **not** use toast for:
- Destructive confirmations (use modal instead)
- Form validation errors (use inline field errors)
- Real-time process events that need persistent display (use inline panels)

### 16.2 Confirmation Modal

Use `modals.openConfirmModal()` (see §10.4) for:
- Cancelling a document (注文明細、指示書 etc.)
- Deleting a master record
- Rolling back a manufacturing step

Always include `confirmProps: { color: 'red' }` for destructive actions.

### 16.3 Inline Messages

Use Mantine `Alert` for:
- Session lock warnings on the step execution page (color="red", full-width)
- Price mismatch warnings on order acceptance (color="orange")
- System-level notices that should persist while the user is on the page

### 16.4 Loading States

| Context | Component |
|---------|-----------|
| Form submission | `LoadingOverlay` over the form Box |
| Button action | `loading={isPending}` on the Button |
| Data fetching (SSR) | React Suspense + Skeleton components |
| App card grid loading | `Skeleton height={110} radius="md"` per card |
| 重いプレビュー（3D / 大きな画像） | 枠だけ先に確保して `Loader`、中身は見えてから読む |
| 画面遷移 | `loading.tsx`（本文だけ骨組みへ）+ 押した要素の `useLinkStatus` |

**遷移は 2 か所で見せる。** ダッシュボード配下は全ページ `force-dynamic`
なので、次の画面のサーバー処理が終わるまで React は何も差し替えない — 何も
置かないと「押しても無反応 → しばらくして画面が丸ごと入れ替わる」になり、
押せたのかどうか判らず二度押しされる。

1. **`app/(dashboard)/loading.tsx`** … Suspense の境界。レイアウト
   （ヘッダー・フッター・各 Provider）は**そのまま残り**、本文だけが即座に
   骨組みへ変わる。全体が描き直されるわけではないので、ヘッダーの状態も
   失われない。画面ごとに合わせたいときは、その route に `loading.tsx` を
   置けばこちらより優先される。
2. **押した要素自身**（`useLinkStatus`、`components/ui/LinkPending.tsx`）…
   `<Link>` の**子**として置く（外に置くと常に false）。押した場所に
   すぐ反応が出ると、体感が「待たされている」から「進んでいる」に変わる。
   ポップオーバー内のように押した直後に消える要素では要らない — そちらは
   1 だけで足りる。

**重いものは「見えてから」読む（`useInView`）。** Mantine の `Tabs.Panel` は
既定で **keepMounted** — 表に出ていないタブも DOM にある。門を置かないと、
開いてもいないタブの 3D モデルを取りに行き WebGL まで起こすので、ページを
開いた瞬間が重くなる。表示中かどうかは `IntersectionObserver` でしか判らない。
枠（`AspectRatio`）は先に確保しておくこと — 読み終えた瞬間に高さが変わると
下の内容が飛ぶ。

### 16.5 Transition Durations

| Animation | Duration |
|-----------|----------|
| App card hover lift | `120ms ease` |
| Mantine modals | Mantine default (200ms) |
| SSE-triggered step status update | Immediate (no animation) |

Respect `@media (prefers-reduced-motion: reduce)` — disable all CSS transitions in app cards and similar hover effects.

---

## 17. Content & Locale

### 17.1 Terminology Glossary

Use these exact terms consistently across all UI strings, error messages, and notifications:

> **未確認の用語（2026-08 時点）** — 「注文請書」「注文明細」は本仕様で定めた語で、
> 業務側の文書 `_docs/business_flow.md` は同じものを **「注文受諾書」（§2）**
> **「受注書」（§3）** と呼んでいる。利用者から「注文明細という語は聞いたことが
> ない」との指摘があり、**現場の語彙と一致していない可能性が高い**。
> 改称する場合は UI ラベル・マニュアル・本節をまとめて直すこと（DB のテーブル名
> `order_acceptances` / `sales_orders` と操作コードは利用者に見えないので変えない）。

| Concept | Japanese term | Abbreviation/code |
|---------|---------------|-------------------|
| 試算 | 試算 | EST |
| 価格表 | 価格表 | price_list |
| 見積書 | 見積書 | QOT |
| 注文請書 | 注文請書 | ORD |
| 注文明細 | 注文明細 | ORD-...-NN |
| 指示書 | 指示書 | — (serial int) |
| 出荷書 | 出荷書 | — |
| 納品書 | 納品書 | DRN |
| 請求書 | 請求書 | INV |
| 締日処理 | 締日処理 | — |
| 設計依頼書 | 設計依頼書 | — |
| 工程ステップ | 工程 | — |
| 素材 | 素材 | material |
| 材種 | 材種 | material_type |
| 製品 | 製品 | product |
| 在庫 | 在庫 | inventory |
| 予約（在庫） | 予約 | RESERVED |
| 引当 | 引当 | confirmed |
| 外注 | 外注 | OUTSOURCE |
| 仕入先 | 仕入先 | SUPPLIER |
| 最終需要家 | 最終需要家 | END_USER |
| 顧客 | 顧客 | CUSTOMER |
| 支店 | 支店 | branch |
| 承認設定 | 承認設定 | — |
| 操作コード | 操作コード | operation code |
| 下書き | 下書き | DRAFT |
| 確定 | 確定 | CONFIRMED |
| キャンセル | キャンセル | CANCELLED |
| 差し戻し | 差し戻し | REJECTED |

Do **not** use synonyms — e.g. never write "注文書" where "注文請書" is meant.

### 17.2 敬語 / Tone

- UI labels and placeholders: plain noun form (e.g. "顧客を選択", not "顧客を選択してください").
- Error messages: polite but concise (e.g. "顧客を選択してください" — `〜てください` is acceptable in validation messages).
- Confirmation modals: direct action statements (e.g. "キャンセルの確認" / "この操作は取り消せません。").
- Notification messages: past-tense completion (e.g. "保存しました", "作成しました").
- Button labels: imperative verb or noun (e.g. "保存", "キャンセル", "承認", "差し戻し").

### 17.3 Date / Number / Currency Formatting

| Type | Format | Example |
|------|--------|---------|
| Date | `yyyy/MM/dd` | `2026/06/04` |
| Timestamp | `yyyy/MM/dd HH:mm` | `2026/06/04 14:30` |
| Currency (JPY) | `Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' })` | `¥250,000` |
| Quantity | integer + unit (e.g. `50 本`) | `50 本` |
| Relative time (notifications) | `X分前`, `X時間前`, `昨日` | `5分前` |

Use `date-fns` v4 for date formatting. Import only what is needed (tree-shakeable).

### 17.4 Multilingual DB Fields

All DB fields defined as `json { ja: '', en: '' }` must have both locales populated. When rendering, use `JsonLocalizedText` component (§10.6) which falls back to `ja` if the current locale has no value.

---

## 18. Accessibility

### 18.1 Contrast

- Body text on surface: minimum WCAG AA 4.5:1 (Mantine defaults meet this in both light and dark mode).
- Disabled text: `c="dimmed"` — acceptable at reduced contrast per WCAG exception for disabled states.
- Status badges: use Mantine's built-in color system; `variant="light"` may fail AA contrast for small text — consider `variant="filled"` for critical status indicators.

### 18.2 Focus Rings

- Never remove Mantine's default focus ring (`outline: none` is prohibited in application CSS).
- All interactive elements must have a visible focus indicator at WCAG 2.2 Focus Appearance level.
- `ActionIcon`, `UnstyledButton` — ensure `aria-label` is present on all icon-only buttons.

### 18.3 Keyboard Navigation

- All Popover components: `trapFocus` prop required (prevents Tab from escaping the popover).
- `AppLauncher` TextInput: `autoFocus` when popover opens.
- `OperationCodeJump`: pressing `Enter` navigates to the resolved screen.
- Modals: `@mantine/modals` handles focus trap and Escape to close automatically.
- `DataTable` rows: `onRowClick` navigates to detail — also accessible via keyboard row selection.

### 18.4 Semantic HTML

- Use `<Title order={N}>` to maintain heading hierarchy (h1 is implicit in layout; start at h2 for page titles).
- Status badges rendered as `<span>` by Mantine Badge — acceptable for decorative status.
- Form labels: always use Mantine's `label` prop (not `aria-label`) on form inputs so labels are linked via `for`/`id`.

### 18.5 Motion

- Disable all CSS transitions for users with `prefers-reduced-motion: reduce` (see §7 app card CSS).

---

## 19. Realtime (SSE)

Pages that show live manufacturing progress use an SSE hook.

`src/hooks/useWorkOrderSSE.ts` — `'use client'`

- Connects to `/api/sse/work-orders/[id]`.
- Updates local step status in-place (no full page reload).
- Shows `<RingProgress>` or step cards refreshed when status changes.

Approval notifications use `/api/sse/approvals` — shows a `Notification` banner in the header bell area when a new request arrives for the current user (`Indicator processing={true}` activates the pulse ring).

---

## 20. Mobile / Tablet

### 20.1 Step Execution Page (tablet-first)

`/production/work-orders/[id]/steps/[stepId]` — always tablet-friendly:

- All interactive elements `size="lg"`.
- No hover-only states.
- No `<Kbd>` shortcuts.
- Minimum touch targets: 44px.
- Session lock warning: full-width `Alert` (color="red").

### 20.2 Other Pages (desktop-first)

- Primary viewport: ≥ 1024px.
- `isMobile` breakpoint: < 768px.
- Responsive adjustments per §8:
  - Breadcrumbs hidden on mobile.
  - Title: `order={2}` desktop → `order={3}` mobile.
  - Filter bar: `Group` desktop → `Stack` mobile.
  - Data table: columns desktop → card list mobile.
  - Detail summary: 3-column grid → 1-column grid.
  - Form fields: 2-column grid → 1-column grid.
  - Form actions: right-aligned row → full-width stacked.
  - Action buttons: button group → `...` menu dropdown（`ResourceActions` が担う）。
  - Timestamps: footer row → inline Group in summary card.
  - **Tabs: 折り返さず横スクロール**（globals.css の `.mantine-Tabs-list`）。
    タブが 4 枚を超えると 2〜3 段に折り返して本文が画面外へ押し出されるため、
    段を増やすより横に流す。スクロールバーは隠すが、端が切れて見えるので
    「まだ先がある」ことは伝わる。
  - **編集可能な表（明細・サブテーブル・共有設定）: 表 → 1 行 = 1 カード。**
    列が 3 つあると 1 列 40px になり、`Select` が何を選んでいるのか読めない。
    §8.3 の「Line item cards (mobile)」と同じ扱い。
  - **左右 2 ペインの編集（Markdown の分割表示など）はモバイルに出さない。**
    横 375px を割ると両方読めないので、切り替え（編集 / プレビュー）にする。
  - **ビューア（PDF / 画像 / 3D）のモーダルはモバイルで全画面にする**
    （`ModalShell` の `fullScreen`）。図面のように「画面の広さがそのまま
    読めるかどうか」になる中身を `size` 指定のモーダルに入れると、枠・題・
    フッターに挟まれて本文が数十 px しか残らない。高さは `vh` ではなく
    **`dvh`** で取る — モバイルのアドレスバーが引っ込むと `vh` は実際の
    表示領域とずれる。
  - **モバイルのブラウザは `iframe` の PDF を描かない**（iOS Safari は空白、
    Android Chrome はダウンロード誘導）。サムネイルなど小さい枠では
    アイコン + 種別名に落として、拡大表示へ誘導する。

### 20.3 タッチ操作

- **ドラッグ並べ替えは MouseSensor と TouchSensor を分ける**（@dnd-kit）。
  `PointerSensor` 1 本だと、スマホで縦にスワイプしただけでドラッグが始まり
  ページがスクロールできなくなる。タッチは
  `activationConstraint: { delay: 200, tolerance: 8 }`（長押ししてから動かす）に
  限定し、ハンドルには `touchAction: "none"` と 44px の当たり判定を与える。
- ホバーでしか出ない操作を作らない（タッチにホバーは無い）。行に付けるボタンなどは
  常時表示にする。
- **キャンバス（3D ビューア等）には `touch-action: none` を置く。** 既定のままだと
  ブラウザが指のドラッグをスクロールとして横取りし、モデルを回せない。併せて
  **WebGL コンテキストは閉じるときに必ず破棄する** — 同時保持数はモバイルの方が
  ずっと少なく（iOS Safari で 8〜16 程度）、漏らすと数回でタブごと落ちる。
- **入れ物の寸法だけが変わったときに measure し直す**（`ResizeObserver`）。
  画面回転・アドレスバーの出入り・全画面モーダルの開き切りでは `window` の
  `resize` が来ないことがあり、canvas が古い寸法のまま引き伸ばされる。
