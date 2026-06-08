'use client';

import {
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Button,
} from '@mantine/core';
import { IconSearch, IconShieldCheck } from '@tabler/icons-react';
import { useState } from 'react';
import {
  DocNumber,
  EmptyState,
  formatDate,
  PageHeader,
} from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { useIsMobile } from '../../lib/viewport-context';

interface ApprovalRow {
  id: string;
  workOrderNumber: number;
  salesOrderNumber: string;
  step: 'FIRST' | 'SECOND';
  requestedBy: string;
  requestedAt: string;
  status: string;
}

const MOCK_RECORDS: ApprovalRow[] = [
  {
    id: '1',
    workOrderNumber: 1044,
    salesOrderNumber: 'ORD-202601-00002-01',
    step: 'SECOND',
    requestedBy: '鈴木 一郎',
    requestedAt: '2026-05-29',
    status: 'PENDING',
  },
  {
    id: '2',
    workOrderNumber: 1046,
    salesOrderNumber: 'ORD-202601-00004-01',
    step: 'FIRST',
    requestedBy: '鈴木 一郎',
    requestedAt: '2026-05-30',
    status: 'PENDING',
  },
  {
    id: '3',
    workOrderNumber: 1042,
    salesOrderNumber: 'ORD-202601-00001-01',
    step: 'SECOND',
    requestedBy: '鈴木 一郎',
    requestedAt: '2026-05-22',
    status: 'APPROVED',
  },
  {
    id: '4',
    workOrderNumber: 1039,
    salesOrderNumber: 'ORD-202512-00015-01',
    step: 'FIRST',
    requestedBy: '田中 太郎',
    requestedAt: '2026-05-18',
    status: 'REJECTED',
  },
];

const STEP_LABEL: Record<string, string> = {
  FIRST: '第一承認',
  SECOND: '第二承認',
};

const STEP_OPTIONS = [
  { value: 'FIRST', label: '第一承認' },
  { value: 'SECOND', label: '第二承認' },
];

export default function ApprovalsListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [stepFilter, setStepFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      String(r.workOrderNumber).includes(search) ||
      r.salesOrderNumber.includes(search);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    const matchesStep = !stepFilter || r.step === stepFilter;
    return matchesSearch && matchesStatus && matchesStep;
  });

  const reset = () => {
    setSearch('');
    setStatusFilter(null);
    setStepFilter(null);
  };

  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={['ホーム', '生産', '承認管理']} title="承認待ち一覧" />

      <Paper withBorder p="sm">
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="指示書番号・受注番号で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="状態"
                data={statusOptions('ApprovalRequest')}
                value={statusFilter}
                onChange={setStatusFilter}
                clearable
                style={{ flex: 1 }}
              />
              <Select
                placeholder="ステップ"
                data={STEP_OPTIONS}
                value={stepFilter}
                onChange={setStepFilter}
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
              placeholder="指示書番号・受注番号で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="状態"
              data={statusOptions('ApprovalRequest')}
              value={statusFilter}
              onChange={setStatusFilter}
              clearable
              w={150}
            />
            <Select
              placeholder="ステップ"
              data={STEP_OPTIONS}
              value={stepFilter}
              onChange={setStepFilter}
              clearable
              w={150}
            />
            <Button variant="subtle" onClick={reset}>
              リセット
            </Button>
          </Group>
        )}

        {filtered.length === 0 ? (
          <EmptyState icon={<IconShieldCheck size={24} />} message="承認待ちの依頼はありません" />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <DocNumber c="dimmed">指示書 #{r.workOrderNumber}</DocNumber>
                    <Text size="sm" fw={600} truncate>
                      {r.salesOrderNumber}
                    </Text>
                    <Group gap="md" mt={2}>
                      <Text size="xs" c="dimmed">
                        {STEP_LABEL[r.step]}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {r.requestedBy}
                      </Text>
                    </Group>
                  </Stack>
                  <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                    <StatusBadge entity="ApprovalRequest" status={r.status} />
                    <Text size="xs" c="dimmed">
                      {formatDate(r.requestedAt)}
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
                <Table.Th>指示書番号</Table.Th>
                <Table.Th>受注番号</Table.Th>
                <Table.Th>ステップ</Table.Th>
                <Table.Th>依頼者</Table.Th>
                <Table.Th>依頼日</Table.Th>
                <Table.Th>状態</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td>
                    <DocNumber>#{r.workOrderNumber}</DocNumber>
                  </Table.Td>
                  <Table.Td>
                    <DocNumber>{r.salesOrderNumber}</DocNumber>
                  </Table.Td>
                  <Table.Td>{STEP_LABEL[r.step]}</Table.Td>
                  <Table.Td>{r.requestedBy}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(r.requestedAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge entity="ApprovalRequest" status={r.status} />
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
