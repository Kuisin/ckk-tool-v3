'use client';

import { useState } from 'react';
import { Group, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconCheck,
  IconExternalLink,
  IconSearch,
  IconShieldCheck,
  IconX,
} from '@tabler/icons-react';
import { DocNumber, formatDate } from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
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
  { id: '1', workOrderNumber: 1044, salesOrderNumber: 'ORD-202601-00002-01', step: 'SECOND', requestedBy: '鈴木 一郎', requestedAt: '2026-05-29', status: 'PENDING' },
  { id: '2', workOrderNumber: 1046, salesOrderNumber: 'ORD-202601-00004-01', step: 'FIRST', requestedBy: '鈴木 一郎', requestedAt: '2026-05-30', status: 'PENDING' },
  { id: '3', workOrderNumber: 1042, salesOrderNumber: 'ORD-202601-00001-01', step: 'SECOND', requestedBy: '鈴木 一郎', requestedAt: '2026-05-22', status: 'APPROVED' },
  { id: '4', workOrderNumber: 1039, salesOrderNumber: 'ORD-202512-00015-01', step: 'FIRST', requestedBy: '田中 太郎', requestedAt: '2026-05-18', status: 'REJECTED' },
];

const STEP_LABEL: Record<string, string> = { FIRST: '第一承認', SECOND: '第二承認' };
const STEP_OPTIONS = [
  { value: 'FIRST', label: '第一承認' },
  { value: 'SECOND', label: '第二承認' },
];

export default function ApprovalsListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [stepFilter, setStepFilter] = useState<string | null>(null);

  const reset = () => { setSearch(''); setStatusFilter(null); setStepFilter(null); };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search || String(r.workOrderNumber).includes(search) || r.salesOrderNumber.includes(search);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    const matchesStep = !stepFilter || r.step === stepFilter;
    return matchesSearch && matchesStatus && matchesStep;
  });

  const columns: Column<ApprovalRow>[] = [
    { key: 'workOrderNumber', header: '指示書番号', sortable: true, width: 120, sortValue: (r) => r.workOrderNumber, render: (r) => <DocNumber>#{r.workOrderNumber}</DocNumber> },
    { key: 'salesOrderNumber', header: '受注番号', sortable: true, render: (r) => <DocNumber>{r.salesOrderNumber}</DocNumber> },
    { key: 'step', header: 'ステップ', sortable: true, width: 110, sortValue: (r) => STEP_LABEL[r.step], render: (r) => STEP_LABEL[r.step] },
    { key: 'requestedBy', header: '依頼者', sortable: true, hideable: true, width: 130, render: (r) => r.requestedBy },
    { key: 'requestedAt', header: '依頼日', sortable: true, width: 120, render: (r) => formatDate(r.requestedAt) },
    { key: 'status', header: '状態', sortable: true, width: 110, render: (r) => <StatusBadge entity="ApprovalRequest" status={r.status} /> },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', '生産', '承認管理']}
      title="承認待ち一覧"
      onReset={reset}
      search={
        <TextInput
          placeholder="指示書番号・受注番号で検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <>
          <Select
            placeholder="状態" data={statusOptions('ApprovalRequest')} value={statusFilter} onChange={setStatusFilter}
            clearable w={isMobile ? undefined : 150} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="ステップ" data={STEP_OPTIONS} value={stepFilter} onChange={setStepFilter}
            clearable w={isMobile ? undefined : 150} style={isMobile ? { flex: 1 } : undefined}
          />
        </>
      }
    >
      <DataTable
        data={filtered}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={() => { /* navigate to detail */ }}
        defaultSort={{ key: 'requestedAt', dir: 'desc' }}
        selectable
        bulkActions={[
          { label: '一括承認', icon: <IconCheck size={16} />, color: 'green' },
          { label: '一括差し戻し', icon: <IconX size={16} />, color: 'red' },
        ]}
        rowActions={(r) =>
          r.status === 'PENDING'
            ? [
                { label: '承認', icon: <IconCheck size={14} />, color: 'green' },
                { label: '差し戻し', icon: <IconX size={14} />, color: 'red' },
                { label: '指示書を開く', icon: <IconExternalLink size={14} /> },
              ]
            : [{ label: '指示書を開く', icon: <IconExternalLink size={14} /> }]
        }
        renderCard={(r) => (
          <Group justify="space-between" wrap="nowrap" align="flex-start"
            style={{ padding: 'var(--mantine-spacing-sm)', border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }}>
            <Stack gap={3} style={{ minWidth: 0 }}>
              <DocNumber c="dimmed">指示書 #{r.workOrderNumber}</DocNumber>
              <Text size="sm" fw={600} truncate>{r.salesOrderNumber}</Text>
              <Group gap="md" mt={2}>
                <Text size="xs" c="dimmed">{STEP_LABEL[r.step]}</Text>
                <Text size="xs" c="dimmed">{r.requestedBy}</Text>
              </Group>
            </Stack>
            <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
              <StatusBadge entity="ApprovalRequest" status={r.status} />
              <Text size="xs" c="dimmed">{formatDate(r.requestedAt)}</Text>
            </Stack>
          </Group>
        )}
        emptyIcon={<IconShieldCheck size={24} />}
        emptyMessage="承認待ちの依頼はありません"
      />
    </ListShell>
  );
}
