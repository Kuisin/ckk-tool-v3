'use client';

import {
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconGitBranch, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import {
  ActiveBadge,
  DocNumber,
  EmptyState,
  localized,
  NewButton,
  PageHeader,
  type LocalizedText,
} from '../../lib/ui';
import { useIsMobile } from '../../lib/viewport-context';

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

/** Small green/gray flag badge for 同期可 / 検査 / 承認 columns. */
function FlagBadge({ on, label }: { on: boolean; label: string }) {
  return (
    <Badge size="xs" variant="light" color={on ? 'green' : 'gray'}>
      {on ? label : '—'}
    </Badge>
  );
}

// ── Mobile card list ─────────────────────────────────────────────────────────
function MobileCardList({ records }: { records: ProcessStepRow[] }) {
  if (records.length === 0) {
    return <EmptyState icon={<IconGitBranch size={24} />} message="工程がありません" />;
  }
  return (
    <Stack gap="xs">
      {records.map((r) => (
        <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={3} style={{ minWidth: 0 }}>
              <DocNumber c="dimmed">{r.code}</DocNumber>
              <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
              <Group gap={4} mt={2}>
                <CategoryBadge category={r.category} />
                <Badge size="xs" variant="outline" color={r.executionLocation === 'INTERNAL_OR_OUTSOURCE' ? 'orange' : 'gray'}>
                  {EXECUTION_LABEL[r.executionLocation]}
                </Badge>
              </Group>
              <Group gap={4} mt={2}>
                {r.isSyncCapable && <FlagBadge on label="同期可" />}
                {r.isInspection && <Badge size="xs" variant="light" color="blue">検査</Badge>}
                {r.isApprovalStep && <Badge size="xs" variant="light" color="teal">承認</Badge>}
              </Group>
            </Stack>
            <ActiveBadge active={r.isActive} />
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

// ── Desktop table ────────────────────────────────────────────────────────────
function DesktopTable({ records }: { records: ProcessStepRow[] }) {
  if (records.length === 0) {
    return <EmptyState icon={<IconGitBranch size={24} />} message="工程がありません" />;
  }
  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={{ width: 220 }}>コード</Table.Th>
          <Table.Th>名称</Table.Th>
          <Table.Th style={{ width: 110 }}>カテゴリ</Table.Th>
          <Table.Th style={{ width: 110 }}>実施場所</Table.Th>
          <Table.Th style={{ width: 80 }} ta="center">同期可</Table.Th>
          <Table.Th style={{ width: 70 }} ta="center">検査</Table.Th>
          <Table.Th style={{ width: 70 }} ta="center">承認</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {records.map((r) => (
          <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
            <Table.Td><DocNumber>{r.code}</DocNumber></Table.Td>
            <Table.Td><Text size="sm">{localized(r.name)}</Text></Table.Td>
            <Table.Td><CategoryBadge category={r.category} /></Table.Td>
            <Table.Td>
              <Badge variant="outline" size="sm" color={r.executionLocation === 'INTERNAL_OR_OUTSOURCE' ? 'orange' : 'gray'}>
                {EXECUTION_LABEL[r.executionLocation]}
              </Badge>
            </Table.Td>
            <Table.Td ta="center"><FlagBadge on={r.isSyncCapable} label="可" /></Table.Td>
            <Table.Td ta="center"><FlagBadge on={r.isInspection} label="✓" /></Table.Td>
            <Table.Td ta="center"><FlagBadge on={r.isApprovalStep} label="✓" /></Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ProcessStepsListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

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

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '工程マスタ']}
        title="工程マスタ"
        actions={<NewButton />}
      />

      <Paper withBorder p="sm">
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="コード・名称で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="カテゴリ"
                data={CATEGORY_OPTIONS}
                value={categoryFilter}
                onChange={setCategoryFilter}
                clearable
                style={{ flex: 1 }}
              />
              <Select
                placeholder="状態"
                data={STATUS_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
                clearable
                style={{ flex: 1 }}
              />
              <Button variant="subtle" size="sm" onClick={reset}>リセット</Button>
            </Group>
          </Stack>
        ) : (
          <Group mb="sm" align="flex-end">
            <TextInput
              placeholder="コード・名称で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="カテゴリ"
              data={CATEGORY_OPTIONS}
              value={categoryFilter}
              onChange={setCategoryFilter}
              clearable
              w={160}
            />
            <Select
              placeholder="状態"
              data={STATUS_OPTIONS}
              value={statusFilter}
              onChange={setStatusFilter}
              clearable
              w={160}
            />
            <Button variant="subtle" onClick={reset}>リセット</Button>
          </Group>
        )}

        {isMobile
          ? <MobileCardList records={filtered} />
          : <DesktopTable records={filtered} />}
      </Paper>
    </Stack>
  );
}
