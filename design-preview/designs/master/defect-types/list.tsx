'use client';

import { useState } from 'react';
import { Select, TextInput } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconEdit,
  IconSearch,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  localized,
  NewButton,
  type LocalizedText,
} from '../../lib/ui';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { useIsMobile } from '../../lib/viewport-context';
import { DeleteDefectTypeModal } from './_modals/delete';
import { ToggleActiveDefectTypeModal } from './_modals/toggle-active';

interface DefectTypeRow {
  id: number;
  code: string;
  name: LocalizedText;
  sortOrder: number;
  isActive: boolean;
}

const MOCK_RECORDS: DefectTypeRow[] = [
  { id: 1, code: 'DIM', name: { ja: '寸法不良', en: 'Dimensional Defect' }, sortOrder: 1, isActive: true },
  { id: 2, code: 'SCRATCH', name: { ja: 'キズ', en: 'Scratch' }, sortOrder: 2, isActive: true },
  { id: 3, code: 'CRACK', name: { ja: 'クラック', en: 'Crack' }, sortOrder: 3, isActive: true },
  { id: 4, code: 'COATING', name: { ja: 'コーティング不良', en: 'Coating Defect' }, sortOrder: 4, isActive: true },
  { id: 5, code: 'RUST', name: { ja: '錆', en: 'Rust' }, sortOrder: 5, isActive: false },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

export default function DefectTypeListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<DefectTypeRow | null>(null);
  const [toggleTarget, setToggleTarget] = useState<DefectTypeRow | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search || r.code.includes(search) || localized(r.name).includes(search);
    const matchesStatus =
      !statusFilter || (statusFilter === 'active' ? r.isActive : !r.isActive);
    return matchesSearch && matchesStatus;
  });

  const reset = () => {
    setSearch('');
    setStatusFilter(null);
  };

  const columns: Column<DefectTypeRow>[] = [
    { key: 'code', header: 'コード', sortable: true, width: 160, render: (r) => <DocNumber>{r.code}</DocNumber> },
    { key: 'name', header: '名称', sortable: true, sortValue: (r) => localized(r.name), render: (r) => localized(r.name) },
    { key: 'sortOrder', header: '表示順', sortable: true, hideable: true, align: 'right', width: 90, sortValue: (r) => r.sortOrder, render: (r) => r.sortOrder },
    { key: 'isActive', header: '状態', sortable: true, width: 100, sortValue: (r) => (r.isActive ? 1 : 0), render: (r) => <ActiveBadge active={r.isActive} /> },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', 'マスタ', '不良種類']}
      title="不良種類"
      action={<NewButton />}
      onReset={reset}
      search={
        <TextInput
          placeholder="コード・名称で検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <Select
          placeholder="状態" data={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter}
          clearable w={isMobile ? undefined : 160} style={isMobile ? { flex: 1 } : undefined}
        />
      }
    >
      <DataTable
        data={filtered}
        columns={columns}
        getRowId={(r) => String(r.id)}
        defaultSort={{ key: 'sortOrder', dir: 'asc' }}
        selectable
        bulkActions={[
          { label: '一括有効化', icon: <IconCheck size={16} />, color: 'green' },
          { label: '一括無効化', icon: <IconX size={16} />, color: 'gray' },
          { label: '一括削除', icon: <IconTrash size={16} />, color: 'red' },
        ]}
        rowActions={(r) => [
          { label: '編集', icon: <IconEdit size={14} /> },
          { label: r.isActive ? '無効化' : '有効化', icon: r.isActive ? <IconX size={14} /> : <IconCheck size={14} />, onAction: (row) => setToggleTarget(row) },
          { label: '削除', icon: <IconTrash size={14} />, color: 'red', onAction: (row) => setDeleteTarget(row) },
        ]}
        emptyIcon={<IconAlertTriangle size={24} />}
        emptyMessage="不良種類がありません"
        emptyAction={<NewButton />}
      />

      <DeleteDefectTypeModal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        name={deleteTarget ? localized(deleteTarget.name) : ''}
      />
      <ToggleActiveDefectTypeModal
        opened={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        name={toggleTarget ? localized(toggleTarget.name) : ''}
        isActive={toggleTarget?.isActive ?? true}
      />
    </ListShell>
  );
}
