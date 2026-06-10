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
| 販売 | `blue` |
| 購買 | `teal` |
| 生産 | `violet` |
| 出荷 | `orange` |
| 請求 | `pink` |
| マスタ | `gray` |

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
                ├── Menu.Item プロフィール (IconUser)
                ├── Menu.Item 設定 (IconSettings)
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
| CAT | 1–2 | `CM` `SA` `PU` `PD` `SH` `BL` `MS` |
| MODE | 3 | `0`=list `1`=new `2`=detail |
| IDX | 4 | `1`–`9`, `A`–`Z` |

**Full table** (derived from `design-preview/designs/lib/operation-codes.ts`):

| Category | IDX | Base label | list | new | detail |
|----------|-----|-----------|------|-----|--------|
| 共通 | — | ダッシュボード | CM00 | — | — |
| 販売 | 1 | 価格表 | SA01 | SA11 | SA21 |
| 販売 | 2 | 見積書 | SA02 | SA12 | SA22 |
| 販売 | 3 | 注文受諾書 | SA03 | SA13 | SA23 |
| 販売 | 4 | 設計依頼書 | SA04 | SA14 | SA24 |
| 購買 | 1 | 素材入荷 | PU01 | PU11 | PU21 |
| 購買 | 2 | 外注依頼 | PU02 | PU12 | PU22 |
| 生産 | 1 | 受注書 | PD01 | PD11 | PD21 |
| 生産 | 2 | 指示書 | PD02 | PD12 | PD22 |
| 生産 | 3 | 承認管理 | PD03 | PD13 | PD23 |
| 生産 | 4 | 製品在庫 | PD04 | PD14 | PD24 |
| 生産 | 5 | 素材在庫 | PD05 | PD15 | PD25 |
| 出荷 | 1 | 出荷書 | SH01 | SH11 | SH21 |
| 出荷 | 2 | 納品書 | SH02 | SH12 | SH22 |
| 請求 | 1 | 請求書 | BL01 | BL11 | BL21 |
| 請求 | 2 | 締日処理 | BL02 | BL12 | BL22 |
| マスタ | 1 | 顧客 | MS01 | MS11 | MS21 |
| マスタ | 2 | 最終需要家 | MS02 | MS12 | MS22 |
| マスタ | 3 | 製品 | MS03 | MS13 | MS23 |
| マスタ | 4 | 材種 | MS04 | MS14 | MS24 |
| マスタ | 5 | 素材 | MS05 | MS15 | MS25 |
| マスタ | 6 | 外注企業 | MS06 | MS16 | MS26 |
| マスタ | 7 | 工程マスタ | MS07 | MS17 | MS27 |
| マスタ | 8 | 検査表テンプレート | MS08 | MS18 | MS28 |
| マスタ | 9 | 不良種類 | MS09 | MS19 | MS29 |
| マスタ | A | 承認グループ | MS0A | MS1A | MS2A |
| マスタ | B | 組織 | MS0B | MS1B | MS2B |

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
└── [per category] Stack gap="sm"
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
| 価格表 | `IconCurrencyYen` |
| 見積書 | `IconFileText` |
| 注文受諾書 | `IconClipboardCheck` |
| 設計依頼書 | `IconRuler2` |
| 素材入荷 | `IconPackageImport` |
| 外注依頼 | `IconTruckDelivery` |
| 受注書 | `IconClipboardList` |
| 指示書 | `IconSettings2` |
| 承認管理 | `IconShieldCheck` |
| 製品在庫 | `IconBoxSeam` |
| 素材在庫 | `IconStack2` |
| 出荷書 | `IconTruck` |
| 納品書 | `IconReceipt` |
| 請求書 | `IconFileInvoice` |
| 締日処理 | `IconCalendarDue` |
| 顧客 | `IconBuilding` |
| 最終需要家 | `IconUsers` |
| 製品 | `IconCylinder` |
| 材種 | `IconAtom` |
| 素材 | `IconBolt` |
| 外注企業 | `IconBuildingFactory2` |
| 工程マスタ | `IconGitBranch` |
| 検査表テンプレート | `IconListCheck` |
| 不良種類 | `IconAlertTriangle` |
| 承認グループ | `IconUsersGroup` |
| 組織 | `IconSitemap` |

