'use client';

import {
  Badge,
  Box,
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
import { useIsMobile } from '../lib/viewport-context';

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
  return <Badge color={config.color}>{config.label}</Badge>;
}

function MoneyText({ value }: { value: number }) {
  return (
    <Text size="sm" ta="right">
      {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value)}
    </Text>
  );
}

// ── Desktop table ────────────────────────────────────────────────────────────
// [3rd party] In production: import { DataTable } from 'mantine-datatable'
function DesktopTable({ records }: { records: SalesOrderRow[] }) {
  if (records.length === 0) {
    return (
      <Center py="xl">
        <Stack align="center" gap="sm">
          <ThemeIcon size="xl" variant="light" color="gray">
            <IconClipboardList size={24} />
          </ThemeIcon>
          <Text c="dimmed" size="sm">受注書がありません</Text>
          <Button variant="subtle" size="sm">新規作成</Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap={0}>
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
          style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}
        >
          <Text size="sm" ff="mono" w={170}>{r.salesOrderNumber}</Text>
          <Text size="sm" style={{ flex: 1 }}>{r.customerName}</Text>
          <Text size="sm" style={{ flex: 2 }}>{r.productName}</Text>
          <Text size="sm" w={60} ta="right">{r.quantity}</Text>
          <Box w={100}><MoneyText value={r.amount} /></Box>
          <Text size="sm" w={90}>{r.deliveryDate}</Text>
          <Box w={80}><StatusBadge status={r.status} /></Box>
        </Group>
      ))}
    </Stack>
  );
}

// ── Mobile card list ─────────────────────────────────────────────────────────
function MobileCardList({ records }: { records: SalesOrderRow[] }) {
  if (records.length === 0) {
    return (
      <Center py="xl">
        <Stack align="center" gap="sm">
          <ThemeIcon size="xl" variant="light" color="gray">
            <IconClipboardList size={24} />
          </ThemeIcon>
          <Text c="dimmed" size="sm">受注書がありません</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="xs">
      {records.map((r) => (
        <Paper
          key={r.id}
          p="sm"
          withBorder
          radius="sm"
          style={{ cursor: 'pointer' }}
        >
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={3} style={{ minWidth: 0 }}>
              {/* Document number in mono */}
              <Text size="xs" ff="mono" c="dimmed">{r.salesOrderNumber}</Text>
              {/* Customer */}
              <Text size="sm" fw={600} truncate>{r.customerName}</Text>
              {/* Product */}
              <Text size="xs" c="dimmed" truncate>{r.productName}</Text>
              {/* Qty + amount row */}
              <Group gap="md" mt={2}>
                <Text size="xs" c="dimmed">{r.quantity} 本</Text>
                <Text size="xs" fw={500}>
                  {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(r.amount)}
                </Text>
              </Group>
            </Stack>

            {/* Right side: status + date */}
            <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
              <StatusBadge status={r.status} />
              <Text size="xs" c="dimmed">{r.deliveryDate}</Text>
            </Stack>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function SalesOrdersListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.salesOrderNumber.includes(search) ||
      r.customerName.includes(search);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <Stack gap="md">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <Stack gap={2} style={{ minWidth: 0 }}>
          {!isMobile && (
            <Breadcrumbs>
              <Text size="sm">ホーム</Text>
              <Text size="sm">生産</Text>
              <Text size="sm">受注書</Text>
            </Breadcrumbs>
          )}
          <Title order={isMobile ? 3 : 2}>受注書</Title>
        </Stack>
        <Button leftSection={<IconPlus size={16} />} size={isMobile ? 'sm' : 'md'}>
          {isMobile ? '新規' : '新規作成'}
        </Button>
      </Group>

      {/* ── Filter bar + table ────────────────────────────────────────── */}
      <Paper withBorder p="sm">

        {/* Filter bar — Stack on mobile, Group on desktop */}
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="受注番号・顧客名で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
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
                style={{ flex: 1 }}
              />
              <Button
                variant="subtle"
                size="sm"
                onClick={() => { setSearch(''); setStatusFilter(null); }}
              >
                リセット
              </Button>
            </Group>
          </Stack>
        ) : (
          <Group mb="sm" align="flex-end">
            <TextInput
              placeholder="受注番号・顧客名で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
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
            <Button
              variant="subtle"
              onClick={() => { setSearch(''); setStatusFilter(null); }}
            >
              リセット
            </Button>
          </Group>
        )}

        {/* Records — card list on mobile, table on desktop */}
        {isMobile
          ? <MobileCardList records={filtered} />
          : <DesktopTable records={filtered} />
        }
      </Paper>
    </Stack>
  );
}
