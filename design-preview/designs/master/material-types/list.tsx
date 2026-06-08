'use client';

import { useState } from 'react';
import { Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconAtom,
  IconCheck,
  IconCircleMinus,
  IconEdit,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  formatDate,
  localized,
  NewButton,
  type LocalizedText,
} from '../../lib/ui';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { useIsMobile } from '../../lib/viewport-context';
import { DeleteMaterialTypeModal } from './_modals/delete';
import { ToggleMaterialTypeActiveModal } from './_modals/toggle-active';

// ── Mock data ───────────────────────────────────────────────────────────────
interface MaterialTypeRow {
  id: string;
  name: LocalizedText;
  isActive: boolean;
  updatedAt: string;
}

const MOCK_RECORDS: MaterialTypeRow[] = [
  { id: 'A01A0001', name: { ja: 'SUS303', en: 'SUS303' }, isActive: true, updatedAt: '2026-05-12 10:30' },
  { id: 'A02B0014', name: { ja: 'SKD11', en: 'SKD11' }, isActive: true, updatedAt: '2026-04-28 14:05' },
  { id: 'B01A0007', name: { ja: 'S45C 炭素鋼', en: 'S45C' }, isActive: true, updatedAt: '2026-03-19 09:11' },
  { id: 'C03A0002', name: { ja: 'A5052 アルミ合金', en: 'A5052' }, isActive: false, updatedAt: '2025-12-02 16:42' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

export default function MaterialTypeListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [deleteRow, setDeleteRow] = useState<MaterialTypeRow | null>(null);
  const [toggleRow, setToggleRow] = useState<MaterialTypeRow | null>(null);

  const reset = () => {
    setSearch('');
    setStatusFilter(null);
  };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch = !search || r.id.includes(search) || localized(r.name).includes(search);
    const matchesStatus = !statusFilter || (statusFilter === 'active' ? r.isActive : !r.isActive);
    return matchesSearch && matchesStatus;
  });

  const columns: Column<MaterialTypeRow>[] = [
    { key: 'id', header: '材種コード', sortable: true, width: 140, render: (r) => <DocNumber>{r.id}</DocNumber> },
    { key: 'name', header: '名称', sortable: true, sortValue: (r) => localized(r.name), render: (r) => localized(r.name) },
    { key: 'isActive', header: '状態', sortable: true, width: 90, sortValue: (r) => (r.isActive ? 1 : 0), render: (r) => <ActiveBadge active={r.isActive} /> },
    { key: 'updatedAt', header: '更新日', sortable: true, hideable: true, width: 120, render: (r) => formatDate(r.updatedAt) },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', 'マスタ', '材種']}
      title="材種"
      action={<NewButton />}
      onReset={reset}
      search={
        <TextInput
          placeholder="材種コード・名称で検索"
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
        getRowId={(r) => r.id}
        onRowClick={() => { /* navigate to detail */ }}
        defaultSort={{ key: 'id', dir: 'asc' }}
        selectable
        bulkActions={[
          { label: '一括有効化', icon: <IconCheck size={16} />, color: 'green' },
          { label: '一括無効化', icon: <IconCircleMinus size={16} />, color: 'orange' },
          { label: '一括削除', icon: <IconTrash size={16} />, color: 'red' },
        ]}
        rowActions={(row) => [
          { label: '編集', icon: <IconEdit size={14} /> },
          { label: row.isActive ? '無効化' : '有効化', icon: <IconCircleMinus size={14} />, onAction: (r) => setToggleRow(r) },
          { label: '削除', icon: <IconTrash size={14} />, color: 'red', onAction: (r) => setDeleteRow(r) },
        ]}
        renderCard={(r) => (
          <Paper p="sm" withBorder radius="sm">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <DocNumber c="dimmed">{r.id}</DocNumber>
                <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
                <Text size="xs" c="dimmed">更新: {formatDate(r.updatedAt)}</Text>
              </Stack>
              <ActiveBadge active={r.isActive} />
            </Group>
          </Paper>
        )}
        emptyIcon={<IconAtom size={24} />}
        emptyMessage="材種がありません"
        emptyAction={<NewButton />}
      />

      <DeleteMaterialTypeModal
        opened={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        code={deleteRow?.id ?? ''}
        name={deleteRow ? localized(deleteRow.name) : undefined}
      />
      <ToggleMaterialTypeActiveModal
        opened={!!toggleRow}
        onClose={() => setToggleRow(null)}
        code={toggleRow?.id ?? ''}
        name={toggleRow ? localized(toggleRow.name) : undefined}
        isActive={toggleRow?.isActive ?? true}
      />
    </ListShell>
  );
}
