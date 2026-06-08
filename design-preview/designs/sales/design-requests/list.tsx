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
import { IconRuler2, IconSearch } from '@tabler/icons-react';
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

const TRIGGER_LABEL: Record<string, string> = {
  QUOTE: '見積時',
  SALES_ORDER: '受注時',
};

const TRIGGER_OPTIONS = [
  { value: 'QUOTE', label: '見積時' },
  { value: 'SALES_ORDER', label: '受注時' },
];

interface DesignRequestRow {
  id: string;
  requestNumber: string;
  trigger: string;
  productName: string;
  status: string;
  updatedAt: string;
}

const MOCK_RECORDS: DesignRequestRow[] = [
  {
    id: '1',
    requestNumber: 'DSR-202606-0001',
    trigger: 'QUOTE',
    productName: '精密軸 PRD-2601-0001',
    status: 'IN_PROGRESS',
    updatedAt: '2026-06-05',
  },
  {
    id: '2',
    requestNumber: 'DSR-202606-0002',
    trigger: 'SALES_ORDER',
    productName: 'ロッド PRD-2602-0008',
    status: 'PENDING',
    updatedAt: '2026-06-06',
  },
  {
    id: '3',
    requestNumber: 'DSR-202605-0014',
    trigger: 'QUOTE',
    productName: '特殊加工品 PRD-2603-0012',
    status: 'COMPLETED',
    updatedAt: '2026-05-28',
  },
];

export default function DesignRequestListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<string | null>(null);

  const reset = () => {
    setSearch('');
    setStatus(null);
    setTrigger(null);
  };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.requestNumber.includes(search) ||
      r.productName.includes(search);
    const matchesStatus = !status || r.status === status;
    const matchesTrigger = !trigger || r.trigger === trigger;
    return matchesSearch && matchesStatus && matchesTrigger;
  });

  const filterControls = (
    <>
      <Select
        placeholder="状態"
        data={statusOptions('DesignRequest')}
        value={status}
        onChange={setStatus}
        clearable
        w={isMobile ? undefined : 140}
        style={isMobile ? { flex: 1 } : undefined}
      />
      <Select
        placeholder="トリガー"
        data={TRIGGER_OPTIONS}
        value={trigger}
        onChange={setTrigger}
        clearable
        w={isMobile ? undefined : 140}
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
        breadcrumbs={['ホーム', '販売', '設計依頼書']}
        title="設計依頼書"
        actions={<NewButton />}
      />

      <Paper withBorder p="sm">
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="依頼番号・製品で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">{filterControls}</Group>
          </Stack>
        ) : (
          <Group mb="sm" align="flex-end">
            <TextInput
              placeholder="依頼番号・製品で検索"
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
            icon={<IconRuler2 size={24} />}
            message="設計依頼書がありません"
            action={<Button variant="subtle" size="sm">新規作成</Button>}
          />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <Text size="xs" ff="mono" c="dimmed">{r.requestNumber}</Text>
                    <Text size="sm" fw={600} truncate>{r.productName}</Text>
                    <Text size="xs" c="dimmed">トリガー: {TRIGGER_LABEL[r.trigger]}</Text>
                  </Stack>
                  <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                    <StatusBadge entity="DesignRequest" status={r.status} />
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
                <Table.Th>依頼番号</Table.Th>
                <Table.Th>トリガー</Table.Th>
                <Table.Th>製品</Table.Th>
                <Table.Th>状態</Table.Th>
                <Table.Th>更新日</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td><DocNumber>{r.requestNumber}</DocNumber></Table.Td>
                  <Table.Td>{TRIGGER_LABEL[r.trigger]}</Table.Td>
                  <Table.Td>{r.productName}</Table.Td>
                  <Table.Td><StatusBadge entity="DesignRequest" status={r.status} /></Table.Td>
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
