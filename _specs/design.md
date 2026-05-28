# Design

UI component structure and Mantine v9 design rules for the CKK manufacturing management system.

---

## 1. Mantine Theme Configuration

`src/app/layout.tsx` wraps the app in `MantineProvider` with the following theme:

```ts
createTheme({
  primaryColor: 'blue',
  defaultRadius: 'sm',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  colors: {
    // extend if brand color is needed
  },
  components: {
    Button:      Button.extend({ defaultProps: { size: 'sm' } }),
    TextInput:   TextInput.extend({ defaultProps: { size: 'sm' } }),
    Select:      Select.extend({ defaultProps: { size: 'sm' } }),
    NumberInput: NumberInput.extend({ defaultProps: { size: 'sm' } }),
    DatePickerInput: DatePickerInput.extend({ defaultProps: { size: 'sm' } }),
    Badge:       Badge.extend({ defaultProps: { size: 'sm', radius: 'sm' } }),
    Table:       Table.extend({ defaultProps: { striped: true, highlightOnHover: true, withTableBorder: true, withColumnBorders: false } }),
  },
})
```

---

## 2. AppShell Layout

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
│   │   └── NavSection[] (see §3 Navigation)
│   └── [bottom] user display name + role badge
└── AppShell.Main
    └── <page content>
```

File: `src/components/layout/AppShell.tsx` — `'use client'`

---

## 3. Navigation

Each nav section maps to a route group. Use Mantine `NavLink` with Tabler icon.

```
NavLink Dashboard              /
NavLink 販売                   (collapsible)
  NavLink 価格表               /sales/price-lists
  NavLink 見積書               /sales/quotes
  NavLink 注文受諾書           /sales/order-acceptances
  NavLink 設計依頼書           /sales/design-requests
NavLink 購買                   (collapsible)
  NavLink 素材入荷             /purchase/material-receipts
  NavLink 外注依頼             /purchase/outsource-orders
NavLink 生産                   (collapsible)
  NavLink 受注書               /production/sales-orders
  NavLink 指示書               /production/work-orders
  NavLink 承認管理             /production/approvals
  NavLink 製品在庫             /production/inventory/products
  NavLink 素材在庫             /production/inventory/materials
NavLink 出荷                   (collapsible)
  NavLink 出荷書               /shipping/shipping-orders
  NavLink 納品書               /shipping/delivery-notes
NavLink 請求                   (collapsible)
  NavLink 請求書               /billing/invoices
  NavLink 締日処理             /billing/closings
NavLink マスタ                 (collapsible)
  NavLink 顧客                 /master/customers
  NavLink 最終需要家           /master/end-users
  NavLink 製品                 /master/products
  NavLink 材種                 /master/material-types
  NavLink 素材                 /master/materials
  NavLink 外注企業             /master/suppliers
  NavLink 工程マスタ           /master/process-steps
  NavLink 検査表テンプレート   /master/inspection-templates
  NavLink 不良種類             /master/defect-types
  NavLink 承認グループ         /master/approval-groups
```

File: `src/components/layout/AppNav.tsx` — `'use client'`

---

## 4. Page Patterns

All pages live inside `src/app/(dashboard)/`. Each page uses server components by default; interactive parts are extracted into `'use client'` components.

### 4.1 List Page

Used for every index route (`page.tsx`).

```
Stack (gap="md")
├── Group (justify="space-between", align="flex-end")
│   ├── Stack (gap=2)
│   │   ├── Breadcrumbs
│   │   └── Title order={2}
│   └── Button variant="filled" leftSection=<IconPlus> → /new
├── Paper (shadow="xs", p="sm")
│   ├── Group (filter bar)
│   │   ├── TextInput (search, leftSection=<IconSearch>)
│   │   ├── Select[] (status filter, etc.)
│   │   └── Button variant="subtle" (reset)
│   └── DataTable (mantine-datatable)
│       columns: [see per-section below]
│       records: server-fetched
│       totalRecords / page / onPageChange (URL search params)
└── [conditional] empty state — Center > Stack > icon + text + Button
```

Pagination and filters use URL search params (`useRouter` / `useSearchParams`) — `'use client'` wrapper component holding the DataTable + filter bar.

Component path: `src/components/<section>/<EntityName>Table.tsx`

### 4.2 Detail Page

Used for every `[id]/page.tsx`.

```
Stack (gap="md")
├── Group (justify="space-between", align="flex-start")
│   ├── Stack (gap=2)
│   │   ├── Breadcrumbs
│   │   └── Group
│   │       ├── Title order={2}
│   │       └── StatusBadge (see §5)
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
│       └── AuditTimeline (see §7.1)
└── [bottom] timestamps: 作成 / 更新
```

### 4.3 Form Page (New / Edit)

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
│       ├── Button variant="default" component={Link} (cancel)
│       └── Button type="submit" (save)
```