---

## 8. Page Patterns

All pages live inside `src/app/(dashboard)/`. Each page uses server components by default; interactive parts are extracted into `'use client'` components.

### 8.1 List Page

Used for every index route (`page.tsx`). Responsive: filter bar stacks on mobile, rows become cards on mobile.

```
Stack (gap="md")
├── Group (justify="space-between", align="flex-end", wrap="nowrap")
│   ├── Stack (gap=2, minWidth=0)
│   │   ├── [desktop only] Breadcrumbs
│   │   │   └── Text size="sm" per segment
│   │   └── Title order={isMobile ? 3 : 2}
│   └── Button leftSection=<IconPlus> size={isMobile ? "sm" : "md"}
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
│   ├── [mobile] MobileCardList — Stack gap="xs" of Paper cards
│   └── [desktop] DataTable (mantine-datatable) or DesktopTable
│       columns: defined per section in §14
│       totalRecords / page / onPageChange (URL search params)
└── [empty state] Center > Stack align="center"
    ├── ThemeIcon size="xl" variant="light" color="gray"
    ├── Text c="dimmed" size="sm"
    └── Button variant="subtle" size="sm"
```

**Mobile card pattern** — each record renders as:
```
Paper (p="sm", withBorder, radius="sm", cursor="pointer")
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
│   └── [desktop] Group justify="flex-end" mt="md"
│       ├── Button variant="default" — キャンセル
│       └── Button type="submit" loading={isPending} — 保存
```

---

## 9. Status Badges

`src/components/ui/StatusBadge.tsx` — maps enum values to Mantine `Badge` colors.

| Entity | Status | Color | Japanese label |
|--------|--------|-------|----------------|
| Quote | DRAFT | gray | 下書き |
| Quote | ISSUED | blue | 発行済 |
| Quote | ACCEPTED | green | 受諾済 |
| Quote | REJECTED | red | 却下 |
| Quote | EXPIRED | orange | 期限切れ |
| OrderAcceptance | PENDING | yellow | 照合中 |
| OrderAcceptance | PRICE_DIFF | orange | 価格差異 |
| OrderAcceptance | CONFIRMED | green | 確定 |
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
| WorkOrder (approval) | PENDING_1ST | yellow | 第一承認待ち |
| WorkOrder (approval) | APPROVED_1ST | blue | 第一承認済 |
| WorkOrder (approval) | PENDING_2ND | orange | 第二承認待ち |
| WorkOrder (approval) | APPROVED | green | 承認済 |
| WorkOrder (approval) | REJECTED | red | 差し戻し |
| StepStatus | PENDING | gray | 未着手 |
| StepStatus | IN_PROGRESS | blue | 進行中 |
| StepStatus | COMPLETED | green | 完了 |
| StepStatus | CANCELLED | red | キャンセル |
| ShippingOrder | DRAFT | gray | 下書き |
| ShippingOrder | CONFIRMED | blue | 確定 |
| ShippingOrder | SHIPPED | green | 出荷済 |
| DeliveryNote | DRAFT | gray | 下書き |
| DeliveryNote | ISSUED | blue | 発行済 |
| DeliveryNote | DELIVERED | green | 納品済 |
| Invoice | DRAFT | gray | 下書き |
| Invoice | ISSUED | blue | 発行済 |
| Invoice | SENT | violet | 送付済 |
| Invoice | PAID | green | 支払済 |
| InspectionRecord | PENDING | gray | 未実施 |
| InspectionRecord | PASS | green | 合格 |
| InspectionRecord | FAIL | red | 不合格 |
| InspectionRecord | APPROVED | teal | 承認済 |
| DesignRequest | PENDING | gray | 未着手 |
| DesignRequest | IN_PROGRESS | blue | 進行中 |
| DesignRequest | COMPLETED | green | 完了 |
| BillingClosing | PENDING | gray | 未処理 |
| BillingClosing | PROCESSED | blue | 処理済 |
| BillingClosing | EXPORTED | green | エクスポート済 |

