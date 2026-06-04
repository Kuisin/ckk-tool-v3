# Design

UI component structure, design tokens, and Mantine v9 design rules for the CKK manufacturing management system.

---

## 0. Design Tokens

Design tokens are the single source of truth for all visual decisions. Screens and components must reference semantic token names — never raw hex values or hard-coded pixel values.

### 0.1 Color

Mantine's built-in color palette serves as the primitive layer. Semantic roles are derived from those primitives.

```ts
// Semantic color roles — use these names in code, not hex
const colorRoles = {
  // Surface
  'surface-default': 'var(--mantine-color-white)',          // page background
  'surface-subtle':  'var(--mantine-color-gray-0)',         // zebra rows, sidebar bg
  'surface-raised':  'var(--mantine-color-white)',          // Paper with shadow

  // Brand / Primary
  primary:           'var(--mantine-color-blue-6)',
  'primary-light':   'var(--mantine-color-blue-0)',         // hover fill on subtle buttons
  'primary-hover':   'var(--mantine-color-blue-7)',

  // Semantic state
  success:           'var(--mantine-color-green-6)',
  danger:            'var(--mantine-color-red-6)',
  warning:           'var(--mantine-color-orange-6)',
  info:              'var(--mantine-color-blue-5)',

  // Text
  'text-default':    'var(--mantine-color-dark-9)',         // body copy
  'text-muted':      'var(--mantine-color-dimmed)',         // labels, secondary info
  'text-disabled':   'var(--mantine-color-gray-5)',

  // Border
  'border-default':  'var(--mantine-color-gray-3)',
  'border-focus':    'var(--mantine-color-blue-5)',
  'border-error':    'var(--mantine-color-red-6)',
}
```

**Rules:**
- Never reference `#e03131` — always reference `danger`.
- Never reference `#2f9e44` — always reference `success`.
- Light/dark variant: not currently used; keep all UI in light mode only.

### 0.2 Typography

Font family: `system-ui, -apple-system, sans-serif` (set in Mantine theme).

**Size scale** (Mantine tokens):

| Token | px  | Usage |
|-------|-----|-------|
| `xs`  | 12  | supplementary labels, timestamps in timelines |
| `sm`  | 14  | **default** — all form inputs, table cells, body text |
| `md`  | 16  | — (not commonly used directly) |
| `lg`  | 18  | — |
| `xl`  | 20  | — |

**Title scale:**

| `order` | Size   | Weight | Usage |
|---------|--------|--------|-------|
| 1       | 2rem   | 700    | not used in app (marketing only) |
| 2       | 1.5rem | 700    | page titles |
| 3       | 1.25rem| 600    | section headings in step/detail pages |
| 4       | 1rem   | 600    | form section labels, panel headers |

**Monospace font** (`ff="mono"`): document numbers, lot numbers, codes.

### 0.3 Spacing

4 px base, 8 px grid. Use Mantine's named scale:

| Token | Value | Common usage |
|-------|-------|--------------|
| `xs`  | 4 px  | compact gaps (chip rows, badge clusters) |
| `sm`  | 8 px  | form field gap, inline groups |
| `md`  | 16 px | **default** — section gap, page content padding |
| `lg`  | 24 px | between major page sections |
| `xl`  | 32 px | top/bottom of page |

Patterns:
- Page content wrapper: `p="md"` (16 px)
- Section `Stack` gap: `gap="md"`
- Form `SimpleGrid` gap: `gap="sm"`
- Compact list: `gap="xs"`

### 0.4 Radius

| Token | Value | Usage |
|-------|-------|-------|
| `xs`  | 2 px  | — |
| `sm`  | 4 px  | **default** — buttons, inputs, badges |
| `md`  | 8 px  | Paper cards |
| `lg`  | 16 px | modals |
| `xl`  | 32 px | pill shape (not used) |

### 0.5 Shadows / Elevation

| Level | Mantine value | Usage |
|-------|---------------|-------|
| 0     | none          | inline elements, table rows, flat containers |
| 1     | `shadow="xs"` | `Paper` — filter bars, form sections, list wrappers |
| 2     | `shadow="sm"` | dropdowns, floating panels |
| 3     | `shadow="md"` | modals, drawers |

### 0.6 Z-index Layers

```ts
const zIndex = {
  base:         0,
  raised:       100,  // sticky headers, pinned filter bars
  dropdown:     200,  // Select / Combobox popover
  overlay:      300,  // LoadingOverlay, dimmed backdrop
  modal:        400,  // Modal, Drawer
  notification: 500,  // Notification toasts — always on top
}
```

### 0.7 Breakpoints

Mantine defaults — use these names, not pixel literals:

| Name | px   | Behaviour |
|------|------|-----------|
| `xs` | 576  | — |
| `sm` | 768  | navbar collapses, 2-col grids stack to 1 |
| `md` | 992  | — |
| `lg` | 1200 | primary desktop target |
| `xl` | 1400 | — |

---

## 1. Mantine Theme Configuration

`src/app/layout.tsx` wraps the app in `MantineProvider` with the following theme:

