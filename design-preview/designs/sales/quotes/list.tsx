'use client';

import {
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconFileText, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import {
  DocNumber,
  EmptyState,
  formatDate,
  NewButton,
  PageHeader,
} from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { CUSTOMERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

interface QuoteRow {
  id: string;
  quoteNumber: string;
  customerName: string;
  validUntil: string | null;
  status: string;
  updatedAt: string;
}

const MOCK_RECORDS: QuoteRow[] = [
  {
    id: '1',
    quoteNumber: 'QOT-202606-00001',
    customerName: '株式会社ABC製作所',
    validUntil: '2026-07-15',
    status: 'ISSUED',
    updatedAt: '2026-06-05',
  },
  {
    id: '2',
    quoteNumber: 'QOT-202606-00002',
    customerName: '合同会社XYZ工業',
    validUntil: '2026-07-20',
    status: 'ACCEPTED',
    updatedAt: '2026-06-04',
  },
  {
    id: '3',
    quoteNumber: 'QOT-202605-00018',
    customerName: '株式会社DEFエンジニアリング',
    validUntil: '2026-06-01',
    status: 'EXPIRED',
    updatedAt: '2026-05-12',
  },
  {
    id: '4',
    quoteNumber: 'QOT-202606-00003',
    customerName: '東邦精密株式会社',
    validUntil: null,
    status: 'DRAFT',
    updatedAt: '2026-06-06',
  },
];

export default function QuoteListPage() {
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
      r.quoteNumber.includes(search) ||
      r.customerName.includes(search);
    const matchesStatus = !status || r.status === status;
    const matchesCustomer = !customer || r.customerName === customer;
    return matchesSearch && matchesStatus && matchesCustomer;
  });

  const filterControls = (
    <>
      <Select
        placeholder="状態"
        data={statusOptions('Quote')}
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
        breadcrumbs={['ホーム', '販売', '見積書']}
        title="見積書"
        actions={<NewButton />}
      />

      <Paper withBorder p="sm">
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="見積番号・顧客名で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">{filterControls}</Group>
          </Stack>
        ) : (
          <Group mb="sm" align="flex-end">
            <TextInput
              placeholder="見積番号・顧客名で検索"
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
            icon={<IconFileText size={24} />}
            message="見積書がありません"
            action={<Button variant="subtle" size="sm">新規作成</Button>}
          />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <Text size="xs" ff="mono" c="dimmed">{r.quoteNumber}</Text>
                    <Text size="sm" fw={600} truncate>{r.customerName}</Text>
                    <Text size="xs" c="dimmed">
                      有効期限: {r.validUntil ? formatDate(r.validUntil) : '—'}
                    </Text>
                  </Stack>
                  <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                    <StatusBadge entity="Quote" status={r.status} />
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
                <Table.Th>見積番号</Table.Th>
                <Table.Th>顧客</Table.Th>
                <Table.Th>有効期限</Table.Th>
                <Table.Th>状態</Table.Th>
                <Table.Th>更新日</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td><DocNumber>{r.quoteNumber}</DocNumber></Table.Td>
                  <Table.Td>{r.customerName}</Table.Td>
                  <Table.Td>{r.validUntil ? formatDate(r.validUntil) : '—'}</Table.Td>
                  <Table.Td><StatusBadge entity="Quote" status={r.status} /></Table.Td>
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