Client form component uses `@mantine/form` with Zod schema adapter.

---

## 5. Status Badges

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

## 6. Common UI Components

### 6.1 FieldValue

`src/components/ui/FieldValue.tsx`

Renders a label/value pair inside a detail page summary grid.

```tsx
// props: label: string, value: ReactNode, span?: number
<Stack gap={2}>
  <Text size="xs" c="dimmed">{label}</Text>
  <Text size="sm" fw={500}>{value ?? '—'}</Text>
</Stack>
```

### 6.2 PageHeader

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

### 6.3 EmptyState

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

### 6.4 ConfirmModal

`src/components/ui/ConfirmModal.tsx` — `'use client'`

Wraps `modals.openConfirmModal` from `@mantine/modals`. Used for destructive actions (cancel, delete).

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

### 6.5 PdfButton

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

### 6.6 JsonLocalizedText

`src/components/ui/JsonLocalizedText.tsx`

Renders `{ ja: string, en: string }` JSON field using current locale.

```tsx
// props: value: { ja: string; en: string } | null
const { locale } = useLocale()
return <>{value?.[locale] ?? value?.ja ?? '—'}</>
```

### 6.7 MoneyText

`src/components/ui/MoneyText.tsx`

Renders numeric currency with locale formatting.

```tsx
// props: value: number | null, currency?: string
new Intl.NumberFormat('ja-JP', { style: 'currency', currency: currency ?? 'JPY' }).format(value)
```

---

## 7. Section-Specific Components

### 7.1 AuditTimeline

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

### 7.2 WorkOrderStepsPanel

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

### 7.3 WorkOrderStepExecutionPage

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
├── [if IN_PROGRESS] Paper — InspectionRecordForm (see 7.5)
├── Paper — DefectRecordForm (see 7.6)
└── Group (justify="center", mt="xl")
    ├── [if PENDING and can_start] Button size="lg" color="blue"
    │   "工程開始"
    ├── [if IN_PROGRESS] Button size="lg" color="green"
    │   "工程完了"
    └── [if IN_PROGRESS] Button size="lg" color="red" variant="outline"
        "キャンセル（巻き戻し）" → ConfirmModal
```

### 7.4 ApprovalStatusPanel

`src/components/production/ApprovalStatusPanel.tsx`

Shown on the work order detail page when approval_status != NONE.

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

### 7.5 InspectionRecordForm

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

### 7.6 DefectRecordForm

`src/components/production/DefectRecordForm.tsx` — `'use client'`

```
Paper (withBorder, p="md")
├── Title order={4} "不良記録（任意）"
└── [per defect entry]
    ├── Select (defect_type_id, options from defect_types)
    └── Textarea (description, required if type selected)