```ts
createTheme({
  primaryColor: 'blue',
  defaultRadius: 'sm',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  colors: {
    // extend only if a brand color is needed beyond Mantine defaults
  },
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

## 2. Component System

### 2.1 Button Variants

| Variant     | Mantine prop              | Usage |
|-------------|---------------------------|-------|
| Primary     | `variant="filled"`        | single primary action per page (New, Submit) |
| Secondary    | `variant="default"`       | secondary actions (Edit, PDF download, Cancel-link) |
| Ghost       | `variant="subtle"`        | low-emphasis actions (Add row, Reset filter) |
| Danger      | `variant="filled" color="red"` | destructive — inside ConfirmModal only |
| Danger ghost| `variant="outline" color="red"` | destructive secondary (Rollback in step exec page) |

### 2.2 Required States

Every interactive component must handle:

| State     | Visual |
|-----------|--------|
| Default   | Mantine default |
| Hover     | Mantine built-in (`primary-light` fill for ghost) |
| Focus     | 2 px blue outline ring — **never suppress** |
| Disabled  | `disabled` prop — gray text, no pointer events |
| Loading   | `loading` prop on Button (spinner replaces icon) |
| Error     | `error` prop on inputs — red border + error text below |

### 2.3 Standard Sizes

- Default size for all form controls: `sm` (set globally in theme)
- Field-operation pages (tablet): `size="lg"` for all interactive elements
- Action icons inside table rows: `size="sm"`, `variant="subtle"`

---

## 3. AppShell Layout

```
AppShell
├── Header (height: 60)
│   ├── Burger (mobile toggle)
│   ├── Text "CKK" (logo / brand)
│   ├── [spacer]
│   └── Group
│       ├── ActionIcon (notifications)
│       └── Menu (user avatar → profile, logout)
├── Navbar (width: 260, collapsible on mobile)
│   ├── ScrollArea
│   │   └── NavSection[] (see §4 Navigation)
│   └── [bottom] user display name + role badge
└── AppShell.Main
    └── <page content>
```

File: `src/components/layout/AppShell.tsx` — `'use client'`

---

## 4. Navigation

Each nav section maps to a route group. Use Mantine `NavLink` with a Tabler icon. Route paths follow the directory structure in `_specs/structure.md`.

```
NavLink Dashboard
NavLink 販売                   (collapsible)
  NavLink 価格表
  NavLink 見積書
  NavLink 注文受諾書
  NavLink 設計依頼書
NavLink 購買                   (collapsible)
  NavLink 素材入荷
  NavLink 外注依頼
NavLink 生産                   (collapsible)
  NavLink 受注書
  NavLink 指示書
  NavLink 承認管理
  NavLink 製品在庫
  NavLink 素材在庫
NavLink 出荷                   (collapsible)
  NavLink 出荷書
  NavLink 納品書
NavLink 請求                   (collapsible)
  NavLink 請求書
  NavLink 締日処理
NavLink マスタ                 (collapsible)
  NavLink 顧客
  NavLink 最終需要家
  NavLink 製品
  NavLink 材種
  NavLink 素材
  NavLink 外注企業
  NavLink 工程マスタ
  NavLink 検査表テンプレート
  NavLink 不良種類
  NavLink 承認グループ
```

File: `src/components/layout/AppNav.tsx` — `'use client'`

---

## 5. Page Patterns

All pages live inside `src/app/(dashboard)/`. Each page uses server components by default; interactive parts are extracted into `'use client'` components.

### 5.1 List Page

Used for every index route (`page.tsx`).

```
Stack (gap="md")
├── Group (justify="space-between", align="flex-end")
│   ├── Stack (gap=2)
│   │   ├── Breadcrumbs
│   │   └── Title order={2}
│   └── Button variant="filled" leftSection=<IconPlus> → /new
├── Paper (shadow="xs", p="sm")
│   ├── Group (filter bar, wrap="wrap", gap="sm")
│   │   ├── TextInput (search, leftSection=<IconSearch>, w={220})
│   │   ├── Select[] (status filter, etc.)
│   │   └── Button variant="subtle" (reset filters)
│   └── DataTable (mantine-datatable)
│       columns: [see §9 per entity]
│       records: server-fetched
│       totalRecords / page / onPageChange (URL search params)
│       recordsPerPage: 20 (default)
│       sortStatus / onSortStatusChange (URL search params)
└── [if empty] EmptyState (see §6.3)
```

- Pagination, filters, and sort use URL search params.
- `'use client'` wrapper component holds the DataTable + filter bar.
- Component path: `src/components/<section>/<EntityName>Table.tsx`
- Filter bar inputs use controlled state synced to URL params via `useRouter` + `useSearchParams`.

### 5.2 Detail Page

Used for every `[id]/page.tsx`.

```
Stack (gap="md")
├── Group (justify="space-between", align="flex-start")
│   ├── Stack (gap=2)
│   │   ├── Breadcrumbs
│   │   └── Group
│   │       ├── Title order={2}
│   │       └── StatusBadge (see §6)
│   └── Group (actions)
│       ├── Button variant="default" leftSection=<IconEdit> → /edit  (if editable)
│       ├── Button variant="default" leftSection=<IconFileDownload> (PDF download)
│       └── Menu (more actions: cancel, copy, etc.)
├── SimpleGrid cols={{ base:1, sm:2, lg:3 }} (summary card)
│   └── FieldValue[] (label + value pair)
├── Tabs defaultValue="items"
│   ├── Tabs.List
│   │   ├── Tabs.Tab value="items"     明細
│   │   ├── Tabs.Tab value="related"   関連
│   │   └── Tabs.Tab value="history"   履歴
│   ├── Tabs.Panel value="items"
│   │   └── Table / DataTable (line items)
│   ├── Tabs.Panel value="related"
│   │   └── related documents list
│   └── Tabs.Panel value="history"
│       └── AuditTimeline (see §8.1)
└── [bottom] timestamps: 作成 / 更新
```

### 5.3 Form Page (New / Edit)

Used for `new/page.tsx` and `[id]/edit/page.tsx`.

```
Stack (gap="md")
├── Group (justify="space-between")
│   ├── Stack (gap=2)
│   │   ├── Breadcrumbs
│   │   └── Title order={2}
│   └── [optional status badge if edit]
├── form (action=server action or client submit)
│   ├── Paper (shadow="xs", p="md") — Section 1
│   │   ├── Title order={4} (section label)
│   │   ├── Divider
│   │   └── SimpleGrid cols={{ base:1, sm:2 }}
│   │       └── TextInput / Select / DatePickerInput / NumberInput / Textarea
│   ├── Paper (shadow="xs", p="md") — Section 2 (line items, if needed)
│   │   ├── Title order={4}
│   │   ├── Divider
│   │   ├── Table (editable rows)
│   │   └── Button variant="subtle" leftSection=<IconPlus> (add row)
│   └── Group (justify="flex-end", mt="md")
│       ├── Button variant="default" component={Link} (cancel → back)
│       └── Button type="submit" variant="filled" (save)
```

Client form component uses `@mantine/form` with Zod schema adapter.

### 5.4 Empty / Loading / Error States

**Empty state** (no records match filter):
```
Center py="xl"
└── Stack align="center" gap="sm"
    ├── ThemeIcon size="xl" variant="light" color="gray"  (contextual icon)
    ├── Text c="dimmed" size="sm"  "データがありません"
    └── [if first-time] Button variant="subtle" → /new  "追加する"
