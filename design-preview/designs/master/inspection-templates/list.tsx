'use client';

import { useState } from 'react';
import { Select, TextInput } from '@mantine/core';
import {
  IconCheck,
  IconCopy,
  IconEdit,
  IconListCheck,
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
import { PROCESS_STEPS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';
import { DeleteTemplateModal } from './_modals/delete';
import { ToggleActiveTemplateModal } from './_modals/toggle-active';
import { DuplicateTemplateModal } from './_modals/duplicate';

// ── Process step label lookup (related_process_step_id → label) ──────────────
const PROCESS_LABEL: Record<string, string> = Object.fromEntries(
  PROCESS_STEPS.map((s) => [s.value, s.label]),
);

interface InspectionTemplateRow {
  id: string;
  code: string;
  name: LocalizedText;
  relatedStepId: string | null;
  itemCount: number;
  isActive: boolean;
}

const MOCK_RECORDS: InspectionTemplateRow[] = [
  { id: '1', code: 'INSP-CYL-001', name: { ja: '円筒加工 寸法検査表', en: 'Cylinder Machining Dimension Inspection' }, relatedStepId: 'CYLINDER_INSPECTION', itemCount: 4, isActive: true },
  { id: '2', code: 'INSP-SHIP-001', name: { ja: '出荷前 外観検査表', en: 'Pre-Shipment Visual Inspection' }, relatedStepId: 'SHIPPING_INSPECTION', itemCount: 6, isActive: true },
  { id: '3', code: 'INSP-CTR-001', name: { ja: 'センタレス 外径検査表', en: 'Centerless Outer Diameter Inspection' }, relatedStepId: 'CENTERLESS', itemCount: 3, isActive: true },
  { id: '4', code: 'INSP-COAT-001', name: { ja: 'コーティング 膜厚検査表', en: 'Coating Thickness Inspection' }, relatedStepId: 'COATING', itemCount: 2, isActive: false },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

export default function InspectionTemplateListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Modal target state (single-row dialogs reused across list rows).
  const [deleteTarget, setDeleteTarget] = useState<InspectionTemplateRow | null>(null);
  const [toggleTarget, setToggleTarget] = useState<InspectionTemplateRow | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<InspectionTemplateRow | null>(null);

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

  const columns: Column<InspectionTemplateRow>[] = [
    { key: 'code', header: 'コード', sortable: true, width: 160, render: (r) => <DocNumber>{r.code}</DocNumber> },
    { key: 'name', header: '名称', sortable: true, sortValue: (r) => localized(r.name), render: (r) => localized(r.name) },
    { key: 'relatedStep', header: '関連工程', sortable: true, hideable: true, sortValue: (r) => (r.relatedStepId ? PROCESS_LABEL[r.relatedStepId] ?? r.relatedStepId : ''), render: (r) => (r.relatedStepId ? PROCESS_LABEL[r.relatedStepId] ?? r.relatedStepId : '—') },
    { key: 'itemCount', header: '検査項目数', sortable: true, hideable: true, align: 'right', width: 110, sortValue: (r) => r.itemCount, render: (r) => `${r.itemCount} 項目` },
    { key: 'isActive', header: '状態', sortable: true, width: 100, sortValue: (r) => (r.isActive ? 1 : 0), render: (r) => <ActiveBadge active={r.isActive} /> },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', 'マスタ', '検査表テンプレート']}
      title="検査表テンプレート"
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
        getRowId={(r) => r.id}
        onRowClick={() => { /* navigate to detail */ }}
        defaultSort={{ key: 'code', dir: 'asc' }}
        selectable
        bulkActions={[
          { label: '一括有効化', icon: <IconCheck size={16} />, color: 'green' },
          { label: '一括無効化', icon: <IconX size={16} />, color: 'gray' },
          { label: '一括削除', icon: <IconTrash size={16} />, color: 'red' },
        ]}
        rowActions={(r) => [
          { label: '編集', icon: <IconEdit size={14} /> },
          { label: '複製', icon: <IconCopy size={14} />, onAction: (row) => setDuplicateTarget(row) },
          { label: r.isActive ? '無効化' : '有効化', icon: r.isActive ? <IconX size={14} /> : <IconCheck size={14} />, onAction: (row) => setToggleTarget(row) },
          { label: '削除', icon: <IconTrash size={14} />, color: 'red', onAction: (row) => setDeleteTarget(row) },
        ]}
        emptyIcon={<IconListCheck size={24} />}
        emptyMessage="検査表テンプレートがありません"
        emptyAction={<NewButton />}
      />

      <DeleteTemplateModal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        code={deleteTarget?.code ?? ''}
      />
      <ToggleActiveTemplateModal
        opened={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        code={toggleTarget?.code ?? ''}
        isActive={toggleTarget?.isActive ?? true}
      />
      <DuplicateTemplateModal
        opened={!!duplicateTarget}
        onClose={() => setDuplicateTarget(null)}
        sourceCode={duplicateTarget?.code ?? ''}
        sourceName={duplicateTarget?.name}
      />
    </ListShell>
  );
}
