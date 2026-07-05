'use client';

import { useState } from 'react';
import { Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconCheck,
  IconEdit,
  IconRuler2,
  IconSearch,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import {
  DocNumber,
  formatDate,
  NewButton,
} from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
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
  { id: '1', requestNumber: 'DSR-202606-0001', trigger: 'QUOTE', productName: '精密軸 PRD-202601-0001', status: 'IN_PROGRESS', updatedAt: '2026-06-05' },
  { id: '2', requestNumber: 'DSR-202606-0002', trigger: 'SALES_ORDER', productName: 'ロッド PRD-202602-0008', status: 'PENDING', updatedAt: '2026-06-06' },
  { id: '3', requestNumber: 'DSR-202605-0014', trigger: 'QUOTE', productName: '特殊加工品 PRD-202603-0012', status: 'COMPLETED', updatedAt: '2026-05-28' },
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
    const matchesSearch = !search || r.requestNumber.includes(search) || r.productName.includes(search);
    const matchesStatus = !status || r.status === status;
    const matchesTrigger = !trigger || r.trigger === trigger;
    return matchesSearch && matchesStatus && matchesTrigger;
  });

  const columns: Column<DesignRequestRow>[] = [
    { key: 'requestNumber', header: '依頼番号', sortable: true, width: 170, render: (r) => <DocNumber>{r.requestNumber}</DocNumber> },
    { key: 'trigger', header: 'トリガー', sortable: true, hideable: true, width: 110, sortValue: (r) => r.trigger, render: (r) => TRIGGER_LABEL[r.trigger] },
    { key: 'productName', header: '製品', sortable: true, render: (r) => r.productName },
    { key: 'status', header: '状態', sortable: true, width: 110, render: (r) => <StatusBadge entity="DesignRequest" status={r.status} /> },
    { key: 'updatedAt', header: '更新日', sortable: true, hideable: true, width: 120, render: (r) => formatDate(r.updatedAt) },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', '販売', '設計依頼書']}
      title="設計依頼書"
      action={<NewButton />}
      onReset={reset}
      search={
        <TextInput
          placeholder="依頼番号・製品で検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <>
          <Select
            placeholder="状態" data={statusOptions('DesignRequest')} value={status} onChange={setStatus}
            clearable w={isMobile ? undefined : 140} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="トリガー" data={TRIGGER_OPTIONS} value={trigger} onChange={setTrigger}
            clearable w={isMobile ? undefined : 140} style={isMobile ? { flex: 1 } : undefined}
          />
        </>
      }
    >
      <DataTable
        data={filtered}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={() => { /* navigate to detail */ }}
        defaultSort={{ key: 'updatedAt', dir: 'desc' }}
        selectable
        bulkActions={[
          { label: '一括完了', icon: <IconCheck size={16} />, color: 'green' },
          { label: '一括キャンセル', icon: <IconTrash size={16} />, color: 'red' },
        ]}
        rowActions={() => [
          { label: '編集', icon: <IconEdit size={14} /> },
          { label: '設計図をアップロード', icon: <IconUpload size={14} /> },
          { label: '完了にする', icon: <IconCheck size={14} /> },
          { label: 'キャンセル', icon: <IconTrash size={14} />, color: 'red' },
        ]}
        emptyIcon={<IconRuler2 size={24} />}
        emptyMessage="設計依頼書がありません"
        emptyAction={<NewButton />}
        renderCard={(r) => (
          <Paper p="sm" withBorder radius="sm">
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
        )}
      />
    </ListShell>
  );
}