```

**Loading state** (while server component is streaming or RSC is pending):
```
Center py="xl"
└── Loader size="md" color="blue"
```
For client-side data re-fetches (filter/page change): `DataTable` built-in `fetching` prop shows an overlay spinner — use this, do not add a custom loader.

**Error state** (server action or fetch error):
```
Alert variant="light" color="red" icon=<IconAlertCircle>
title="エラーが発生しました"
└── Text size="sm"  {error.message}
```
Place at the top of the form (above first Paper section) when a server action returns an error.

---

## 6. Status Badges

`src/components/ui/StatusBadge.tsx` — maps enum values to Mantine `Badge` colors.

| Entity | Status | Color |
|--------|--------|-------|
| Quote | DRAFT | gray |
| Quote | ISSUED | blue |
| Quote | ACCEPTED | green |
| Quote | REJECTED | red |
| Quote | EXPIRED | orange |
| OrderAcceptance | PENDING | yellow |
| OrderAcceptance | PRICE_DIFF | orange |
| OrderAcceptance | CONFIRMED | green |
| SalesOrder | DRAFT | gray |
| SalesOrder | CONFIRMED | blue |
| SalesOrder | IN_PRODUCTION | violet |
| SalesOrder | PARTIAL_SHIPPED | orange |
| SalesOrder | SHIPPED | green |
| SalesOrder | CANCELLED | red |
| WorkOrder | DRAFT | gray |
| WorkOrder | PENDING_APPROVAL | yellow |
| WorkOrder | APPROVED | blue |
| WorkOrder | IN_PROGRESS | violet |
| WorkOrder | COMPLETED | green |
| WorkOrder | CANCELLED | red |
| WorkOrder (approval) | NONE | gray |
| WorkOrder (approval) | PENDING_1ST | yellow |
| WorkOrder (approval) | APPROVED_1ST | blue |
| WorkOrder (approval) | PENDING_2ND | orange |
| WorkOrder (approval) | APPROVED | green |
| WorkOrder (approval) | REJECTED | red |
| StepStatus | PENDING | gray |
| StepStatus | IN_PROGRESS | blue |
| StepStatus | COMPLETED | green |
| StepStatus | CANCELLED | red |
| ShippingOrder | DRAFT | gray |
| ShippingOrder | CONFIRMED | blue |
| ShippingOrder | SHIPPED | green |
| DeliveryNote | DRAFT | gray |
| DeliveryNote | ISSUED | blue |
| DeliveryNote | DELIVERED | green |
| Invoice | DRAFT | gray |
| Invoice | ISSUED | blue |
| Invoice | SENT | violet |
| Invoice | PAID | green |
| InspectionRecord | PENDING | gray |
| InspectionRecord | PASS | green |
| InspectionRecord | FAIL | red |
| InspectionRecord | APPROVED | teal |
| DesignRequest | PENDING | gray |
| DesignRequest | IN_PROGRESS | blue |
| DesignRequest | COMPLETED | green |
| BillingClosing | PENDING | gray |
| BillingClosing | PROCESSED | blue |
| BillingClosing | EXPORTED | green |

---

## 7. Common UI Components

### 7.1 FieldValue

`src/components/ui/FieldValue.tsx`

Renders a label/value pair inside a detail page summary grid.

```tsx
// props: label: string, value: ReactNode, span?: number
<Stack gap={2}>
  <Text size="xs" c="dimmed">{label}</Text>
  <Text size="sm" fw={500}>{value ?? '—'}</Text>
</Stack>
```

### 7.2 PageHeader

`src/components/ui/PageHeader.tsx`

```tsx
// props: title, breadcrumbs, actions, status?
<Group justify="space-between" align="flex-start">
  <Stack gap={4}>
    <Breadcrumbs>{...}</Breadcrumbs>
    <Group gap="xs">
      <Title order={2}>{title}</Title>
      {status && <StatusBadge status={status} />}
    </Group>
  </Stack>
  <Group>{actions}</Group>
</Group>
```

### 7.3 EmptyState

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

### 7.4 ConfirmModal

`src/components/ui/ConfirmModal.tsx` — `'use client'`

Wraps `modals.openConfirmModal` from `@mantine/modals`. Used for destructive actions (cancel, delete, reject).

```tsx
// usage
modals.openConfirmModal({
  title: 'キャンセルの確認',
  children: <Text size="sm">この操作は取り消せません。</Text>,
  labels: { confirm: '実行', cancel: '戻る' },
  confirmProps: { color: 'red' },
  onConfirm: () => action(),
})
```

### 7.5 PdfButton

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

### 7.6 JsonLocalizedText

`src/components/ui/JsonLocalizedText.tsx`

Renders `{ ja: string, en: string }` JSON field using current locale.

```tsx
// props: value: { ja: string; en: string } | null
const { locale } = useLocale()
return <>{value?.[locale] ?? value?.ja ?? '—'}</>
```

### 7.7 MoneyText

`src/components/ui/MoneyText.tsx`

Renders numeric currency with locale formatting.

```tsx
// props: value: number | null, currency?: string
new Intl.NumberFormat('ja-JP', { style: 'currency', currency: currency ?? 'JPY' }).format(value)
```

---

## 8. Section-Specific Components

### 8.1 AuditTimeline

`src/components/production/AuditTimeline.tsx`

Renders `audit_logs` for a record in reverse-chronological order.

```
Timeline
└── Timeline.Item (per audit_log row)
    bullet: user avatar initial
    title: action (CREATE / UPDATE / DELETE)
    ├── Text size="xs" c="dimmed" — timestamp + user
    └── [optional] JSON diff of before_data / after_data
