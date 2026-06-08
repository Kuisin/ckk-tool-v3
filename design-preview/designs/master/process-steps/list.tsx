'use client';

import { useState } from 'react';
import { Badge, Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconCircleCheck,
  IconCircleMinus,
  IconCopy,
  IconEdit,
  IconGitBranch,
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
import { useIsMobile } from '../../lib/viewport-context';
import { DeleteProcessStepModal } from './_modals/delete';
import { ToggleProcessStepActiveModal } from './_modals/toggle-active';

// ── Mock data (process_step_catalog) ─────────────────────────────────────────
type ProcessCategory =
  | 'MATERIAL_PREP'
  | 'MACHINING'
  | 'COATING'
  | 'INSPECTION'
  | 'APPROVAL'
  | 'SHIPPING';
type ProcessExecution = 'INTERNAL' | 'INTERNAL_OR_OUTSOURCE';

interface ProcessStepRow {
  id: number;
  code: string;
  name: LocalizedText;
  category: ProcessCategory;
  executionLocation: ProcessExecution;
  isSyncCapable: boolean;
  isInspection: boolean;
  isApprovalStep: boolean;
  isActive: boolean;
}

const CATEGORY_LABEL: Record<ProcessCategory, string> = {
  MATERIAL_PREP: '材料準備',
  MACHINING: '加工',
  COATING: 'コーティング',
  INSPECTION: '検査',
  APPROVAL: '検査承認',
  SHIPPING: '出荷',
};

const CATEGORY_COLOR: Record<ProcessCategory, string> = {
  MATERIAL_PREP: 'gray',
  MACHINING: 'violet',
  COATING: 'cyan',
  INSPECTION: 'blue',
  APPROVAL: 'teal',
  SHIPPING: 'orange',
};

const EXECUTION_LABEL: Record<ProcessExecution, string> = {
  INTERNAL: '社内',
  INTERNAL_OR_OUTSOURCE: '社内・外注',
};

const MOCK_RECORDS: ProcessStepRow[] = [
  { id: 1, code: 'MATERIAL_PREP', name: { ja: '素材出し（在庫）', en: 'Material Issue' }, category: 'MATERIAL_PREP', executionLocation: 'INTERNAL', isSyncCapable: false, isInspection: false, isApprovalStep: false, isActive: true },
  { id: 2, code: 'CUTTING', name: { ja: '切断', en: 'Cutting' }, category: 'MATERIAL_PREP', executionLocation: 'INTERNAL', isSyncCapable: false, isInspection: false, isApprovalStep: false, isActive: true },
  { id: 3, code: 'CENTERLESS', name: { ja: 'センタレス', en: 'Centerless' }, category: 'MACHINING', executionLocation: 'INTERNAL_OR_OUTSOURCE', isSyncCapable: false, isInspection: false, isApprovalStep: false, isActive: true },
  { id: 4, code: 'CYLINDER_MACHINING', name: { ja: '円筒加工', en: 'Cylinder Machining' }, category: 'MACHINING', executionLocation: 'INTERNAL', isSyncCapable: false, isInspection: false, isApprovalStep: false, isActive: true },
  { id: 5, code: 'CYLINDER_INSPECTION', name: { ja: '円筒加工検査', en: 'Cylinder Inspection' }, category: 'INSPECTION', executionLocation: 'INTERNAL', isSyncCapable: false, isInspection: true, isApprovalStep: false, isActive: true },
  { id: 6, code: 'CYLINDER_INSPECTION_APPROVAL', name: { ja: '円筒加工検査承認', en: 'Cylinder Inspection Approval' }, category: 'APPROVAL', executionLocation: 'INTERNAL', isSyncCapable: false, isInspection: false, isApprovalStep: true, isActive: true },
  { id: 7, code: 'STEP_MACHINING', name: { ja: '段加工', en: 'Step Machining' }, category: 'MACHINING', executionLocation: 'INTERNAL', isSyncCapable: true, isInspection: false, isApprovalStep: false, isActive: true },
  { id: 8, code: 'COATING', name: { ja: 'コーティング', en: 'Coating' }, category: 'COATING', executionLocation: 'INTERNAL_OR_OUTSOURCE', isSyncCapable: false, isInspection: false, isApprovalStep: false, isActive: true },
  { id: 9, code: 'SHIPPING_INSPECTION', name: { ja: '出荷前検査', en: 'Pre-shipping Inspection' }, category: 'INSPECTION', executionLocation: 'INTERNAL', isSyncCapable: false, isInspection: true, isApprovalStep: false, isActive: true },
  { id: 10, code: 'SHIPPING', name: { ja: '出荷', en: 'Shipping' }, category: 'SHIPPING', executionLocation: 'INTERNAL', isSyncCapable: false, isInspection: false, isApprovalStep: false, isActive: true },
];

const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABEL) as ProcessCategory[]).map((c) => ({
  value: c,
  label: CATEGORY_LABEL[c],
}));

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

