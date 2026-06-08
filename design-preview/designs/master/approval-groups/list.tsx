'use client';

import { useState } from 'react';
import { Badge, Select, TextInput } from '@mantine/core';
import {
  IconCheck,
  IconEdit,
  IconSearch,
  IconTrash,
  IconUsersGroup,
  IconX,
} from '@tabler/icons-react';
import {
  ActiveBadge,
  localized,
  NewButton,
  type LocalizedText,
} from '../../lib/ui';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { useIsMobile } from '../../lib/viewport-context';
import { DeleteApprovalGroupModal } from './_modals/delete';

// ── Approval group type (APPROVAL_GROUP_TYPE) ────────────────────────────────
type ApprovalGroupType = 'FIRST' | 'SECOND' | 'WORKFLOW_CHANGE';

const TYPE_CONFIG: Record<ApprovalGroupType, { label: string; color: string }> = {
  FIRST:           { label: '第一承認',     color: 'blue' },
  SECOND:          { label: '第二承認',     color: 'violet' },
  WORKFLOW_CHANGE: { label: '製造変更承認', color: 'orange' },
};

const TYPE_OPTIONS = Object.entries(TYPE_CONFIG).map(([value, c]) => ({ value, label: c.label }));

interface ApprovalGroupRow {
  id: number;
  name: LocalizedText;
  type: ApprovalGroupType;
  memberCount: number;
  isActive: boolean;
}

const MOCK_RECORDS: ApprovalGroupRow[] = [
  { id: 1, name: { ja: '生産判断グループ', en: 'Production Decision Group' }, type: 'FIRST', memberCount: 3, isActive: true },
  { id: 2, name: { ja: '部門承認グループ', en: 'Department Approval Group' }, type: 'SECOND', memberCount: 2, isActive: true },
  { id: 3, name: { ja: 'ワークフロー変更承認', en: 'Workflow Change Approval' }, type: 'WORKFLOW_CHANGE', memberCount: 2, isActive: true },
  { id: 4, name: { ja: '旧 第一承認グループ', en: 'Legacy First Approval' }, type: 'FIRST', memberCount: 0, isActive: false },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

function TypeBadge({ type }: { type: ApprovalGroupType }) {
  const c = TYPE_CONFIG[type];
  return <Badge color={c.color} variant="light">{c.label}</Badge>;
}

export default function ApprovalGroupListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ApprovalGroupRow | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch = !search || localized(r.name).includes(search);
    const matchesType = !typeFilter || r.type === typeFilter;
    const matchesStatus =
      !statusFilter || (statusFilter === 'active' ? r.isActive : !r.isActive);
    return matchesSearch && matchesType && matchesStatus;
  });

  const reset = () => {
    setSearch('');
    setTypeFilter(null);
    setStatusFilter(null);
  };

  const columns: Column<ApprovalGroupRow>[] = [
    { key: 'name', header: '名称', sortable: true, sortValue: (r) => localized(r.name), render: (r) => localized(r.name) },
    { key: 'type', header: '種別', sortable: true, width: 140, sortValue: (r) => TYPE_CONFIG[r.type].label, render: (r) => <TypeBadge type={r.type} /> },
    { key: 'memberCount', header: 'メンバー数', sortable: true, hideable: true, align: 'right', width: 110, sortValue: (r) => r.memberCount, render: (r) => `${r.memberCount} 名` },
    { key: 'isActive', header: '状態', sortable: true, width: 100, sortValue: (r) => (r.isActive ? 1 : 0), render: (r) => <ActiveBadge active={r.isActive} /> },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', 'マスタ', '承認グループ']}
      title="承認グループ"
      action={<NewButton />}
      onReset={reset}
      search={
        <TextInput
          placeholder="名称で検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <>
          <Select
            placeholder="種別" data={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter}
            clearable w={isMobile ? undefined : 160} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="状態" data={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter}
            clearable w={isMobile ? undefined : 160} style={isMobile ? { flex: 1 } : undefined}
          />
        </>
      }
    >
      <DataTable
        data={filtered}
        columns={columns}
        getRowId={(r) => String(r.id)}
        onRowClick={() => { /* navigate to detail */ }}
        defaultSort={{ key: 'name', dir: 'asc' }}
        selectable
        bulkActions={[
          { label: '一括有効化', icon: <IconCheck size={16} />, color: 'green' },
          { label: '一括無効化', icon: <IconX size={16} />, color: 'gray' },
          { label: '一括削除', icon: <IconTrash size={16} />, color: 'red' },
        ]}
        rowActions={() => [
          { label: '編集', icon: <IconEdit size={14} /> },
          { label: '削除', icon: <IconTrash size={14} />, color: 'red', onAction: (row) => setDeleteTarget(row) },
        ]}
        emptyIcon={<IconUsersGroup size={24} />}
        emptyMessage="承認グループがありません"
        emptyAction={<NewButton />}
      />

      <DeleteApprovalGroupModal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        name={deleteTarget ? localized(deleteTarget.name) : ''}
      />
    </ListShell>
  );
}
