'use client';

import {
  Box,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconCalendarDue, IconPlayerPlay, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import {
  EmptyState,
  formatDate,
  formatDateTime,
  MoneyText,
  PageHeader,
} from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { CUSTOMERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data ────────────────────────────────────────────────────────────────
interface ClosingRow {
  id: string;
  customerName: string;
  closingDate: string;
  totalAmount: number | null;
  status: string;
  processedAt: string | null;
}

const MOCK_RECORDS: ClosingRow[] = [
  {
    id: '1',
    customerName: '株式会社ABC製作所',
    closingDate: '2026-05-31',
    totalAmount: 1485000,
    status: 'EXPORTED',
    processedAt: '2026-06-01 02:00',
  },
  {
    id: '2',
    customerName: '合同会社XYZ工業',
    closingDate: '2026-05-31',
    totalAmount: 660000,
    status: 'PROCESSED',
    processedAt: '2026-06-01 02:00',
  },
  {
    id: '3',
    customerName: '株式会社DEFエンジニアリング',
    closingDate: '2026-05-20',
    totalAmount: 209000,
    status: 'PROCESSED',
    processedAt: '2026-05-21 02:00',
  },
  {
    id: '4',
    customerName: '東邦精密株式会社',
    closingDate: '2026-06-30',
    totalAmount: null,
    status: 'PENDING',
    processedAt: null,
  },
];

export default function ClosingsListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch = !search || r.customerName.includes(search);
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
        breadcrumbs={['ホーム', '請求', '締日処理']}
        title="締日処理"
        actions={
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            size={isMobile ? 'sm' : 'md'}
            style={{ flexShrink: 0 }}
          >
            {isMobile ? '締日処理' : '締日処理を実行'}
          </Button>
        }
      />

      <Paper withBorder p="sm">
        {/* Filter bar */}
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="顧客で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="状態"
                data={statusOptions('BillingClosing')}
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
              placeholder="顧客で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="状態"
              data={statusOptions('BillingClosing')}
              value={statusFilter}
              onChange={setStatusFilter}
              clearable
              w={170}
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
          <EmptyState icon={<IconCalendarDue size={24} />} message="締日処理がありません" />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>
                      {r.customerName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      締日: {formatDate(r.closingDate)}
                    </Text>
                    <Text size="sm" fw={500} mt={2}>
                      {r.totalAmount == null
                        ? '—'
                        : new Intl.NumberFormat('ja-JP', {
                            style: 'currency',
                            currency: 'JPY',
                          }).format(r.totalAmount)}
                    </Text>
                  </Stack>
                  <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                    <StatusBadge entity="BillingClosing" status={r.status} />
                    <Text size="xs" c="dimmed">
                      {formatDate(r.processedAt)}
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
                <Table.Th>顧客</Table.Th>
                <Table.Th>締日</Table.Th>
                <Table.Th ta="right">合計金額</Table.Th>
                <Table.Th>状態</Table.Th>
                <Table.Th>処理日</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td>{r.customerName}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(r.closingDate)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Box>
                      <MoneyText value={r.totalAmount} />
                    </Box>
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge entity="BillingClosing" status={r.status} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDateTime(r.processedAt)}</Text>
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