```

### 8.2 WorkOrderStepsPanel

`src/components/production/WorkOrderStepsPanel.tsx` — `'use client'`

Used on the work order detail page to display process step workflow.

```
Stack
├── Group (justify="space-between")
│   ├── Title order={4} "工程ワークフロー"
│   └── [if APPROVED or IN_PROGRESS] Button "変更承認依頼"
└── Stack gap="xs"
    └── [per work_order_step] StepCard
```

**StepCard** (`src/components/production/StepCard.tsx`)

```
Paper (withBorder, p="sm")
├── Group (justify="space-between")
│   ├── Group
│   │   ├── ThemeIcon (color by STEP_STATUS)
│   │   │   PENDING → gray clock
│   │   │   IN_PROGRESS → blue loader
│   │   │   COMPLETED → green check
│   │   │   CANCELLED → red x
│   │   ├── Text fw={600} (step name from process_step_catalog)
│   │   └── Badge (execution_location: 社内 | 外注)
│   └── [if execution_location=OUTSOURCE] supplier name
├── [if IN_PROGRESS or COMPLETED] Group (timestamps)
│   ├── Text size="xs" "開始: {started_at} ({started_by})"
│   └── Text size="xs" "完了: {completed_at} ({completed_by})"
├── [if OUTSOURCE] Group (outsource dates)
│   ├── DateText label="依頼日" value={outsource_requested_at}
│   ├── DateText label="入荷予定" value={outsource_expected_at}
│   └── DateText label="入荷日" value={outsource_received_at}
└── [if has defect_records] Accordion (不良記録)
    └── DefectRecordList
```

### 8.3 WorkOrderStepExecutionPage

`src/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/page.tsx`

Field-operation page. Optimized for tablet use.

```
Stack (gap="md", p="md")
├── Paper (withBorder, p="lg") — step identity
│   ├── Title order={3} (process step name)
│   ├── Group
│   │   ├── Text "指示書 #" {work_order_number}
│   │   └── StatusBadge (step status)
│   └── [if session_locked_by != current user] Alert color="red"
│       "別のユーザーがセッション中です"
├── [if IN_PROGRESS] Paper — InspectionRecordForm (see 8.5)
├── Paper — DefectRecordForm (see 8.6)
└── Group (justify="center", mt="xl")
    ├── [if PENDING and can_start] Button size="lg" color="blue"
    │   "工程開始"
    ├── [if IN_PROGRESS] Button size="lg" color="green"
    │   "工程完了"
    └── [if IN_PROGRESS] Button size="lg" color="red" variant="outline"
        "キャンセル（巻き戻し）" → ConfirmModal
```

### 8.4 ApprovalStatusPanel

`src/components/production/ApprovalStatusPanel.tsx`

Shown on the work order detail page when `approval_status != NONE`.

```
Paper (withBorder, p="md")
├── Title order={4} "承認状況"
├── Stepper (active based on approval_status, orientation="horizontal")
│   ├── Stepper.Step label="第一承認" description="工場長・部長クラス"
│   │   [if APPROVED_1ST or later] completed
│   │   [if PENDING_1ST] loading indicator
│   └── Stepper.Step label="第二承認" description="部長クラス"
│       [if APPROVED] completed
│       [if PENDING_2ND] loading indicator
├── [if current user is approver and PENDING] Group
│   ├── Button color="green" "承認"
│   └── Button color="red" variant="outline" "差し戻し"
└── [previous records] approval_records list
    └── Group (approver name + acted_at + action badge + comment)
```

### 8.5 InspectionRecordForm

`src/components/production/InspectionRecordForm.tsx` — `'use client'`

```
Stack
├── Title order={4} (template name)
└── Table
    ├── thead: 検査項目 / 許容値 / 実測値 / 合否
    └── tbody: [per inspection_template_item]
        ├── Text (item_name)
        ├── Text (tolerance_min ~ tolerance_max unit)
        ├── TextInput (measured_value)
        └── SegmentedControl ["合格", "不合格"]
```

### 8.6 DefectRecordForm

`src/components/production/DefectRecordForm.tsx` — `'use client'`

```
Paper (withBorder, p="md")
├── Title order={4} "不良記録（任意）"
└── [per defect entry]
    ├── Select (defect_type_id, options from defect_types)
    └── Textarea (description, required if type selected)
