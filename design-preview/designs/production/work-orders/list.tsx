'use client';

import { useState } from 'react';
import { Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconCalendar,
  IconCopy,
  IconEdit,
  IconFileExport,
  IconSearch,
  IconSettings2,
  IconX,
} from '@tabler/icons-react';
import { DocNumber, formatDate, NewButton } from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { useIsMobile } from '../../lib/viewport-context';

interface WorkOrderRow {
  id: string;
  workOrderNumber: number;
  salesOrderNumber: string;
  type: 'FROM_STOCK' | 'MANUFACTURE';
  plannedQuantity: number;
  approvalStatus: string;
  status: string;
  updatedAt: string;
}

const MOCK_RECORDS: WorkOrderRow[] = [
  { id: '1', workOrderNumber: 1042, salesOrderNumber: 'ORD-202601-00001-01', type: 'MANUFACTURE', plannedQuantity: 50, approvalStatus: 'APPROVED_1ST', status: 'IN_PROGRESS', updatedAt: '2026-05-28' },
  { id: '2', workOrderNumber: 1043, salesOrderNumber: 'ORD-202601-00001-01', type: 'FROM_STOCK', plannedQuantity: 20, approvalStatus: 'NONE', status: 'COMPLETED', updatedAt: '2026-05-26' },
  { id: '3', workOrderNumber: 1044, salesOrderNumber: 'ORD-202601-00002-01', type: 'MANUFACTURE', plannedQuantity: 30, approvalStatus: 'PENDING_2ND', status: 'PENDING_APPROVAL', updatedAt: '2026-05-29' },
  { id: '4', workOrderNumber: 1045, salesOrderNumber: 'ORD-202601-00003-01', type: 'MANUFACTURE', plannedQuantity: 10, approvalStatus: 'NONE', status: 'DRAFT', updatedAt: '2026-05-30' },
  { id: '5', workOrderNumber: 1041, salesOrderNumber: 'ORD-202512-00018-02', type: 'MANUFACTURE', plannedQuantity: 120, approvalStatus: 'APPROVED', status: 'APPROVED', updatedAt: '2026-05-24' },
];

const TYPE_LABEL: Record<string, string> = { FROM_STOCK: '在庫分', MANUFACTURE: '製造分' };
const TYPE_OPTIONS = [
  { value: 'FROM_STOCK', label: '在庫分' },
  { value: 'MANUFACTURE', label: '製造分' },
];

export default function WorkOrdersListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<Date | null>(null);

  const reset = () => { setSearch(''); setStatusFilter(null); setTypeFilter(null); setDateFilter(null); };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search || String(r.workOrderNumber).includes(search) || r.salesOrderNumber.includes(search);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    const matchesType = !typeFilter || r.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const columns: Column<WorkOrderRow>[] = [
    { key: 'workOrderNumber', header: '指示書番号', sortable: true, width: 120, sortValue: (r) => r.workOrderNumber, render: (r) => <DocNumber>#{r.workOrderNumber}</DocNumber> },
    { key: 'salesOrderNumber', header: '受注番号', sortable: true, render: (r) => <DocNumber>{r.salesOrderNumber}</DocNumber> },
    { key: 'type', header: '種別', sortable: true, hideable: true, width: 90, sortValue: (r) => TYPE_LABEL[r.type], render: (r) => TYPE_LABEL[r.type] },
    { key: 'plannedQuantity', header: '予定数量', sortable: true, align: 'right', width: 100, sortValue: (r) => r.plannedQuantity, render: (r) => `${r.plannedQuantity} 本` },
    { key: 'approvalStatus', header: '承認状態', sortable: true, width: 130, sortValue: (r) => r.approvalStatus, render: (r) => (r.approvalStatus === 'NONE' ? <Text size="sm" c="dimmed">—</Text> : <StatusBadge entity="WorkOrderApproval" status={r.approvalStatus} variant="light" />) },
    { key: 'status', header: '状態', sortable: true, width: 110, render: (r) => <StatusBadge entity="WorkOrder" status={r.status} /> },
    { key: 'updatedAt', header: '更新日', sortable: true, hideable: true, width: 120, render: (r) => formatDate(r.updatedAt) },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', '生産', '指示書']}
      title="指示書"
      action={<NewButton />}
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
            placeholder="状態" data={statusOptions('WorkOrder')} value={statusFilter} onChange={setStatusFilter}
            clearable w={isMobile ? undefined : 150} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="種別" data={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter}
            clearable w={isMobile ? undefined : 130} style={isMobile ? { flex: 1 } : undefined}
          />
          <DatePickerInput
            placeholder="更新日" leftSection={<IconCalendar size={14} />} valueFormat="YYYY/MM/DD" clearable
            value={dateFilter} onChange={(v) => setDateFilter(v as unknown as Date | null)}
            w={isMobile ? undefined : 150} style={isMobile ? { flex: 1 } : undefined}
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
          { label: '指示書PDF一括出力', icon: <IconFileExport size={16} />, color: 'blue' },
          { label: '一括キャンセル', icon: <IconX size={16} />, color: 'red' },
        ]}
        rowActions={() => [
          { label: '編集', icon: <IconEdit size={14} /> },
          { label: 'コピーして新規作成', icon: <IconCopy size={14} /> },
          { label: 'キャンセル', icon: <IconX size={14} />, color: 'red' },
        ]}
        renderCard={(r) => (
          <Group justify="space-between" wrap="nowrap" align="flex-start"
            style={{ padding: 'var(--mantine-spacing-sm)', border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }}>
            <Stack gap={3} style={{ minWidth: 0 }}>
              <DocNumber c="dimmed">指示書 #{r.workOrderNumber}</DocNumber>
              <Text size="sm" fw={600} truncate>{r.salesOrderNumber}</Text>
              <Group gap="md" mt={2}>
                <Text size="xs" c="dimmed">{TYPE_LABEL[r.type]}</Text>
                <Text size="xs" c="dimmed">予定 {r.plannedQuantity} 本</Text>
              </Group>
            </Stack>
            <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
              <StatusBadge entity="WorkOrder" status={r.status} />
              {r.approvalStatus !== 'NONE' && (
                <StatusBadge entity="WorkOrderApproval" status={r.approvalStatus} size="xs" variant="light" />
              )}
            </Stack>
          </Group>
        )}
        emptyIcon={<IconSettings2 size={24} />}
        emptyMessage="指示書がありません"
        emptyAction={<NewButton />}
      />
    </ListShell>
  );
}
