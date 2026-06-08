'use client';

import { useState } from 'react';
import { Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconCircleCheck,
  IconCircleMinus,
  IconEdit,
  IconSearch,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  localized,
  type LocalizedText,
  NewButton,
} from '../../lib/ui';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { useIsMobile } from '../../lib/viewport-context';
import { ToggleActiveModal } from './_modals/toggle-active';
import { DeleteEndUserModal } from './_modals/delete';

// ── Mock data (business_partners + bp_end_user_attrs, END_USER role) ─────────
interface EndUserRow {
  id: string;
  bpCode: string;
  name: LocalizedText;
  industry: string;
  isActive: boolean;
}

const MOCK_RECORDS: EndUserRow[] = [
  { id: 'eu-001', bpCode: 'BP-00101', name: { ja: '日本重工業株式会社', en: 'Nihon Heavy Industries Co., Ltd.' }, industry: '産業機械', isActive: true },
  { id: 'eu-002', bpCode: 'BP-00102', name: { ja: '関西自動車部品株式会社', en: 'Kansai Auto Parts Co., Ltd.' }, industry: '自動車部品', isActive: true },
  { id: 'eu-003', bpCode: 'BP-00103', name: { ja: '東日本航空機工業株式会社', en: 'East Japan Aircraft Industries' }, industry: '航空宇宙', isActive: false },
];

const INDUSTRY_OPTIONS = Array.from(new Set(MOCK_RECORDS.map((r) => r.industry))).map((v) => ({ value: v, label: v }));

export default function EndUsersListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [industry, setIndustry] = useState<string | null>(null);

  const [toggle, setToggle] = useState<{ targets: string[]; next: boolean } | null>(null);
  const [del, setDel] = useState<string[] | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch = !search || r.bpCode.includes(search) || localized(r.name).includes(search);
    const matchesActive = !activeFilter || (activeFilter === 'active' ? r.isActive : !r.isActive);
    const matchesIndustry = !industry || r.industry === industry;
    return matchesSearch && matchesActive && matchesIndustry;
  });

  const reset = () => { setSearch(''); setActiveFilter(null); setIndustry(null); };

  const columns: Column<EndUserRow>[] = [
    { key: 'bpCode', header: 'BPコード', sortable: true, width: 130, render: (r) => <DocNumber>{r.bpCode}</DocNumber> },
    { key: 'name', header: '名称', sortable: true, sortValue: (r) => localized(r.name), render: (r) => localized(r.name) },
    { key: 'industry', header: '業種', sortable: true, hideable: true, width: 160, render: (r) => r.industry },
    { key: 'isActive', header: '状態', sortable: true, width: 100, sortValue: (r) => (r.isActive ? 1 : 0), render: (r) => <ActiveBadge active={r.isActive} /> },
  ];

  const renderCard = (r: EndUserRow) => (
    <Paper p="sm" withBorder radius="sm">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={3} style={{ minWidth: 0 }}>
          <DocNumber c="dimmed">{r.bpCode}</DocNumber>
          <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
          <Text size="xs" c="dimmed">{r.industry}</Text>
        </Stack>
        <ActiveBadge active={r.isActive} />
      </Group>
    </Paper>
  );

  return (
    <ListShell
      breadcrumbs={['ホーム', 'マスタ', '最終需要家']}
      title="最終需要家"
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
            placeholder="業種" data={INDUSTRY_OPTIONS} value={industry} onChange={setIndustry}
            clearable searchable w={isMobile ? undefined : 160} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="状態"
            data={[{ value: 'active', label: '有効' }, { value: 'inactive', label: '無効' }]}
            value={activeFilter} onChange={setActiveFilter} clearable
            w={isMobile ? undefined : 140} style={isMobile ? { flex: 1 } : undefined}
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
          { label: '一括有効化', icon: <IconCircleCheck size={16} />, color: 'green', onAction: (rows) => setToggle({ targets: rows.map((r) => r.id), next: true }) },
          { label: '一括無効化', icon: <IconCircleMinus size={16} />, color: 'gray', onAction: (rows) => setToggle({ targets: rows.map((r) => r.id), next: false }) },
          { label: '一括削除', icon: <IconTrash size={16} />, color: 'red', onAction: (rows) => setDel(rows.map((r) => r.id)) },
        ]}
        rowActions={(row) => [
          { label: '編集', icon: <IconEdit size={14} /> },
          { label: row.isActive ? '無効化' : '有効化', icon: row.isActive ? <IconCircleMinus size={14} /> : <IconCircleCheck size={14} />, onAction: () => setToggle({ targets: [row.id], next: !row.isActive }) },
          { label: '削除', icon: <IconTrash size={14} />, color: 'red', onAction: () => setDel([row.id]) },
        ]}
        emptyIcon={<IconUsers size={24} />}
        emptyMessage="最終需要家がありません"
        emptyAction={<NewButton />}
      />

      <ToggleActiveModal
        opened={!!toggle}
        onClose={() => setToggle(null)}
        count={toggle?.targets.length ?? 0}
        next={toggle?.next ?? true}
      />
      <DeleteEndUserModal
        opened={!!del}
        onClose={() => setDel(null)}
        count={del?.length ?? 0}
      />
    </ListShell>
  );
}