└── Button variant="subtle" leftSection=<IconPlus> "追加"
```

### 8.7 InventoryBadge

`src/components/production/InventoryBadge.tsx`

Inline badge showing available quantity for a product/material. Used in list views and order forms.

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

### 8.8 CustomerSelect

`src/components/master/CustomerSelect.tsx` — `'use client'`

Two-level select: customer → branch. Used in all forms that have `customer_id` + optional `customer_branch_id`.

```
Stack gap="xs"
├── Select label="顧客" data={customers} searchable
└── Select label="支店" data={branches filtered by customer} disabled if no customer
```

### 8.9 ProductPriceResolverInput

`src/components/sales/ProductPriceResolverInput.tsx` — `'use client'`

Used in quote and order acceptance forms. After selecting product + quantity, auto-resolves unit price from `price_lists`.

```
Group align="flex-end"
├── Select (product_id) searchable
├── Select (order_type)
├── NumberInput (quantity)
├── NumberInput (unit_price) — auto-filled, editable override
└── Text (= amount, computed)
```

---

## 9. List Page Column Specifications

All list pages use `mantine-datatable`. Row click navigates to the detail page. See §10 for column render conventions.

### 9.1 Sales

**価格表** (`/sales/price-lists`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 顧客 | `customer_bp_id` | customer name (ja) |
| 2 | 製品 | `product_id` | product name (ja) |
| 3 | 注文種別 | `order_type` | Badge |
| 4 | 最小数量 | `min_quantity` | right-aligned |
| 5 | 最大数量 | `max_quantity` | right-aligned, `—` if null |
| 6 | 単価 | `unit_price` | MoneyText |
| 7 | 有効期間 | `valid_from` / `valid_until` | `yyyy/MM/dd〜yyyy/MM/dd` |
| 8 | 状態 | `is_active` | Boolean Badge |
| 9 | 操作 | `actions` | Edit ActionIcon |

Filter bar: 顧客 Select, 製品 Select, 注文種別 Select, 有効日 DatePickerInput (range)

**見積書** (`/sales/quotes`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 見積番号 | `quote_number` | monospace |
| 2 | 顧客 | `customer_bp_id` | customer name (ja) |
| 3 | 状態 | `status` | StatusBadge |
| 4 | 有効期限 | `valid_until` | Date |
| 5 | 作成日 | `created_at` | Date |
| 6 | 操作 | `actions` | Edit + PDF ActionIcons |

Filter bar: キーワード TextInput, 状態 Select, 顧客 Select, 作成日 DatePickerInput (range)

**注文受諾書** (`/sales/order-acceptances`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 注文番号 | `order_number` | monospace |
| 2 | 顧客 | `customer_bp_id` | customer name (ja) |
| 3 | 顧客注文書番号 | `customer_order_ref` | — |
| 4 | 状態 | `status` | StatusBadge |
| 5 | 合計金額 | `total_amount` | MoneyText |
| 6 | 作成日 | `created_at` | Date |
| 7 | 操作 | `actions` | Edit ActionIcon |

Filter bar: キーワード TextInput, 状態 Select, 顧客 Select

**設計依頼書** (`/sales/design-requests`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 依頼番号 | `request_number` | monospace |
| 2 | トリガー | `trigger` | Badge (見積時 / 受注時) |
| 3 | 製品 | `product_id` | product name (ja) |
| 4 | 状態 | `status` | StatusBadge |
| 5 | 完了日 | `completed_at` | Date |
| 6 | 作成日 | `created_at` | Date |
| 7 | 操作 | `actions` | View ActionIcon |

Filter bar: キーワード TextInput, 状態 Select, トリガー Select

### 9.2 Purchase

**素材入荷** (`/purchase/material-receipts`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 素材 | `material_id` | material name (ja) |
| 2 | 仕入先 | `supplier_bp_id` | BP name (ja) |
| 3 | 数量 | `quantity` | right-aligned + unit |
| 4 | 入荷日 | `received_at` | Date |
| 5 | 登録日 | `created_at` | Date |
| 6 | 操作 | `actions` | View ActionIcon |

Filter bar: 素材 Select, 仕入先 Select, 入荷日 DatePickerInput (range)

**外注依頼** (`/purchase/outsource-orders`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 指示書# | `work_order_number` | monospace |
| 2 | 外注先 | `supplier_bp_id` | BP name (ja) |
| 3 | 工程 | `process_step_id` | process step name (ja) |
| 4 | 状態 | `status` | StatusBadge (STEP_STATUS) |
| 5 | 依頼日 | `outsource_requested_at` | Date |
| 6 | 入荷予定 | `outsource_expected_at` | Date |
| 7 | 入荷日 | `outsource_received_at` | Date |
| 8 | 操作 | `actions` | Edit ActionIcon |

Filter bar: 外注先 Select, 状態 Select, 入荷予定 DatePickerInput (range)

### 9.3 Production

**受注書** (`/production/sales-orders`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 受注番号 | `sales_order_number` | monospace |
| 2 | 製品 | `product_id` | product name (ja) |
| 3 | 注文種別 | `order_type` | Badge |
| 4 | 数量 | `quantity` | right-aligned |
| 5 | 金額 | `amount` | MoneyText |
| 6 | 状態 | `status` | StatusBadge |
| 7 | 納期 | `delivery_date` | Date |
| 8 | 操作 | `actions` | Edit ActionIcon |

Filter bar: キーワード TextInput, 状態 Select, 注文種別 Select, 納期 DatePickerInput (range)

**指示書** (`/production/work-orders`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 指示書# | `work_order_number` | monospace |
| 2 | 製品 | via `sales_order.product_id` | product name (ja) |
| 3 | 種別 | `type` | Badge (在庫分 / 製造分) |
| 4 | 数量 | `planned_quantity` | right-aligned |
| 5 | 状態 | `status` | StatusBadge |
| 6 | 承認状態 | `approval_status` | StatusBadge |
| 7 | 作成日 | `created_at` | Date |
| 8 | 操作 | `actions` | Edit ActionIcon |

Filter bar: キーワード TextInput, 状態 Select, 承認状態 Select, 種別 Select

**承認管理** (`/production/approvals`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 指示書# | `work_order_number` | monospace |
| 2 | 申請者 | `requested_by` | user display name |
| 3 | 承認ステップ | `step` | Badge (第一 / 第二) |
| 4 | 状態 | `status` | StatusBadge |
| 5 | 申請日 | `requested_at` | Datetime |
| 6 | 操作 | `actions` | View ActionIcon |

Filter bar: 状態 Select, 承認ステップ Select

**製品在庫** (`/production/inventory/products`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 製品コード | `product_id` | monospace |
| 2 | 名称 | product name | JsonLocalizedText |
| 3 | ロット# | `lot_number` | monospace, `—` if null |
| 4 | 在庫数 | `quantity` | right-aligned |
| 5 | 予約数 | `reserved_quantity` | right-aligned, orange if > 0 |
| 6 | 有効在庫 | computed | `quantity - reserved_quantity`, right-aligned |
| 7 | 保管場所 | `location` | — |
| 8 | 操作 | `actions` | View ActionIcon |

Filter bar: 製品 Select, 保管場所 TextInput

**素材在庫** (`/production/inventory/materials`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 素材コード | `material_id` | monospace |
| 2 | 名称 | material name | JsonLocalizedText |
| 3 | 在庫数 | `quantity` | right-aligned + unit |
| 4 | 予約数 | `reserved_quantity` | right-aligned, orange if > 0 |
| 5 | 有効在庫 | computed | `quantity - reserved_quantity`, right-aligned |
| 6 | 単位 | `unit` | — |
| 7 | 保管場所 | `location` | — |
| 8 | 操作 | `actions` | View ActionIcon |

Filter bar: 素材 Select, 材種 Select

### 9.4 Shipping

**出荷書** (`/shipping/shipping-orders`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 受注番号 | via `sales_order` | monospace link |
| 2 | 種別 | `type` | Badge (在庫保管 / 発送) |
| 3 | 状態 | `status` | StatusBadge |
| 4 | 出荷日 | `shipped_at` | Datetime |
| 5 | 作成日 | `created_at` | Date |
| 6 | 操作 | `actions` | Edit ActionIcon |

Filter bar: 状態 Select, 種別 Select, 出荷日 DatePickerInput (range)

**納品書** (`/shipping/delivery-notes`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 納品番号 | `delivery_number` | monospace |
| 2 | 顧客 | `recipient_bp_id` | BP name (ja) |
| 3 | 配送方法 | `delivery_method` | Badge |
| 4 | 状態 | `status` | StatusBadge |
| 5 | 納品日 | `delivered_at` | Datetime |
| 6 | 作成日 | `created_at` | Date |
| 7 | 操作 | `actions` | Edit + PDF ActionIcons |

Filter bar: キーワード TextInput, 状態 Select, 顧客 Select, 納品日 DatePickerInput (range)

### 9.5 Billing

**請求書** (`/billing/invoices`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 請求番号 | `invoice_number` | monospace |
| 2 | 顧客 | `customer_bp_id` | BP name (ja) |
| 3 | 請求期間 | `billing_period_from` / `billing_period_to` | `yyyy/MM/dd〜yyyy/MM/dd` |
| 4 | 合計金額 | `total_amount` | MoneyText |
| 5 | 状態 | `status` | StatusBadge |
| 6 | 請求日 | `issued_at` | Date |
| 7 | 操作 | `actions` | View + PDF ActionIcons |

Filter bar: キーワード TextInput, 状態 Select, 顧客 Select, 請求日 DatePickerInput (range)

**締日処理** (`/billing/closings`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 顧客 | `customer_bp_id` | BP name (ja) |
| 2 | 締日 | `closing_date` | Date |
| 3 | 合計金額 | `total_amount` | MoneyText |
| 4 | 状態 | `status` | StatusBadge |
| 5 | 処理日 | `processed_at` | Datetime |
| 6 | 操作 | `actions` | View ActionIcon |

Filter bar: 顧客 Select, 状態 Select, 締日 DatePickerInput (range)

### 9.6 Master

**顧客** (`/master/customers`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | コード | `bp_code` | monospace |
| 2 | 名称 | `name` | JsonLocalizedText |
| 3 | 読み仮名 | `name_kana` | — |
| 4 | 支店数 | computed | count of children |
| 5 | 状態 | `is_active` | Boolean Badge |
| 6 | 更新日 | `updated_at` | Date |
| 7 | 操作 | `actions` | Edit ActionIcon |

**最終需要家** (`/master/end-users`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | コード | `bp_code` | monospace |
| 2 | 名称 | `name` | JsonLocalizedText |
| 3 | 業種 | `industry` (bp_end_user_attrs) | — |
| 4 | 状態 | `is_active` | Boolean Badge |
| 5 | 操作 | `actions` | Edit ActionIcon |

**製品** (`/master/products`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 製品コード | `id` | monospace |
| 2 | 名称 | `name` | JsonLocalizedText |
| 3 | 素材 | `material_id` | material name (ja) |
| 4 | 単位 | `unit` | — |
| 5 | 状態 | `is_active` | Boolean Badge |
| 6 | 操作 | `actions` | Edit ActionIcon |

**材種** (`/master/material-types`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | コード | `id` | monospace |
| 2 | 名称 | `name` | JsonLocalizedText |
| 3 | 状態 | `is_active` | Boolean Badge |
| 4 | 操作 | `actions` | Edit ActionIcon |

**素材** (`/master/materials`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | コード | `id` | monospace |
| 2 | 名称 | `name` | JsonLocalizedText |
| 3 | 材種 | `material_type_id` | material type name (ja) |
| 4 | 形状 | `material_form` | Badge |
| 5 | 単位 | `unit` | — |
| 6 | 状態 | `is_active` | Boolean Badge |
| 7 | 操作 | `actions` | Edit ActionIcon |

Filter bar: キーワード TextInput, 材種 Select, 形状 Select

**外注企業** (`/master/suppliers`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | コード | `bp_code` | monospace |
| 2 | 名称 | `name` | JsonLocalizedText |
| 3 | 種別 | `vendor_type` (bp_vendor_attrs) | Badge (仕入先 / 外注先) |
| 4 | 状態 | `is_active` | Boolean Badge |
| 5 | 操作 | `actions` | Edit ActionIcon |

**工程マスタ** (`/master/process-steps`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | コード | `code` | monospace |
| 2 | 名称 | `name` | JsonLocalizedText |
| 3 | カテゴリ | `category` | Badge |
| 4 | 実施場所 | `execution_location` | Badge |
| 5 | 同期可 | `is_sync_capable` | Boolean Badge |
| 6 | 検査工程 | `is_inspection` | Boolean Badge |
| 7 | 承認工程 | `is_approval_step` | Boolean Badge |
| 8 | 操作 | `actions` | Edit ActionIcon |

**検査表テンプレート** (`/master/inspection-templates`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | コード | `code` | monospace |
| 2 | 名称 | `name` | JsonLocalizedText |
| 3 | 関連工程 | `related_process_step_id` | process step name (ja) |
| 4 | 項目数 | computed | count of template_items |
| 5 | 状態 | `is_active` | Boolean Badge |
| 6 | 操作 | `actions` | Edit ActionIcon |

**不良種類** (`/master/defect-types`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | コード | `code` | monospace |
| 2 | 名称 | `name` | JsonLocalizedText |
| 3 | 並び順 | `sort_order` | right-aligned |
| 4 | 状態 | `is_active` | Boolean Badge |
| 5 | 操作 | `actions` | Edit ActionIcon |

**承認グループ** (`/master/approval-groups`)

| # | Header | accessor | Notes |
|---|--------|----------|-------|
| 1 | 名称 | `name` | JsonLocalizedText |
| 2 | 種別 | `type` | Badge (第一承認 / 第二承認 / ワークフロー変更) |
| 3 | メンバー数 | computed | count of active members |
| 4 | 状態 | `is_active` | Boolean Badge |
| 5 | 操作 | `actions` | Edit ActionIcon |

---

## 10. Master Data Pages (Detail Tabs)

All master data entities follow the standard list + detail + form pattern (§5).

### 10.1 Customers

**List columns**: see §9.6

**Detail tabs**: 概要 / 支店一覧 / 見積・受注履歴

**Customer Branch**: nested under `/master/customers/[id]/branches/`. List shown in customer detail tabs.

### 10.2 Products

**List columns**: see §9.6

**Detail**: includes `spec` JSON rendered as key-value table, design file link.

### 10.3 Process Steps (工程マスタ)

**List columns**: see §9.6

**Detail**: includes use-dependency and exec-dependency tables.

### 10.4 Inspection Templates

**Detail tabs**: テンプレート情報 / 検査項目

Items sub-table has inline add/edit (no separate page).

### 10.5 Approval Groups

**Detail tabs**: グループ情報 / メンバー / 代理設定

---

## 11. DataTable Column Conventions

Use `mantine-datatable` `DataTableColumn[]`. Standard render conventions:

| Column type | Render |
|-------------|--------|
| Document number | plain `Text`, `ff="mono"` |
| Status | `StatusBadge` component |
| Amount / price | right-aligned, `MoneyText` |
| Date | `date-fns format(date, 'yyyy/MM/dd')` |
| Timestamp | `date-fns format(ts, 'yyyy/MM/dd HH:mm')` |
| Localized JSON | `JsonLocalizedText` |
| Boolean | `Badge` green `有効` / gray `無効` |
| Actions | `Group` of `ActionIcon` (edit, view) — rightmost column, `accessor: 'actions'`, `width: 80` |

Row click navigates to the detail page (except Actions column which stops propagation).

---

## 12. Form Conventions

- Use `@mantine/form` with `zodResolver`.
- Server Actions handle submission (`action` prop on `<form>`).
- Show `notifications.show` (from `@mantine/notifications`) on success/error.
- `LoadingOverlay` during submission: `<Box pos="relative"><LoadingOverlay visible={isPending} /></Box>`.
- Required fields: Mantine `withAsterisk` prop.
- Monetary inputs: `NumberInput` with `prefix="¥"`, `thousandSeparator=","`, `decimalScale={2}`.
- Date fields: `DatePickerInput` from `@mantine/dates`, locale `ja`.
- All `Select` with `searchable` when options > 5.
- Server-side validation errors: render as `Alert variant="light" color="red"` above the first Paper section.

---

## 13. Behavior & Feedback

### 13.1 Feedback Hierarchy

Choose the feedback pattern based on the nature of the event:

| Pattern | When to use | Component |
|---------|-------------|-----------|
| **Toast notification** | Non-blocking success or background info | `notifications.show` |
| **Inline field error** | Field-level validation failure | `@mantine/form` `error` prop |
| **Form-level error** | Server action returned an error | `Alert color="red"` above form |
| **Confirmation modal** | Destructive or irreversible action | `modals.openConfirmModal` |
| **Alert banner** | Session-level warning (e.g. locked by another user) | `Alert color="orange"` full-width |

**Do not use** toast notifications for field validation errors — users miss them.

**Do not use** modals for routine confirmations (e.g. "Are you sure you want to save?") — only use them for destructive or irreversible operations.

### 13.2 Toast Notifications

```ts
// Success
notifications.show({
  color: 'green',
  icon: <IconCheck size={16} />,
  message: '保存しました',
  autoClose: 4000,
})

