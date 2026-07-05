'use client';

import { useState } from 'react';
import { Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconCheck,
  IconCircleMinus,
  IconCopy,
  IconCylinder,
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
import { MATERIALS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';
import { DeleteProductModal } from './_modals/delete';
import { DuplicateProductModal } from './_modals/duplicate';
import { ToggleProductActiveModal } from './_modals/toggle-active';

// ── Mock data ───────────────────────────────────────────────────────────────
interface ProductRow {
  id: string;
  name: LocalizedText;
  materialId: string;
  unit: string;
  isActive: boolean;
}

const MOCK_RECORDS: ProductRow[] = [
  { id: 'PRD-202601-0001', name: { ja: '精密軸', en: 'Precision shaft' }, materialId: 'A01A0001-A001-001', unit: '本', isActive: true },
  { id: 'PRD-202602-0008', name: { ja: 'ロッド', en: 'Rod' }, materialId: 'A02B0014-B001-002', unit: '本', isActive: true },
  { id: 'PRD-202603-0012', name: { ja: '特殊加工品', en: 'Custom machined part' }, materialId: 'B01A0007-A002-001', unit: '本', isActive: true },
  { id: 'PRD-2511-0044', name: { ja: '旧型スリーブ', en: 'Legacy sleeve' }, materialId: 'A01A0001-A001-001', unit: '個', isActive: false },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

export default function ProductListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [materialFilter, setMaterialFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Modal state (single active row).
  const [deleteRow, setDeleteRow] = useState<ProductRow | null>(null);
  const [duplicateRow, setDuplicateRow] = useState<ProductRow | null>(null);
  const [toggleRow, setToggleRow] = useState<ProductRow | null>(null);

  const reset = () => {
    setSearch('');
    setMaterialFilter(null);
    setStatusFilter(null);
  };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch = !search || r.id.includes(search) || localized(r.name).includes(search);
    const matchesMaterial = !materialFilter || r.materialId === materialFilter;
    const matchesStatus = !statusFilter || (statusFilter === 'active' ? r.isActive : !r.isActive);
    return matchesSearch && matchesMaterial && matchesStatus;
  });

  const columns: Column<ProductRow>[] = [
    { key: 'id', header: '製品コード', sortable: true, width: 160, render: (r) => <DocNumber>{r.id}</DocNumber> },
    { key: 'name', header: '名称', sortable: true, sortValue: (r) => localized(r.name), render: (r) => localized(r.name) },
    { key: 'materialId', header: '素材', sortable: true, hideable: true, render: (r) => <DocNumber c="dimmed">{r.materialId}</DocNumber> },
    { key: 'unit', header: '単位', sortable: true, hideable: true, width: 80, render: (r) => r.unit },
    { key: 'isActive', header: '状態', sortable: true, width: 90, sortValue: (r) => (r.isActive ? 1 : 0), render: (r) => <ActiveBadge active={r.isActive} /> },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', 'マスタ', '製品']}
      title="製品"
      action={<NewButton />}
      onReset={reset}
      search={
        <TextInput
          placeholder="製品コード・名称・仕様で全文検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <>
          <Select
            placeholder="素材" data={MATERIALS} value={materialFilter} onChange={setMaterialFilter}
            searchable clearable w={isMobile ? undefined : 220} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="状態" data={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter}
            clearable w={isMobile ? 110 : 120}
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
                  <DocNumber c="dimmed">{r.materialId}</DocNumber>
                  <Text size="xs" c="dimmed">{r.unit}</Text>
                </Group>
              </Stack>
              <ActiveBadge active={r.isActive} />
            </Group>
          </Paper>
        )}
        emptyIcon={<IconCylinder size={24} />}
        emptyMessage="製品がありません"
        emptyAction={<NewButton />}
      />

      <DeleteProductModal
        opened={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        productCode={deleteRow?.id ?? ''}
        productName={deleteRow ? localized(deleteRow.name) : undefined}
      />
      <DuplicateProductModal
        opened={!!duplicateRow}
        onClose={() => setDuplicateRow(null)}
        productCode={duplicateRow?.id ?? ''}
        sourceName={duplicateRow ? localized(duplicateRow.name) : undefined}
        sourceUnit={duplicateRow?.unit}
      />
      <ToggleProductActiveModal
        opened={!!toggleRow}
        onClose={() => setToggleRow(null)}
        productCode={toggleRow?.id ?? ''}
        productName={toggleRow ? localized(toggleRow.name) : undefined}
        isActive={toggleRow?.isActive ?? true}
      />
    </ListShell>
  );
}
