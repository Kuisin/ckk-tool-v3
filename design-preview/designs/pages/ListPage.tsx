'use client';

import {
  Badge,
  Breadcrumbs,
  Button,
  Center,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconClipboardList,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import { useState } from 'react';
// In production: import { DataTable } from 'mantine-datatable';
// Shown here as a structural stub so the sample compiles without the package

// ── Mock data ───────────────────────────────────────────────────────────────
type SalesOrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'IN_PRODUCTION'
  | 'PARTIAL_SHIPPED'
  | 'SHIPPED'
  | 'CANCELLED';

interface SalesOrderRow {
  id: string;
  salesOrderNumber: string;
  customerName: string;
  productName: string;
  quantity: number;
  amount: number;
  deliveryDate: string;
  status: SalesOrderStatus;
}

const MOCK_RECORDS: SalesOrderRow[] = [
  {
    id: '1',
    salesOrderNumber: 'ORD-202601-00001-01',
    customerName: '株式会社ABC',
    productName: '精密軸 PRD-202601-0001',
    quantity: 50,
    amount: 250000,
    deliveryDate: '2026-06-15',
    status: 'CONFIRMED',
  },
  {
    id: '2',
    salesOrderNumber: 'ORD-202601-00002-01',
    customerName: '合同会社XYZ',
    productName: 'ロッド PRD-202602-0008',
    quantity: 30,
    amount: 180000,
    deliveryDate: '2026-06-20',
    status: 'IN_PRODUCTION',
  },
  {
    id: '3',
    salesOrderNumber: 'ORD-202601-00003-01',
    customerName: '株式会社DEF',
    productName: '特殊加工品 PRD-202603-0012',
    quantity: 10,
    amount: 95000,
    deliveryDate: '2026-07-01',
    status: 'DRAFT',
  },
];

// ── Status Badge helper ──────────────────────────────────────────────────────
// [Custom] In production this lives in src/components/ui/StatusBadge.tsx
// Color mapping follows _specs/design.md §5
const STATUS_CONFIG: Record<SalesOrderStatus, { label: string; color: string }> = {
  DRAFT:          { label: '下書き',   color: 'gray'   },
  CONFIRMED:      { label: '確定',     color: 'blue'   },
  IN_PRODUCTION:  { label: '製造中',   color: 'violet' },
  PARTIAL_SHIPPED:{ label: '一部出荷', color: 'orange' },
  SHIPPED:        { label: '出荷済',   color: 'green'  },
  CANCELLED:      { label: 'キャンセル', color: 'red'  },
};

function StatusBadge({ status }: { status: SalesOrderStatus }) {
  const config = STATUS_CONFIG[status];
  // [Mantine] Badge — size/radius set globally in MantineProvider theme
  return <Badge color={config.color}>{config.label}</Badge>;
}

// ── MoneyText helper ─────────────────────────────────────────────────────────
// [Custom] In production this lives in src/components/ui/MoneyText.tsx
function MoneyText({ value }: { value: number }) {
  return (
    <Text size="sm" ta="right">
      {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value)}
    </Text>
  );
}