└── Button variant="subtle" leftSection=<IconPlus> "追加"
```

### 7.7 InventoryBadge

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

### 7.8 CustomerSelect

`src/components/master/CustomerSelect.tsx` — `'use client'`

Two-level select: customer → branch. Used in all forms that have `customer_id` + optional `customer_branch_id`.

```
Stack gap="xs"
├── Select label="顧客" data={customers} searchable
└── Select label="支店" data={branches filtered by customer} disabled if no customer
```

### 7.9 ProductPriceResolverInput

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

## 8. Master Data Pages

All master data entities follow the standard list + detail + form pattern (§4).

### 8.1 Customers

**List columns**: コード / 名称（ja） / 支店数 / 状態 / 更新日

**Detail tabs**: 概要 / 支店一覧 / 見積・受注履歴

**Customer Branch**: nested under `/master/customers/[id]/branches/`. List shown in customer detail tabs.

### 8.2 Products

**List columns**: 製品コード / 名称 / 素材 / 単位 / 状態

**Detail**: includes `spec` JSON rendered as key-value table, design file link.

### 8.3 Process Steps (工程マスタ)

**List columns**: コード / 名称 / カテゴリ / 実施場所 / 同期可 / 検査工程 / 承認工程

**Detail**: includes use-dependency and exec-dependency tables.

### 8.4 Inspection Templates

**Detail tabs**: テンプレート情報 / 検査項目

Items sub-table has inline add/edit (no separate page).

### 8.5 Approval Groups

**Detail tabs**: グループ情報 / メンバー / 代理設定

---

## 9. DataTable Column Conventions

Use `mantine-datatable` `DataTableColumn[]`. Standard conventions:

| Column type | Render |
|-------------|--------|
| Document number | `TextInput` or plain `Text`, monospace font (`ff="mono"`) |
| Status | `StatusBadge` component |
| Amount / price | right-aligned, `MoneyText` |
| Date | `date-fns format(date, 'yyyy/MM/dd')` |
| Timestamp | `date-fns format(ts, 'yyyy/MM/dd HH:mm')` |
| Localized JSON | `JsonLocalizedText` |
| Boolean | `Badge` green "有効" / gray "無効" |
| Actions | `Group` of `ActionIcon` (edit, view) — rightmost column, `accessor: 'actions'` |

Row click navigates to detail page.

---

## 10. Form Conventions

- Use `@mantine/form` with `zodResolver`.
- Server Actions handle submission (`action` prop on `<form>`).
- Show `notifications.show` (from `@mantine/notifications`) on success/error.
- `LoadingOverlay` during submission: `<Box pos="relative"><LoadingOverlay visible={isPending} /></Box>`.
- Required fields: Mantine `withAsterisk` prop.
- Monetary inputs: `NumberInput` with `prefix="¥"`, `thousandSeparator=","`, `decimalScale={2}`.
- Date fields: `DatePickerInput` from `@mantine/dates`, locale `ja`.
- All `Select` with `searchable` when options > 5.

---

## 11. Realtime (SSE)

Pages that show live manufacturing progress (`/production/work-orders/[id]`) use an SSE hook.

`src/hooks/useWorkOrderSSE.ts` — `'use client'`

- Connects to `/api/sse/work-orders/[id]`.
- Updates local state with step status changes.
- Shows `<RingProgress>` or step cards refreshed in-place.

Approval notifications use `/api/sse/approvals` and show a `Notification` banner when a new request arrives for the current user.

---

## 12. Mobile / Tablet

The manufacturing step execution page (`/production/work-orders/[id]/steps/[stepId]`) must be tablet-friendly:

- All interactive elements `size="lg"`.
- Avoid hover-only states.
- `<Kbd>` shortcuts not used.
- Large touch targets (min 44px).
- Session lock warning shown prominently (full-width `Alert`).

Other pages are primarily desktop (min-width 1024px). Navbar collapses on `sm` breakpoint.

---

## 13. Component File Organization

```
src/components/
├── layout/
│   ├── AppShell.tsx         'use client' — AppShell wrapper
│   └── AppNav.tsx           'use client' — Navbar nav links
├── ui/
│   ├── StatusBadge.tsx      status enum → Badge
│   ├── FieldValue.tsx       label/value display
│   ├── PageHeader.tsx       title + breadcrumbs + actions
│   ├── EmptyState.tsx       empty list placeholder
│   ├── ConfirmModal.tsx     destructive action confirm
│   ├── PdfButton.tsx        PDF download button
│   ├── JsonLocalizedText.tsx ja/en JSON field renderer
│   └── MoneyText.tsx        formatted currency
├── sales/
│   ├── ProductPriceResolverInput.tsx
│   ├── QuoteItemsTable.tsx
│   └── OrderAcceptanceForm.tsx
├── production/
│   ├── WorkOrderStepsPanel.tsx
│   ├── StepCard.tsx
│   ├── ApprovalStatusPanel.tsx
│   ├── InspectionRecordForm.tsx
│   ├── DefectRecordForm.tsx
│   ├── InventoryBadge.tsx
│   └── AuditTimeline.tsx
└── master/
    ├── CustomerSelect.tsx
    └── [entity]Table.tsx    per master entity
```

Server components (no `'use client'`) fetch data and pass props to client components.
