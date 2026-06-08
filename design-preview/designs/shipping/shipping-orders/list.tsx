'use client';

import {
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconSearch, IconTruck } from '@tabler/icons-react';
import { useState } from 'react';
import {
  DocNumber,
  EmptyState,
  formatDate,
  NewButton,
  PageHeader,
} from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { useIsMobile } from '../../lib/viewport-context';

// ── Shipping type labels (tables.md SHIPPING_TYPE) ───────────────────────────
const TYPE_LABEL: Record<string, string> = {
  STOCK_STORAGE: '在庫保管',
  DISPATCH: '発送',
};

const TYPE_OPTIONS = [
  { value: 'STOCK_STORAGE', label: '在庫保管' },
  { value: 'DISPATCH', label: '発送' },
];

function TypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="light" color={type === 'STOCK_STORAGE' ? 'gray' : 'orange'}>
      {TYPE_LABEL[type] ?? type}
    </Badge>
  );
}

// ── Mock data ────────────────────────────────────────────────────────────────
interface ShippingOrderRow {
  id: string;
  shippingOrderNumber: string;
  salesOrderNumber: string;
  customerName: string;
  type: string;
  status: string;
  shippedAt: string | null;
}

const MOCK_RECORDS: ShippingOrderRow[] = [
  {
    id: '1',
    shippingOrderNumber: 'SHP-202606-0007',
    salesOrderNumber: 'ORD-202601-00001-01',
    customerName: '株式会社ABC製作所',
    type: 'DISPATCH',
    status: 'SHIPPED',
    shippedAt: '2026-06-04',
  },
  {
    id: '2',
    shippingOrderNumber: 'SHP-202606-0006',
    salesOrderNumber: 'ORD-202601-00002-01',
    customerName: '合同会社XYZ工業',
    type: 'DISPATCH',
    status: 'CONFIRMED',
    shippedAt: null,
  },
  {
    id: '3',
    shippingOrderNumber: 'SHP-202606-0005',
    salesOrderNumber: 'ORD-202512-00018-02',
    customerName: '東邦精密株式会社',
    type: 'STOCK_STORAGE',
    status: 'CONFIRMED',
    shippedAt: null,
  },
  {
    id: '4',
    shippingOrderNumber: 'SHP-202606-0004',
    salesOrderNumber: 'ORD-202601-00003-01',
    customerName: '株式会社DEFエンジニアリング',
    type: 'DISPATCH',
    status: 'DRAFT',
    shippedAt: null,
  },
  {
    id: '5',
    shippingOrderNumber: 'SHP-202605-0021',
    salesOrderNumber: 'ORD-202512-00012-01',
    customerName: '株式会社ABC製作所',
    type: 'STOCK_STORAGE',
    status: 'SHIPPED',
    shippedAt: '2026-05-28',
  },
];

export default function ShippingOrdersListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.shippingOrderNumber.includes(search) ||
      r.salesOrderNumber.includes(search) ||
      r.customerName.includes(search);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    const matchesType = !typeFilter || r.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const reset = () => {
    setSearch('');
    setStatusFilter(null);
    setTypeFilter(null);
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '出荷', '出荷書']}
        title="出荷書"
        actions={<NewButton />}
      />

      <Paper withBorder p="sm">
        {/* Filter bar */}
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="出荷書番号・受注番号・顧客で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="状態"
                data={statusOptions('ShippingOrder')}
                value={statusFilter}
                onChange={setStatusFilter}
                clearable
                style={{ flex: 1 }}
              />
              <Select
                placeholder="種別"
                data={TYPE_OPTIONS}
                value={typeFilter}
                onChange={setTypeFilter}
                clearable
                style={{ flex: 1 }}
              />
            </Group>
            <Button variant="subtle" size="sm" onClick={reset}>
              リセット
            </Button>
          </Stack>
        ) : (
          <Group mb="sm" align="flex-end">
            <TextInput
              placeholder="出荷書番号・受注番号・顧客で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="状態"
              data={statusOptions('ShippingOrder')}
              value={statusFilter}
              onChange={setStatusFilter}
              clearable
              w={150}
            />
            <Select
              placeholder="種別"
              data={TYPE_OPTIONS}
              value={typeFilter}
              onChange={setTypeFilter}
              clearable
              w={150}
            />
            <Button variant="subtle" onClick={reset}>
              リセット
            </Button>
          </Group>
        )}

        {/* Records */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconTruck size={24} />}
            message="出荷書がありません"
            action={
              <Button variant="subtle" size="sm">
                新規作成
              </Button>
            }
          />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <DocNumber c="dimmed">{r.shippingOrderNumber}</DocNumber>
                    <Text size="sm" fw={600} truncate>
                      {r.customerName}
                    </Text>
                    <DocNumber c="dimmed">{r.salesOrderNumber}</DocNumber>
                    <Group gap="xs" mt={2}>
                      <TypeBadge type={r.type} />
                    </Group>
                  </Stack>
                  <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                    <StatusBadge entity="ShippingOrder" status={r.status} />
                    <Text size="xs" c="dimmed">
                      {formatDate(r.shippedAt)}
                    </Text>
                  </Stack>
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>出荷書番号</Table.Th>
                <Table.Th>受注番号</Table.Th>
                <Table.Th>顧客</Table.Th>
                <Table.Th>種別</Table.Th>
                <Table.Th>状態</Table.Th>
                <Table.Th>出荷日</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td>
                    <DocNumber>{r.shippingOrderNumber}</DocNumber>
                  </Table.Td>
                  <Table.Td>
                    <DocNumber>{r.salesOrderNumber}</DocNumber>
                  </Table.Td>
                  <Table.Td>{r.customerName}</Table.Td>
                  <Table.Td>
                    <TypeBadge type={r.type} />
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge entity="ShippingOrder" status={r.status} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(r.shippedAt)}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
