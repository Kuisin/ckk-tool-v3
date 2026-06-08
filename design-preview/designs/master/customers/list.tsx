'use client';

import { useState } from 'react';
import { Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconBuilding,
  IconCircleCheck,
  IconCircleMinus,
  IconEdit,
  IconPlus,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  formatDate,
  localized,
  type LocalizedText,
  NewButton,
} from '../../lib/ui';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { useIsMobile } from '../../lib/viewport-context';
import { ToggleActiveModal } from './_modals/toggle-active';
import { DeleteCustomerModal } from './_modals/delete';

// ── Mock data (business_partners + bp_customer_attrs, CUSTOMER role) ─────────
interface CustomerRow {
  id: string;
  bpCode: string;
  name: LocalizedText;
  branchCount: number;
  isActive: boolean;
  updatedAt: string;
}

const MOCK_RECORDS: CustomerRow[] = [
  { id: 'bp-001', bpCode: 'BP-00001', name: { ja: '株式会社ABC製作所', en: 'ABC Manufacturing Co., Ltd.' }, branchCount: 2, isActive: true, updatedAt: '2026-05-28 14:30' },
  { id: 'bp-002', bpCode: 'BP-00002', name: { ja: '合同会社XYZ工業', en: 'XYZ Industries LLC' }, branchCount: 0, isActive: true, updatedAt: '2026-05-22 09:10' },
  { id: 'bp-003', bpCode: 'BP-00003', name: { ja: '株式会社DEFエンジニアリング', en: 'DEF Engineering Inc.' }, branchCount: 1, isActive: true, updatedAt: '2026-04-15 16:45' },
  { id: 'bp-004', bpCode: 'BP-00004', name: { ja: '東邦精密株式会社', en: 'Toho Precision Co., Ltd.' }, branchCount: 1, isActive: false, updatedAt: '2026-03-02 11:20' },
];

export default function CustomersListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  // Modal state — driven by row / bulk actions.
  const [toggle, setToggle] = useState<{ targets: string[]; next: boolean } | null>(null);
  const [del, setDel] = useState<string[] | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch = !search || r.bpCode.includes(search) || localized(r.name).includes(search);
    const matchesActive = !activeFilter || (activeFilter === 'active' ? r.isActive : !r.isActive);
    return matchesSearch && matchesActive;
  });

  const reset = () => { setSearch(''); setActiveFilter(null); };

  const columns: Column<CustomerRow>[] = [
    { key: 'bpCode', header: 'BPコード', sortable: true, width: 130, render: (r) => <DocNumber>{r.bpCode}</DocNumber> },
    { key: 'name', header: '名称', sortable: true, sortValue: (r) => localized(r.name), render: (r) => localized(r.name) },
    { key: 'branchCount', header: '支店数', sortable: true, hideable: true, width: 90, align: 'right', sortValue: (r) => r.branchCount, render: (r) => `${r.branchCount} 件` },
    { key: 'isActive', header: '状態', sortable: true, width: 100, sortValue: (r) => (r.isActive ? 1 : 0), render: (r) => <ActiveBadge active={r.isActive} /> },
    { key: 'updatedAt', header: '更新日', sortable: true, hideable: true, width: 130, render: (r) => formatDate(r.updatedAt) },
  ];

  const renderCard = (r: CustomerRow) => (
    <Paper p="sm" withBorder radius="sm">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={3} style={{ minWidth: 0 }}>
          <DocNumber c="dimmed">{r.bpCode}</DocNumber>
          <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
          <Text size="xs" c="dimmed">支店 {r.branchCount} 件</Text>
        </Stack>
        <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
          <ActiveBadge active={r.isActive} />
          <Text size="xs" c="dimmed">{formatDate(r.updatedAt)}</Text>
        </Stack>
      </Group>
    </Paper>
  );

  return (
    <ListShell
      breadcrumbs={['ホーム', 'マスタ', '顧客']}
      title="顧客"
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
        <Select
          placeholder="状態"
          data={[{ value: 'active', label: '有効' }, { value: 'inactive', label: '無効' }]}
          value={activeFilter} onChange={setActiveFilter} clearable
          w={isMobile ? undefined : 160} style={isMobile ? { flex: 1 } : undefined}
        />
      }
    >
      <DataTable
        data={filtered}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={() => { /* navigate to detail */ }}
        renderCard={renderCard}
        defaultSort={{ key: 'updatedAt', dir: 'desc' }}
        selectable
        bulkActions={[
          { label: '一括有効化', icon: <IconCircleCheck size={16} />, color: 'green', onAction: (rows) => setToggle({ targets: rows.map((r) => r.id), next: true }) },
          { label: '一括無効化', icon: <IconCircleMinus size={16} />, color: 'gray', onAction: (rows) => setToggle({ targets: rows.map((r) => r.id), next: false }) },
          { label: '一括削除', icon: <IconTrash size={16} />, color: 'red', onAction: (rows) => setDel(rows.map((r) => r.id)) },
        ]}
        rowActions={(row) => [
          { label: '編集', icon: <IconEdit size={14} /> },
          { label: '支店を追加', icon: <IconPlus size={14} /> },
          { label: row.isActive ? '無効化' : '有効化', icon: row.isActive ? <IconCircleMinus size={14} /> : <IconCircleCheck size={14} />, onAction: () => setToggle({ targets: [row.id], next: !row.isActive }) },
          { label: '削除', icon: <IconTrash size={14} />, color: 'red', onAction: () => setDel([row.id]) },
        ]}
        emptyIcon={<IconBuilding size={24} />}
        emptyMessage="顧客がありません"
        emptyAction={<NewButton />}
      />

      <ToggleActiveModal
        opened={!!toggle}
        onClose={() => setToggle(null)}
        count={toggle?.targets.length ?? 0}
        next={toggle?.next ?? true}
      />
      <DeleteCustomerModal
        opened={!!del}
        onClose={() => setDel(null)}
        count={del?.length ?? 0}
      />
    </ListShell>
  );
}
