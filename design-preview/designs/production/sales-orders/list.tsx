'use client';

import {
  Box,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Button,
} from '@mantine/core';
import { IconClipboardList, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import {
  DocNumber,
  EmptyState,
  formatDate,
  MoneyText,
  NewButton,
  PageHeader,
} from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { CUSTOMERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data ───────────────────────────────────────────────────────────────
interface SalesOrderRow {
  id: string;
  salesOrderNumber: string;
  customerName: string;
  productName: string;
  quantity: number;
  amount: number;
  deliveryDate: string;
  status: string;
}

const MOCK_RECORDS: SalesOrderRow[] = [
  {
    id: '1',
    salesOrderNumber: 'ORD-202601-00001-01',
    customerName: '株式会社ABC製作所',
    productName: '精密軸 PRD-2601-0001',
    quantity: 50,
    amount: 250000,
    deliveryDate: '2026-06-15',
    status: 'IN_PRODUCTION',
  },
  {
    id: '2',
    salesOrderNumber: 'ORD-202601-00002-01',
    customerName: '合同会社XYZ工業',
    productName: 'ロッド PRD-2602-0008',
    quantity: 30,
    amount: 180000,
    deliveryDate: '2026-06-20',
    status: 'CONFIRMED',
  },
  {
    id: '3',
    salesOrderNumber: 'ORD-202601-00003-01',
    customerName: '株式会社DEFエンジニアリング',
    productName: '特殊加工品 PRD-2603-0012',
    quantity: 10,
    amount: 95000,
    deliveryDate: '2026-07-01',
    status: 'DRAFT',
  },
  {
    id: '4',
    salesOrderNumber: 'ORD-202512-00018-02',
    customerName: '東邦精密株式会社',
    productName: '精密軸 PRD-2601-0001',
    quantity: 120,
    amount: 600000,
    deliveryDate: '2026-05-30',
    status: 'PARTIAL_SHIPPED',
  },
  {
    id: '5',
    salesOrderNumber: 'ORD-202512-00012-01',
    customerName: '株式会社ABC製作所',
    productName: 'ロッド PRD-2602-0008',
    quantity: 40,
    amount: 240000,
    deliveryDate: '2026-05-12',
    status: 'SHIPPED',
  },
];

export default function SalesOrdersListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.salesOrderNumber.includes(search) ||
      r.customerName.includes(search) ||
      r.productName.includes(search);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    const matchesCustomer = !customerFilter || r.customerName.includes(customerFilter);
    return matchesSearch && matchesStatus && matchesCustomer;
  });

  const reset = () => {
    setSearch('');
    setStatusFilter(null);
    setCustomerFilter(null);
  };

  const customerOptions = CUSTOMERS.map((c) => ({ value: c.label, label: c.label }));

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '生産', '受注書']}
        title="受注書"
        actions={<NewButton />}
      />

      <Paper withBorder p="sm">
        {/* Filter bar */}
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="受注番号・顧客・製品で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="ステータス"
                data={statusOptions('SalesOrder')}
                value={statusFilter}
                onChange={setStatusFilter}
                clearable
                style={{ flex: 1 }}
              />
              <Select
                placeholder="顧客"
                data={customerOptions}
                value={customerFilter}
                onChange={setCustomerFilter}
                searchable
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
              placeholder="受注番号・顧客・製品で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="ステータス"
              data={statusOptions('SalesOrder')}
              value={statusFilter}
              onChange={setStatusFilter}
              clearable
              w={160}
            />
            <Select
              placeholder="顧客"
              data={customerOptions}
              value={customerFilter}
              onChange={setCustomerFilter}
              searchable
              clearable
              w={200}
            />
            <Button variant="subtle" onClick={reset}>
              リセット
            </Button>
          </Group>
        )}

        {/* Records */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconClipboardList size={24} />}
            message="受注書がありません"
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
                    <DocNumber c="dimmed">{r.salesOrderNumber}</DocNumber>
                    <Text size="sm" fw={600} truncate>
                      {r.customerName}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {r.productName}
                    </Text>
                    <Group gap="md" mt={2}>
                      <Text size="xs" c="dimmed">
                        {r.quantity} 本
                      </Text>
                      <Text size="xs" fw={500}>
                        {new Intl.NumberFormat('ja-JP', {
                          style: 'currency',
                          currency: 'JPY',
                        }).format(r.amount)}
                      </Text>
                    </Group>
                  </Stack>
                  <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                    <StatusBadge entity="SalesOrder" status={r.status} />
                    <Text size="xs" c="dimmed">
                      {formatDate(r.deliveryDate)}
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
                <Table.Th>受注番号</Table.Th>
                <Table.Th>顧客</Table.Th>
                <Table.Th>製品</Table.Th>
                <Table.Th ta="right">数量</Table.Th>
                <Table.Th ta="right">金額</Table.Th>
                <Table.Th>納期</Table.Th>
                <Table.Th>状態</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td>
                    <DocNumber>{r.salesOrderNumber}</DocNumber>
                  </Table.Td>
                  <Table.Td>{r.customerName}</Table.Td>
                  <Table.Td>{r.productName}</Table.Td>
                  <Table.Td>
                    <Text size="sm" ta="right">
                      {r.quantity} 本
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Box>
                      <MoneyText value={r.amount} />
                    </Box>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(r.deliveryDate)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge entity="SalesOrder" status={r.status} />
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