// Error (requires manual dismiss)
notifications.show({
  color: 'red',
  icon: <IconAlertCircle size={16} />,
  title: 'エラー',
  message: error.message,
  autoClose: false,
})
```

Auto-close durations:
- Success / info: **4000 ms**
- Warning: **6000 ms**
- Error: **do not auto-close** (set `autoClose: false`)

### 13.3 Confirmation Dialogs

Required before executing any of these operations:

| Operation | Confirm button color | Message |
|-----------|---------------------|---------|
| キャンセル（受注書、指示書等） | `red` | 「この操作は取り消せません。」 |
| 削除（マスタ） | `red` | 「削除すると復元できません。」 |
| 承認差し戻し | `orange` | 「差し戻し理由をコメントに記入してください。」 |
| 締日処理実行 | `red` | 「請求締日処理を実行します。この操作は取り消せません。」 |
| 工程キャンセル（巻き戻し） | `red` | 「工程をキャンセルし、前の状態に戻します。」 |

Pattern:
```ts
modals.openConfirmModal({
  title: '〇〇の確認',
  children: <Text size="sm">この操作は取り消せません。</Text>,
  labels: { confirm: '実行', cancel: '戻る' },
  confirmProps: { color: 'red' },
  onConfirm: () => serverAction(),
})
```

### 13.4 Transition Durations

Use Mantine's default transition values — do not override:
- Hover state color change: **150 ms** (Mantine default)
- Modal open/close: **200 ms**
- Notification slide-in: **250 ms**
- Navbar collapse (mobile): **300 ms**

Do not add custom CSS `transition` values beyond what Mantine applies by default.

---

## 14. Content & Locale

### 14.1 Terminology Glossary

Canonical Japanese display terms and their system/code equivalents. Use these terms consistently across all screens and messages.

| 画面表示（日本語） | DB / コード名 | 番号プレフィックス |
|---|---|---|
| 見積書 | `quote` | `QOT-YYYYMM-NNNNN` |
| 注文受諾書 | `order_acceptance` | `ORD-YYYYMM-NNNNN` |
| 受注書 | `sales_order` | `ORD-YYYYMM-NNNNN-NN` |
| 指示書 | `work_order` | 通し連番 (int) |
| ロット番号 | `lot_number` | 通し連番 (int) |
| 出荷書 | `shipping_order` | — |
| 納品書 | `delivery_note` | `DRN-YYYYMM-NNNNN` |
| 請求書 | `invoice` | `INV-YYYYMM-NNNNN` |
| 締日処理 | `billing_closing` | — |
| 材種 | `material_type` | `[A-Z][0-9]{2}[A-Z][0-9]{4}` |
| 素材 | `material` | `[材種コード]-[A-C][0-9]{3}-[0-9]{3}` |
| 製品 | `product` | `PRD-YYYYMM-NNNN` |
| 顧客 | `business_partner` (CUSTOMER role) | `BP-NNNNN` |
| 外注企業 / 仕入先 | `business_partner` (VENDOR role) | `BP-NNNNN` |
| 最終需要家 | `business_partner` (END_USER role) | `BP-NNNNN` |
| 支店 | `business_partner` (child, `parent_id` set) | — |
| 工程 / 工程マスタ | `process_step_catalog` | — |
| 指示書工程 | `work_order_step` | — |
| 設計依頼書 | `design_request` | — |
| 検査表テンプレート | `inspection_template` | — |
| 不良種類 | `defect_type` | — |
| 承認グループ | `approval_group` | — |

Do not use synonyms. Examples of terms to avoid:

| 使わない | 代わりに使う |
|----------|------------|
| 注文書 | 注文受諾書（order_acceptance）または受注書（sales_order）を文脈に応じて |
| オーダー | 受注書 |
| インボイス | 請求書 |
| PO | 注文受諾書 |
| ワーク | 指示書 |

### 14.2 敬語 Level and Message Tone

- **System messages**: Plain polite (~します / ~ました). Not formal (〜でございます).
- **Success toast**: Action-first, concise. 「保存しました」not「正常に処理が完了しました」.
- **Error messages**: Polite and direct. 「〜できませんでした」not「〜できかねます」.
- **Destructive confirmation**: Neutral and factual. 「この操作は取り消せません。」
- **Validation errors**: Specific and actionable. 「数量は1以上を入力してください。」not「入力エラーです。」
- **Empty state messages**: Encouraging. 「データがありません」+ secondary action when available.

### 14.3 Date, Number, and Currency Formatting

| Type | Format | Example | Notes |
|------|--------|---------|-------|
| Date | `yyyy/MM/dd` | `2026/06/04` | date-fns `format` |
| Datetime | `yyyy/MM/dd HH:mm` | `2026/06/04 14:30` | no seconds |
| Month | `yyyy年M月` | `2026年6月` | for billing period headers |
| Currency JPY | `¥1,234,567` | `¥1,234,567` | `Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' })` |
| Integer quantity | `1,234` | `1,234` | `Intl.NumberFormat('ja-JP')` |
| Decimal (measurement) | up to 3 decimal places | `1,234.567` | `Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })` |