// ── DataTable stub ───────────────────────────────────────────────────────────
// [3rd party] In production: import { DataTable } from 'mantine-datatable'
// This stub renders a basic Mantine Table so the sample is readable without the package
function DataTableStub({ records }: { records: SalesOrderRow[] }) {
  if (records.length === 0) {
    // [Custom] EmptyState pattern — Center > Stack > ThemeIcon + Text
    // In production: import { EmptyState } from '@/components/ui/EmptyState'
    return (
      <Center py="xl">
        <Stack align="center" gap="sm">
          <ThemeIcon size="xl" variant="light" color="gray">
            <IconClipboardList size={24} />
          </ThemeIcon>
          <Text c="dimmed" size="sm">受注書がありません</Text>
          <Button variant="subtle" size="sm">
            新規作成
          </Button>
        </Stack>
      </Center>
    );
  }

  return (
    // NOTE: In production, replace this with mantine-datatable's <DataTable> component
    // which adds: pagination, row click, column sorting, row selection
    <Stack gap={0}>
      {/* Table header */}
      <Group px="sm" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <Text size="xs" c="dimmed" w={170}>受注番号</Text>
        <Text size="xs" c="dimmed" style={{ flex: 1 }}>顧客</Text>
        <Text size="xs" c="dimmed" style={{ flex: 2 }}>製品</Text>
        <Text size="xs" c="dimmed" w={60} ta="right">数量</Text>
        <Text size="xs" c="dimmed" w={100} ta="right">金額</Text>
        <Text size="xs" c="dimmed" w={90}>納期</Text>
        <Text size="xs" c="dimmed" w={80}>ステータス</Text>
      </Group>
      {records.map((r) => (
        <Group
          key={r.id}
          px="sm"
          py="xs"
          style={{
            borderBottom: '1px solid var(--mantine-color-gray-2)',
          }}
        >
          {/* [Custom] Monospace font for document numbers */}
          <Text size="sm" ff="mono" w={170}>{r.salesOrderNumber}</Text>
          <Text size="sm" style={{ flex: 1 }}>{r.customerName}</Text>
          <Text size="sm" style={{ flex: 2 }}>{r.productName}</Text>
          <Text size="sm" w={60} ta="right">{r.quantity}</Text>
          <Text size="sm" w={100}><MoneyText value={r.amount} /></Text>
          <Text size="sm" w={90}>{r.deliveryDate}</Text>
          <Text size="sm" w={80}><StatusBadge status={r.status} /></Text>
        </Group>
      ))}
    </Stack>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function SalesOrdersListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Filter records (in production, this is done server-side via URL search params)
  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.salesOrderNumber.includes(search) ||
      r.customerName.includes(search);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    // [Mantine] Stack gap="md" — standard page wrapper
    <Stack gap="md">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          {/* [Mantine] Breadcrumbs — standard navigation trail */}
          <Breadcrumbs>
            <Text size="sm">ホーム</Text>
            <Text size="sm">生産</Text>
            <Text size="sm">受注書</Text>
          </Breadcrumbs>
          {/* [Mantine] Title order={2} — page heading */}
          <Title order={2}>受注書</Title>
        </Stack>
        {/* [Mantine] Button — filled (default) with leftSection icon */}
        <Button leftSection={<IconPlus size={16} />}>
          新規作成
        </Button>
      </Group>

      {/* ── Filter bar + table ────────────────────────────────────────── */}
      {/* [Mantine] Paper shadow="xs" p="sm" — card container for table area */}
      <Paper shadow="xs" p="sm">

        {/* Filter bar */}
        {/*
         * [Mantine] Group align="flex-end" — aligns inputs and button at baseline.
         * [Custom] In production, this Group is in a 'use client' component that
         *          syncs state to URL search params via useRouter / useSearchParams.
         */}
        <Group mb="sm" align="flex-end">
          {/* [Mantine] TextInput with leftSection search icon */}
          <TextInput
            placeholder="受注番号・顧客名で検索"
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          {/* [Mantine] Select clearable — shows all statuses, clears to null */}
          <Select
            placeholder="ステータス"
            data={[
              { value: 'DRAFT',          label: '下書き'   },
              { value: 'CONFIRMED',      label: '確定'     },
              { value: 'IN_PRODUCTION',  label: '製造中'   },
              { value: 'PARTIAL_SHIPPED',label: '一部出荷' },
              { value: 'SHIPPED',        label: '出荷済'   },
              { value: 'CANCELLED',      label: 'キャンセル' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            clearable
            w={160}
          />
          {/* [Mantine] Button variant="subtle" for low-emphasis reset action */}
          <Button
            variant="subtle"
            onClick={() => { setSearch(''); setStatusFilter(null); }}
          >
            リセット
          </Button>
        </Group>

        {/* Table */}
        {/*
         * In production, replace DataTableStub with:
         *   <DataTable
         *     withTableBorder
         *     highlightOnHover
         *     records={records}
         *     columns={[...]}
         *     totalRecords={total}
         *     recordsPerPage={20}
         *     page={page}
         *     onPageChange={setPage}
         *     onRowClick={({ record }) => router.push(`/.../${record.id}`)}
         *   />
         *
         * [3rd party] mantine-datatable columns follow the conventions in _specs/design.md §9:
         *   - Document numbers: ff="mono"
         *   - Status: <StatusBadge>
         *   - Money: <MoneyText> right-aligned
         *   - Date: date-fns format(date, 'yyyy/MM/dd')
         *   - Actions: Group of ActionIcon (rightmost column)
         */}
        <DataTableStub records={filtered} />
      </Paper>
    </Stack>
  );
}