---

## 10. Common UI Components

### 10.1 FieldValue

`src/components/ui/FieldValue.tsx`

```tsx
// props: label: string, value: ReactNode, span?: number
<Stack gap={2}>
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
// props: value: number | null, currency: string  // 通貨はドキュメントから必ず渡す（JPY ハードコード禁止）
const { locale } = useLocale()
new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : 'en-US', { style: 'currency', currency }).format(value)
```

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
│   └── [desktop, if APPROVED or IN_PROGRESS] Button variant="subtle" size="xs" "変更承認依頼"
├── Stack gap="xs"
│   └── [per work_order_step] StepCard (see below)
└── [mobile] Button variant="subtle" size="xs" fullWidth mt="sm" "変更承認依頼"
```

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
├── [if OUTSOURCE] Group gap="xl" mt="xs" pl={28}
│   ├── Text size="xs" c="dimmed" "依頼: {outsource_requested_at}"
│   └── Text size="xs" c="dimmed" "入荷予定: {outsource_expected_at}"
└── [if COMPLETED] Group gap="xl" mt="xs" pl={28}
    └── Text size="xs" c="dimmed" "完了: {completed_at}（{completed_by}）"
```

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
├── [if IN_PROGRESS] InspectionRecordForm (see 12.5)
├── DefectRecordForm (see 12.6)
└── Group (justify="center", mt="xl")
    ├── [if PENDING and can_start] Button size="lg" color="blue" — 工程開始
    ├── [if IN_PROGRESS] Button size="lg" color="green" — 工程完了
    └── [if IN_PROGRESS] Button size="lg" color="red" variant="outline"
        "キャンセル（巻き戻し）" → ConfirmModal