Do **not** use `yyyy-MM-dd` (ISO dash format) in displayed text — use `yyyy/MM/dd` throughout the UI.

Null / missing values always render as `—` (em dash), never empty string or `null`.

---

## 15. Accessibility

### 15.1 Color Contrast

Minimum WCAG AA (4.5:1 for text, 3:1 for UI components):

| Use | Token | Foreground | Background | Ratio |
|-----|-------|-----------|------------|-------|
| Body text | `text-default` | `dark.9` (#101113) | white | ✅ AA |
| Muted / label text | `text-muted` (dimmed) | `gray.7` (#495057) | white | ✅ AA (borderline — do not use for interactive labels) |
| Error text | `danger` | `red.6` (#e03131) | white | ✅ AA |
| Primary button text | white | white | `blue.6` (#228be6) | ✅ AA |
| Disabled text | `text-disabled` | `gray.5` (#adb5bd) | white | ⚠️ intentionally below AA — expected for disabled state |

### 15.2 Focus Rings

- Mantine provides a 2 px blue outline focus ring on all interactive elements.
- **Never** add `outline: none` or `outline: 0` without providing a visible alternative.
- Focus rings must be visible in all states: default, hover, error.

### 15.3 Keyboard Navigation

| Component | Keyboard behavior |
|-----------|-------------------|
| DataTable rows | Tab to row, Enter to navigate to detail page |
| Modal | Focus trapped on open; Escape closes |
| Select / Combobox | Arrow keys navigate options; Enter selects; Escape dismisses |
| NavLink sections | Enter expands/collapses; Arrow keys move between items |
| Tabs | Arrow keys switch between tabs |
| ConfirmModal | Default focus on "戻る" (cancel) button, not destructive confirm |

All destructive confirm buttons must **not** receive default focus to prevent accidental keyboard activation.

### 15.4 Semantic HTML

- Page titles: use `<h1>`–`<h4>` via Mantine `Title order={N}` — one `order={2}` per page.
- Form labels: always use Mantine's `label` prop on inputs (renders `<label>` with `htmlFor`).
- Icon-only buttons: always include `aria-label`. Example: `<ActionIcon aria-label="編集">`.
- Status badges: supplement color with text — never convey state through color alone.

---

## 16. Realtime (SSE)

Pages that show live manufacturing progress (`/production/work-orders/[id]`) use an SSE hook.

`src/hooks/useWorkOrderSSE.ts` — `'use client'`

- Connects to `/api/sse/work-orders/[id]`.
- Updates local state with step status changes.
- Shows `<RingProgress>` or step cards refreshed in-place.

Approval notifications use `/api/sse/approvals` and show a `Notification` banner when a new request arrives for the current user.

---

## 17. Mobile / Tablet

The manufacturing step execution page (`/production/work-orders/[id]/steps/[stepId]`) must be tablet-friendly:

- All interactive elements `size="lg"`.
- Avoid hover-only states.
- `<Kbd>` shortcuts not used.
- Large touch targets (min 44 px).
- Session lock warning shown prominently (full-width `Alert`).

Other pages are primarily desktop (min-width 1024 px). Navbar collapses on `sm` breakpoint.