function CategoryBadge({ category }: { category: ProcessCategory }) {
  return (
    <Badge variant="light" color={CATEGORY_COLOR[category]}>
      {CATEGORY_LABEL[category]}
    </Badge>
  );
}

function ExecutionBadge({ location }: { location: ProcessExecution }) {
  return (
    <Badge variant="outline" size="sm" color={location === 'INTERNAL_OR_OUTSOURCE' ? 'orange' : 'gray'}>
      {EXECUTION_LABEL[location]}
    </Badge>
  );
}

/** Small green/gray flag badge for 同期可 / 検査 / 承認 columns. */
function FlagBadge({ on, label }: { on: boolean; label: string }) {
  return (
    <Badge size="xs" variant="light" color={on ? 'green' : 'gray'}>
      {on ? label : '—'}
    </Badge>
  );
}

export default function ProcessStepsListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ProcessStepRow[] | null>(null);
  const [toggleTarget, setToggleTarget] = useState<{ rows: ProcessStepRow[]; activate: boolean } | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search || r.code.includes(search) || localized(r.name).includes(search);
    const matchesCategory = !categoryFilter || r.category === categoryFilter;
    const matchesStatus =
      !statusFilter || (statusFilter === 'active' ? r.isActive : !r.isActive);
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const reset = () => {
    setSearch('');
    setCategoryFilter(null);
    setStatusFilter(null);
  };

  const columns: Column<ProcessStepRow>[] = [
    {
      key: 'code',
      header: 'コード',
      sortable: true,
      width: 220,
      render: (r) => <DocNumber>{r.code}</DocNumber>,
    },
    {
      key: 'name',
      header: '名称',
      sortable: true,
      sortValue: (r) => localized(r.name),
      render: (r) => <Text size="sm">{localized(r.name)}</Text>,
    },
    {
      key: 'category',
      header: 'カテゴリ',
      sortable: true,
      width: 110,
      sortValue: (r) => CATEGORY_LABEL[r.category],
      render: (r) => <CategoryBadge category={r.category} />,
    },
    {
      key: 'executionLocation',
      header: '実施場所',
      sortable: true,
      hideable: true,
      width: 110,
      sortValue: (r) => EXECUTION_LABEL[r.executionLocation],
      render: (r) => <ExecutionBadge location={r.executionLocation} />,
    },
    {
      key: 'isSyncCapable',
      header: '同期可',
      align: 'center',
      hideable: true,
      width: 80,
      sortable: true,
      sortValue: (r) => (r.isSyncCapable ? 1 : 0),
      render: (r) => <FlagBadge on={r.isSyncCapable} label="可" />,
    },
    {
      key: 'isInspection',
      header: '検査',
      align: 'center',
      hideable: true,
      width: 70,
      sortable: true,
      sortValue: (r) => (r.isInspection ? 1 : 0),
      render: (r) => <FlagBadge on={r.isInspection} label="✓" />,
    },
    {
      key: 'isApprovalStep',
      header: '承認',
      align: 'center',
      hideable: true,
      width: 70,
      sortable: true,
      sortValue: (r) => (r.isApprovalStep ? 1 : 0),
      render: (r) => <FlagBadge on={r.isApprovalStep} label="✓" />,
    },
    {
      key: 'isActive',
      header: '状態',
      sortable: true,
      width: 90,
      sortValue: (r) => (r.isActive ? 1 : 0),
      render: (r) => <ActiveBadge active={r.isActive} />,
    },
  ];

  const renderCard = (r: ProcessStepRow) => (
    <Paper p="sm" withBorder radius="sm">
    <Group justify="space-between" wrap="nowrap" align="flex-start">
      <Stack gap={3} style={{ minWidth: 0 }}>
        <DocNumber c="dimmed">{r.code}</DocNumber>
        <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
        <Group gap={4} mt={2}>
          <CategoryBadge category={r.category} />
          <ExecutionBadge location={r.executionLocation} />
        </Group>
        <Group gap={4} mt={2}>
          {r.isSyncCapable && <Badge size="xs" variant="light" color="green">同期可</Badge>}
          {r.isInspection && <Badge size="xs" variant="light" color="blue">検査</Badge>}
          {r.isApprovalStep && <Badge size="xs" variant="light" color="teal">承認</Badge>}
        </Group>
      </Stack>
      <ActiveBadge active={r.isActive} />
    </Group>
    </Paper>
  );

  return (
    <ListShell
      breadcrumbs={['ホーム', 'マスタ', '工程マスタ']}
      title="工程マスタ"
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
        <>
          <Select
            placeholder="カテゴリ"
            data={CATEGORY_OPTIONS}
            value={categoryFilter}
            onChange={setCategoryFilter}
            clearable
            w={isMobile ? undefined : 160}
            style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="状態"
            data={STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
            clearable
            w={isMobile ? undefined : 160}
            style={isMobile ? { flex: 1 } : undefined}
          />
        </>
      }
    >
      <DataTable
        data={filtered}
        columns={columns}
        getRowId={(r) => String(r.id)}
        onRowClick={() => { /* navigate to detail */ }}
        defaultSort={{ key: 'code', dir: 'asc' }}
        renderCard={renderCard}
        selectable
        bulkActions={[
          { label: '一括有効化', icon: <IconCircleCheck size={16} />, color: 'green', onAction: (rows) => setToggleTarget({ rows, activate: true }) },
          { label: '一括無効化', icon: <IconCircleMinus size={16} />, color: 'gray', onAction: (rows) => setToggleTarget({ rows, activate: false }) },
          { label: '一括削除', icon: <IconTrash size={16} />, color: 'red', onAction: (rows) => setDeleteTarget(rows) },
        ]}
        rowActions={(row) => [
          { label: '編集', icon: <IconEdit size={14} /> },
          { label: '複製', icon: <IconCopy size={14} /> },
          {
            label: row.isActive ? '無効化' : '有効化',
            icon: row.isActive ? <IconCircleMinus size={14} /> : <IconCircleCheck size={14} />,
            onAction: () => setToggleTarget({ rows: [row], activate: !row.isActive }),
          },
          { label: '削除', icon: <IconTrash size={14} />, color: 'red', onAction: () => setDeleteTarget([row]) },
        ]}
        emptyIcon={<IconGitBranch size={24} />}
        emptyMessage="工程がありません"
        emptyAction={<NewButton />}
      />

      <DeleteProcessStepModal
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        names={(deleteTarget ?? []).map((r) => localized(r.name))}
      />
      <ToggleProcessStepActiveModal
        opened={toggleTarget !== null}
        onClose={() => setToggleTarget(null)}
        activate={toggleTarget?.activate ?? true}
        names={(toggleTarget?.rows ?? []).map((r) => localized(r.name))}
      />
    </ListShell>
  );
}