```

### 12.4 ApprovalStatusPanel

`src/components/production/ApprovalStatusPanel.tsx`

```
Paper (withBorder, p="md", radius="md")
├── Title order={5} mb="md" "承認状況"
├── Stepper (active={stepIndex}, size="sm", orientation={isMobile ? "vertical" : "horizontal"})
│   ├── Stepper.Step label="第一承認" description="工場長・部長クラス"
│   └── Stepper.Step label="第二承認" description="部長クラス" loading={PENDING_2ND}
├── [if current user is approver and PENDING] Group
│   ├── Button color="green" — 承認
│   └── Button color="red" variant="outline" — 差し戻し
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
├── NumberInput (unit_price) — auto-filled from price_lists, editable override
└── Text ff="mono" — computed amount (= quantity × unit_price)
```

---

## 13. Master Data Pages

All master data entities follow the standard list + detail + form pattern (§8).

### 13.1 Customers

**List columns**: コード / 名称（ja） / 支店数 / 状態 / 更新日

**Detail tabs**: 概要 / 支店一覧 / 見積・受注履歴

**Customer Branch**: nested under `/master/customers/[id]/branches/`. List shown in customer detail tabs.

### 13.2 Products

**List columns**: 製品コード / 名称 / 素材 / 単位 / 状態

**Detail**: `spec` JSON rendered as key-value table; design file link.

### 13.3 Process Steps (工程マスタ)

**List columns**: コード / 名称 / カテゴリ / 実施場所 / 同期可 / 検査工程 / 承認工程

**Detail**: use-dependency and exec-dependency tables.

### 13.4 Inspection Templates

**Detail tabs**: テンプレート情報 / 検査項目

Items sub-table has inline add/edit (no separate page).

### 13.5 Approval Groups

**Detail tabs**: グループ情報 / メンバー / 代理設定

### 13.6 Org Units (組織)

**List**: tree view (REGION > COUNTRY > FACTORY > DEPARTMENT > TEAM) with type badge per node.

**List columns**: コード / 名称 / 種別 / 国 / タイムゾーン / 通貨 / 状態

**Detail tabs**: 概要 / 所属ユーザー（`user_org_assignments`）/ 下位組織

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
| PriceList | 顧客 / 製品 / 注文種別 / 数量範囲 / 単価 / 有効期間 / 状態 |
| Quote | 見積番号 / 顧客 / 有効期限 / 状態 / 更新日 |
| OrderAcceptance | 注文番号 / 顧客 / 顧客注文書番号 / 合計金額 / 状態 / 更新日 |
| SalesOrder | 受注番号 / 顧客 / 製品 / 数量 / 金額 / 納期 / 状態 |
| WorkOrder | 指示書番号 / 受注番号 / 種別 / 予定数量 / 承認状態 / 状態 / 更新日 |
| ShippingOrder | 出荷書番号 / 受注番号 / 種別 / 状態 / 出荷日 |
| DeliveryNote | 納品番号 / 出荷書番号 / 納品先 / 方法 / 状態 / 納品日 |
| Invoice | 請求番号 / 顧客 / 請求期間 / 合計金額 / 状態 / 発行日 |
| BillingClosing | 顧客 / 締日 / 合計金額 / 状態 / 処理日 |
| DesignRequest | 依頼番号 / トリガー / 製品 / 状態 / 更新日 |
| MaterialReceipt | 素材 / 仕入先 / 数量 / 入荷日 |
| OutsourceOrder | 外注先 / 工程 / 依頼日 / 入荷予定日 / 入荷日 / 状態 |
| Customer | BPコード / 名称 / 支店数 / 状態 / 更新日 |
| EndUser | BPコード / 名称 / 業種 / 状態 |
| Product | 製品コード / 名称 / 素材 / 単位 / 状態 |
| MaterialType | 材種コード / 名称 / 状態 |
| Material | 素材コード / 材種 / 名称 / 形態 / 単位 / 状態 |
| Supplier | BPコード / 名称 / 外注種別 / 標準リードタイム / 状態 |
| ProcessStep | コード / 名称 / カテゴリ / 実施場所 / 同期可 / 検査 / 承認 |
| InspectionTemplate | コード / 名称 / 関連工程 / 状態 |
| DefectType | コード / 名称 / 状態 |
| ApprovalGroup | 名称 / 種別 / メンバー数 / 状態 |
| OrgUnit | コード / 名称 / 種別 / 国 / タイムゾーン / 通貨 / 状態 |

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
- Cancelling a document (受注書、指示書 etc.)
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

| Concept | Japanese term | Abbreviation/code |
|---------|---------------|-------------------|
| 見積書 | 見積書 | QOT |
| 注文受諾書 | 注文受諾書 | ORD |
| 受注書 | 受注書 | ORD-...-NN |
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
| 承認グループ | 承認グループ | — |
| 操作コード | 操作コード | operation code |
| 下書き | 下書き | DRAFT |
| 確定 | 確定 | CONFIRMED |
| キャンセル | キャンセル | CANCELLED |
| 差し戻し | 差し戻し | REJECTED |

Do **not** use synonyms — e.g. never write "注文書" where "注文受諾書" is meant.

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
| Currency | `Intl.NumberFormat(uiLocale, { style: 'currency', currency: doc.currency })` — always the **document's** currency, never hardcode JPY | `¥250,000` / `US$1,200.00` |
| Quantity | integer + unit (e.g. `50 本`) | `50 本` |
| Relative time (notifications) | `X分前`, `X時間前`, `昨日` | `5分前` |

Use `date-fns` v4 for date formatting (+ `@date-fns/tz` for timezone conversion — DB values are UTC; render in the user's timezone, falling back to their primary site's timezone). Import only what is needed (tree-shakeable).

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
  - Action buttons: button group → `...` menu dropdown.
  - Timestamps: footer row → inline Group in summary card.
