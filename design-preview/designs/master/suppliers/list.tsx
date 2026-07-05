'use client';

import { useState } from 'react';
import { Badge, Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconBuildingFactory2,
  IconCopy,
  IconCircleCheck,
  IconCircleMinus,
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
import { useIsMobile } from '../../lib/viewport-context';
import { DeleteSupplierModal } from './_modals/delete';
import { ToggleSupplierActiveModal } from './_modals/toggle-active';

// ── Mock data (business_partners + bp_vendor_attrs, VENDOR role) ─────────────
type VendorType = 'SUPPLIER' | 'OUTSOURCE';

interface SupplierRow {
  id: string;
  bpCode: string;
  name: LocalizedText;
  vendorType: VendorType;
  leadTimeDays: number | null;
  isActive: boolean;
}

const VENDOR_TYPE_LABEL: Record<VendorType, string> = {
  SUPPLIER: '仕入先',
  OUTSOURCE: '外注先',
};

const MOCK_RECORDS: SupplierRow[] = [
  {
    id: 'sp-001',
    bpCode: 'BP-00021',
    name: { ja: '外注研磨株式会社', en: 'Gaichu Polishing Co., Ltd.' },
    vendorType: 'OUTSOURCE',
    leadTimeDays: 7,
    isActive: true,
  },
  {
    id: 'sp-002',
    bpCode: 'BP-00022',
    name: { ja: '中央コーティング工業', en: 'Chuo Coating Industries' },
    vendorType: 'OUTSOURCE',
    leadTimeDays: 10,
    isActive: true,
  },
  {
    id: 'sp-003',
    bpCode: 'BP-00023',
    name: { ja: '山陽素材商事', en: 'Sanyo Materials Trading' },
    vendorType: 'SUPPLIER',
    leadTimeDays: 14,
    isActive: true,
  },
  {
    id: 'sp-004',
    bpCode: 'BP-00024',
    name: { ja: '関西熱処理サービス', en: 'Kansai Heat Treatment Service' },
    vendorType: 'OUTSOURCE',
    leadTimeDays: null,
    isActive: false,
  },
];

const VENDOR_TYPE_OPTIONS = [
  { value: 'SUPPLIER', label: '仕入先' },
  { value: 'OUTSOURCE', label: '外注先' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

function VendorTypeBadge({ type }: { type: VendorType }) {
  return (
    <Badge variant="light" color={type === 'OUTSOURCE' ? 'orange' : 'teal'}>
      {VENDOR_TYPE_LABEL[type]}
    </Badge>
  );
}

function leadTimeText(days: number | null): string {
  return days == null ? '—' : `${days} 日`;
}

export default function SuppliersListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Modal state — controlled per design.md §16.2.
  const [deleteTarget, setDeleteTarget] = useState<SupplierRow[] | null>(null);
  const [toggleTarget, setToggleTarget] = useState<{ rows: SupplierRow[]; activate: boolean } | null>(null);

  const reset = () => {
    setSearch('');
    setTypeFilter(null);
    setStatusFilter(null);
  };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search || r.bpCode.includes(search) || localized(r.name).includes(search);
    const matchesType = !typeFilter || r.vendorType === typeFilter;
    const matchesStatus =
      !statusFilter || (statusFilter === 'active' ? r.isActive : !r.isActive);
    return matchesSearch && matchesType && matchesStatus;
  });

  const columns: Column<SupplierRow>[] = [
    {
      key: 'bpCode',
      header: 'BPコード',
      sortable: true,
      width: 120,
      render: (r) => <DocNumber>{r.bpCode}</DocNumber>,
    },
    {
      key: 'name',
      header: '名称',
      sortable: true,
      sortValue: (r) => localized(r.name),
      render: (r) => <Text size="sm">{localized(r.name)}</Text>,
    },
    {
      key: 'vendorType',
      header: '外注種別',
      sortable: true,
      hideable: true,
      width: 110,
      sortValue: (r) => VENDOR_TYPE_LABEL[r.vendorType],
      render: (r) => <VendorTypeBadge type={r.vendorType} />,
    },
    {
      key: 'leadTimeDays',
      header: '標準リードタイム',
      sortable: true,
      hideable: true,
      width: 150,
      align: 'right',
      sortValue: (r) => r.leadTimeDays ?? -1,
      render: (r) => <Text size="sm">{leadTimeText(r.leadTimeDays)}</Text>,
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

  const renderCard = (r: SupplierRow) => (
    <Paper p="sm" withBorder radius="sm">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={3} style={{ minWidth: 0 }}>
          <DocNumber c="dimmed">{r.bpCode}</DocNumber>
          <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
          <Text size="xs" c="dimmed">標準リードタイム {leadTimeText(r.leadTimeDays)}</Text>
        </Stack>
        <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
          <VendorTypeBadge type={r.vendorType} />
          <ActiveBadge active={r.isActive} />
        </Stack>
      </Group>
    </Paper>
  );

  return (
    <ListShell
      breadcrumbs={['ホーム', 'マスタ', '外注企業']}
      title="外注企業"
      action={<NewButton />}
      onReset={reset}
      search={
        <TextInput
          placeholder="BPコード・名称で検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <>
          <Select
            placeholder="外注種別"
            data={VENDOR_TYPE_OPTIONS}
            value={typeFilter}
            onChange={setTypeFilter}
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
        getRowId={(r) => r.id}
        onRowClick={() => { /* navigate to detail */ }}
        renderCard={renderCard}
        defaultSort={{ key: 'bpCode', dir: 'asc' }}
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
        emptyIcon={<IconBuildingFactory2 size={24} />}
        emptyMessage="外注企業がありません"
        emptyAction={<NewButton />}
      />

      <DeleteSupplierModal
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        names={(deleteTarget ?? []).map((r) => localized(r.name))}
      />
      <ToggleSupplierActiveModal
        opened={toggleTarget !== null}
        onClose={() => setToggleTarget(null)}
        activate={toggleTarget?.activate ?? true}
        names={(toggleTarget?.rows ?? []).map((r) => localized(r.name))}
      />
    </ListShell>
  );
}
