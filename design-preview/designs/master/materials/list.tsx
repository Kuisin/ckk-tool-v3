'use client';

import { useState } from 'react';
import { Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconBolt,
  IconCheck,
  IconCircleMinus,
  IconCopy,
  IconEdit,
  IconSearch,
  IconTrash,
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
import { MATERIAL_TYPES } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';
import { DeleteMaterialModal } from './_modals/delete';
import { DuplicateMaterialModal } from './_modals/duplicate';
import { ToggleMaterialActiveModal } from './_modals/toggle-active';

// ── Material form labels (MATERIAL_FORM enum) ────────────────────────────────
const FORM_LABEL: Record<string, string> = {
  POLISHED: '研磨',
  STANDARD_LENGTH: '定尺',
  SEMI_FINISHED: '半製品',
  OTHER: 'その他',
};

const FORM_OPTIONS = Object.entries(FORM_LABEL).map(([value, label]) => ({ value, label }));

// ── Mock data ───────────────────────────────────────────────────────────────
interface MaterialRow {
  id: string;
  materialTypeId: string;
  name: LocalizedText;
  form: keyof typeof FORM_LABEL;
  unit: string;
  isActive: boolean;
}

const MOCK_RECORDS: MaterialRow[] = [
  { id: 'A01A0001-A001-001', materialTypeId: 'A01A0001', name: { ja: 'SUS303 φ20×3000', en: 'SUS303 φ20×3000' }, form: 'POLISHED', unit: '本', isActive: true },
  { id: 'A02B0014-B001-002', materialTypeId: 'A02B0014', name: { ja: 'SKD11 φ32×2500', en: 'SKD11 φ32×2500' }, form: 'STANDARD_LENGTH', unit: '本', isActive: true },
  { id: 'B01A0007-A002-001', materialTypeId: 'B01A0007', name: { ja: 'S45C φ16×4000', en: 'S45C φ16×4000' }, form: 'POLISHED', unit: '本', isActive: true },
  { id: 'A02B0014-C001-001', materialTypeId: 'A02B0014', name: { ja: 'SKD11 半製品ブランク', en: 'SKD11 blank' }, form: 'SEMI_FINISHED', unit: '個', isActive: false },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

export default function MaterialListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [formFilter, setFormFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [deleteRow, setDeleteRow] = useState<MaterialRow | null>(null);
  const [duplicateRow, setDuplicateRow] = useState<MaterialRow | null>(null);
  const [toggleRow, setToggleRow] = useState<MaterialRow | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch = !search || r.id.includes(search) || localized(r.name).includes(search);
    const matchesType = !typeFilter || r.materialTypeId === typeFilter;
    const matchesForm = !formFilter || r.form === formFilter;
    const matchesStatus = !statusFilter || (statusFilter === 'active' ? r.isActive : !r.isActive);
    return matchesSearch && matchesType && matchesForm && matchesStatus;
  });

  const reset = () => {
    setSearch('');
    setTypeFilter(null);
    setFormFilter(null);
    setStatusFilter(null);
  };

  const columns: Column<MaterialRow>[] = [
    { key: 'id', header: '素材コード', sortable: true, width: 180, render: (r) => <DocNumber>{r.id}</DocNumber> },
    { key: 'materialTypeId', header: '材種', sortable: true, hideable: true, width: 120, render: (r) => <DocNumber c="dimmed">{r.materialTypeId}</DocNumber> },
    { key: 'name', header: '名称', sortable: true, sortValue: (r) => localized(r.name), render: (r) => localized(r.name) },
    { key: 'form', header: '形態', sortable: true, hideable: true, width: 90, sortValue: (r) => FORM_LABEL[r.form], render: (r) => FORM_LABEL[r.form] },
    { key: 'unit', header: '単位', sortable: true, hideable: true, width: 80, render: (r) => r.unit },
    { key: 'isActive', header: '状態', sortable: true, width: 90, sortValue: (r) => (r.isActive ? 1 : 0), render: (r) => <ActiveBadge active={r.isActive} /> },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', 'マスタ', '素材']}
      title="素材"
      action={<NewButton />}
      onReset={reset}
      search={
        <TextInput
          placeholder="素材コード・名称で検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <>
          <Select
            placeholder="材種" data={MATERIAL_TYPES} value={typeFilter} onChange={setTypeFilter}
            searchable clearable w={isMobile ? undefined : 180} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="形態" data={FORM_OPTIONS} value={formFilter} onChange={setFormFilter}
            clearable w={isMobile ? undefined : 130} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="状態" data={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter}
            clearable w={isMobile ? undefined : 120} style={isMobile ? { flex: 1 } : undefined}
          />
        </>
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
          { label: '複製', icon: <IconCopy size={14} />, onAction: (r) => setDuplicateRow(r) },
          { label: row.isActive ? '無効化' : '有効化', icon: <IconCircleMinus size={14} />, onAction: (r) => setToggleRow(r) },
          { label: '削除', icon: <IconTrash size={14} />, color: 'red', onAction: (r) => setDeleteRow(r) },
        ]}
        renderCard={(r) => (
          <Paper p="sm" withBorder radius="sm">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <DocNumber c="dimmed">{r.id}</DocNumber>
                <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
                <Group gap="md" mt={2}>
                  <Text size="xs" c="dimmed">{FORM_LABEL[r.form]}</Text>
                  <Text size="xs" c="dimmed">{r.unit}</Text>
                </Group>
              </Stack>
              <ActiveBadge active={r.isActive} />
            </Group>
          </Paper>
        )}
        emptyIcon={<IconBolt size={24} />}
        emptyMessage="素材がありません"
        emptyAction={<NewButton />}
      />

      <DeleteMaterialModal
        opened={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        code={deleteRow?.id ?? ''}
        name={deleteRow ? localized(deleteRow.name) : undefined}
      />
      <DuplicateMaterialModal
        opened={!!duplicateRow}
        onClose={() => setDuplicateRow(null)}
        sourceCode={duplicateRow?.id ?? ''}
        sourceName={duplicateRow ? localized(duplicateRow.name) : undefined}
        sourceTypeId={duplicateRow?.materialTypeId}
        sourceForm={duplicateRow?.form}
        sourceUnit={duplicateRow?.unit}
      />
      <ToggleMaterialActiveModal
        opened={!!toggleRow}
        onClose={() => setToggleRow(null)}
        code={toggleRow?.id ?? ''}
        name={toggleRow ? localized(toggleRow.name) : undefined}
        isActive={toggleRow?.isActive ?? true}
      />
    </ListShell>
  );
}
