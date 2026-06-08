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
import { IconClipboardCheck, IconSearch } from '@tabler/icons-react';
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

interface OrderAcceptanceRow {
  id: string;
  orderNumber: string;
  customerName: string;
  customerOrderRef: string;
  totalAmount: number;
  status: string;
  updatedAt: string;
}

const MOCK_RECORDS: OrderAcceptanceRow[] = [
  {
    id: '1',
    orderNumber: 'ORD-202606-00001',
    customerName: '株式会社ABC製作所',
    customerOrderRef: 'PO-ABC-2026-0512',
    totalAmount: 281000,
    status: 'CONFIRMED',
    updatedAt: '2026-06-05',
  },
  {
    id: '2',
    orderNumber: 'ORD-202606-00002',
    customerName: '合同会社XYZ工業',
    customerOrderRef: 'XYZ-20260604-01',
    totalAmount: 186000,
    status: 'PRICE_DIFF',
    updatedAt: '2026-06-04',
  },
  {
    id: '3',
    orderNumber: 'ORD-202606-00003',
    customerName: '東邦精密株式会社',
    customerOrderRef: 'TH-PO-6677',
    totalAmount: 95000,
    status: 'PENDING',
    updatedAt: '2026-06-06',
  },
];

export default function OrderAcceptanceListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [customer, setCustomer] = useState<string | null>(null);

  const reset = () => {
    setSearch('');
    setStatus(null);
    setCustomer(null);
  };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.orderNumber.includes(search) ||
      r.customerName.includes(search) ||
      r.customerOrderRef.includes(search);
    const matchesStatus = !status || r.status === status;
    const matchesCustomer = !customer || r.customerName === customer;
    return matchesSearch && matchesStatus && matchesCustomer;
  });

  const filterControls = (
    <>
      <Select
        placeholder="状態"
        data={statusOptions('OrderAcceptance')}
        value={status}
        onChange={setStatus}
        clearable
        w={isMobile ? undefined : 140}
        style={isMobile ? { flex: 1 } : undefined}
      />
      <Select
        placeholder="顧客"
        data={CUSTOMERS.map((c) => ({ value: c.label, label: c.label }))}
        value={customer}
        onChange={setCustomer}
        clearable
        searchable
        w={isMobile ? undefined : 200}
        style={isMobile ? { flex: 1 } : undefined}
      />
      <Button variant="subtle" size={isMobile ? 'sm' : undefined} onClick={reset}>
        リセット
      </Button>
    </>
  );

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '販売', '注文受諾書']}
        title="注文受諾書"
        actions={<NewButton />}
      />

      <Paper withBorder p="sm">
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="注文番号・顧客・顧客注文書番号で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">{filterControls}</Group>
          </Stack>
        ) : (
          <Group mb="sm" align="flex-end">
            <TextInput
              placeholder="注文番号・顧客・顧客注文書番号で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            {filterControls}
          </Group>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconClipboardCheck size={24} />}
            message="注文受諾書がありません"
            action={<Button variant="subtle" size="sm">新規作成</Button>}
          />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <Text size="xs" ff="mono" c="dimmed">{r.orderNumber}</Text>
                    <Text size="sm" fw={600} truncate>{r.customerName}</Text>
                    <Text size="xs" c="dimmed" truncate>顧客注文書: {r.customerOrderRef}</Text>
                    <Text size="xs" fw={500}>{new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(r.totalAmount)}</Text>
                  </Stack>
                  <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                    <StatusBadge entity="OrderAcceptance" status={r.status} />
                    <Text size="xs" c="dimmed">{formatDate(r.updatedAt)}</Text>
                  </Stack>
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Table highlightOnHover striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>注文番号</Table.Th>
                <Table.Th>顧客</Table.Th>
                <Table.Th>顧客注文書番号</Table.Th>
                <Table.Th ta="right">合計金額</Table.Th>
                <Table.Th>状態</Table.Th>
                <Table.Th>更新日</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td><DocNumber>{r.orderNumber}</DocNumber></Table.Td>
                  <Table.Td>{r.customerName}</Table.Td>
                  <Table.Td>{r.customerOrderRef}</Table.Td>
                  <Table.Td>
                    <Box w={110} ml="auto">
                      <MoneyText value={r.totalAmount} />
                    </Box>
                  </Table.Td>
                  <Table.Td><StatusBadge entity="OrderAcceptance" status={r.status} /></Table.Td>
                  <Table.Td>{formatDate(r.updatedAt)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
