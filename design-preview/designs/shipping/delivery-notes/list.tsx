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
import { IconReceipt, IconSearch } from '@tabler/icons-react';
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

// ── Delivery method labels (tables.md DELIVERY_METHOD) ───────────────────────
const METHOD_LABEL: Record<string, string> = {
  DIRECT_TO_USER: 'ユーザー直送',
  NORMAL: '通常納品',
};

const METHOD_OPTIONS = [
  { value: 'DIRECT_TO_USER', label: 'ユーザー直送' },
  { value: 'NORMAL', label: '通常納品' },
];

function MethodBadge({ method }: { method: string }) {
  return (
    <Badge variant="light" color={method === 'DIRECT_TO_USER' ? 'violet' : 'gray'}>
      {METHOD_LABEL[method] ?? method}
    </Badge>
  );
}

// ── Mock data ────────────────────────────────────────────────────────────────
interface DeliveryNoteRow {
  id: string;
  deliveryNumber: string;
  shippingOrderNumber: string;
  recipientName: string;
  method: string;
  status: string;
  deliveredAt: string | null;
}

const MOCK_RECORDS: DeliveryNoteRow[] = [
  {
    id: '1',
    deliveryNumber: 'DRN-202606-00012',
    shippingOrderNumber: 'SHP-202606-0007',
    recipientName: '株式会社ABC製作所 東京本社',
    method: 'NORMAL',
    status: 'DELIVERED',
    deliveredAt: '2026-06-05',
  },
  {
    id: '2',
    deliveryNumber: 'DRN-202606-00011',
    shippingOrderNumber: 'SHP-202606-0006',
    recipientName: '合同会社XYZ工業',
    method: 'DIRECT_TO_USER',
    status: 'ISSUED',
    deliveredAt: null,
  },
  {
    id: '3',
    deliveryNumber: 'DRN-202606-00010',
    shippingOrderNumber: 'SHP-202606-0004',
    recipientName: '株式会社DEFエンジニアリング 名古屋支店',
    method: 'NORMAL',
    status: 'DRAFT',
    deliveredAt: null,
  },
  {
    id: '4',
    deliveryNumber: 'DRN-202605-00009',
    shippingOrderNumber: 'SHP-202605-0021',
    recipientName: '株式会社ABC製作所 大阪支社',
    method: 'DIRECT_TO_USER',
    status: 'DELIVERED',
    deliveredAt: '2026-05-29',
  },
];

export default function DeliveryNotesListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [methodFilter, setMethodFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.deliveryNumber.includes(search) ||
      r.shippingOrderNumber.includes(search) ||
      r.recipientName.includes(search);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    const matchesMethod = !methodFilter || r.method === methodFilter;
    return matchesSearch && matchesStatus && matchesMethod;
  });

  const reset = () => {
    setSearch('');
    setStatusFilter(null);
    setMethodFilter(null);
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '出荷', '納品書']}
        title="納品書"
        actions={<NewButton />}
      />

      <Paper withBorder p="sm">
        {/* Filter bar */}
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="納品番号・出荷書番号・納品先で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="状態"
                data={statusOptions('DeliveryNote')}
                value={statusFilter}
                onChange={setStatusFilter}
                clearable
                style={{ flex: 1 }}
              />
              <Select
                placeholder="方法"
                data={METHOD_OPTIONS}
                value={methodFilter}
                onChange={setMethodFilter}
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
              placeholder="納品番号・出荷書番号・納品先で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="状態"
              data={statusOptions('DeliveryNote')}
              value={statusFilter}
              onChange={setStatusFilter}
              clearable
              w={150}
            />
            <Select
              placeholder="方法"
              data={METHOD_OPTIONS}
              value={methodFilter}
              onChange={setMethodFilter}
              clearable
              w={160}
            />
            <Button variant="subtle" onClick={reset}>
              リセット
            </Button>
          </Group>
        )}

        {/* Records */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconReceipt size={24} />}
            message="納品書がありません"
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
                    <DocNumber c="dimmed">{r.deliveryNumber}</DocNumber>
                    <Text size="sm" fw={600} truncate>
                      {r.recipientName}
                    </Text>
                    <DocNumber c="dimmed">{r.shippingOrderNumber}</DocNumber>
                    <Group gap="xs" mt={2}>
                      <MethodBadge method={r.method} />
                    </Group>
                  </Stack>
                  <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                    <StatusBadge entity="DeliveryNote" status={r.status} />
                    <Text size="xs" c="dimmed">
                      {formatDate(r.deliveredAt)}
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
                <Table.Th>納品番号</Table.Th>
                <Table.Th>出荷書番号</Table.Th>
                <Table.Th>納品先</Table.Th>
                <Table.Th>方法</Table.Th>
                <Table.Th>状態</Table.Th>
                <Table.Th>納品日</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td>
                    <DocNumber>{r.deliveryNumber}</DocNumber>
                  </Table.Td>
                  <Table.Td>
                    <DocNumber>{r.shippingOrderNumber}</DocNumber>
                  </Table.Td>
                  <Table.Td>{r.recipientName}</Table.Td>
                  <Table.Td>
                    <MethodBadge method={r.method} />
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge entity="DeliveryNote" status={r.status} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(r.deliveredAt)}</Text>
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
