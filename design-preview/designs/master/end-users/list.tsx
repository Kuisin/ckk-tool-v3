'use client';

import {
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconSearch, IconUsers } from '@tabler/icons-react';
import { useState } from 'react';
import {
  ActiveBadge,
  DocNumber,
  EmptyState,
  localized,
  type LocalizedText,
  NewButton,
  PageHeader,
} from '../../lib/ui';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data (business_partners + bp_end_user_attrs, END_USER role) ─────────
interface EndUserRow {
  id: string;
  bpCode: string;
  name: LocalizedText;
  industry: string;
  isActive: boolean;
}

const MOCK_RECORDS: EndUserRow[] = [
  {
    id: 'eu-001',
    bpCode: 'BP-00101',
    name: { ja: '日本重工業株式会社', en: 'Nihon Heavy Industries Co., Ltd.' },
    industry: '産業機械',
    isActive: true,
  },
  {
    id: 'eu-002',
    bpCode: 'BP-00102',
    name: { ja: '関西自動車部品株式会社', en: 'Kansai Auto Parts Co., Ltd.' },
    industry: '自動車部品',
    isActive: true,
  },
  {
    id: 'eu-003',
    bpCode: 'BP-00103',
    name: { ja: '東日本航空機工業株式会社', en: 'East Japan Aircraft Industries' },
    industry: '航空宇宙',
    isActive: false,
  },
];

// ── Mobile card list ─────────────────────────────────────────────────────────
function MobileCardList({ records }: { records: EndUserRow[] }) {
  if (records.length === 0) {
    return <EmptyState icon={<IconUsers size={24} />} message="最終需要家がありません" />;
  }
  return (
    <Stack gap="xs">
      {records.map((r) => (
        <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={3} style={{ minWidth: 0 }}>
              <DocNumber c="dimmed">{r.bpCode}</DocNumber>
              <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
              <Text size="xs" c="dimmed">{r.industry}</Text>
            </Stack>
            <ActiveBadge active={r.isActive} />
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

// ── Desktop table ────────────────────────────────────────────────────────────
function DesktopTable({ records }: { records: EndUserRow[] }) {
  if (records.length === 0) {
    return <EmptyState icon={<IconUsers size={24} />} message="最終需要家がありません" />;
  }
  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={{ width: 120 }}>コード</Table.Th>
          <Table.Th>名称</Table.Th>
          <Table.Th style={{ width: 160 }}>業種</Table.Th>
          <Table.Th style={{ width: 90 }}>状態</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {records.map((r) => (
          <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
            <Table.Td><DocNumber>{r.bpCode}</DocNumber></Table.Td>
            <Table.Td><Text size="sm">{localized(r.name)}</Text></Table.Td>
            <Table.Td><Text size="sm" c="dimmed">{r.industry}</Text></Table.Td>
            <Table.Td><ActiveBadge active={r.isActive} /></Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function EndUsersListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search || r.bpCode.includes(search) || localized(r.name).includes(search);
    const matchesActive =
      !activeFilter || (activeFilter === 'active' ? r.isActive : !r.isActive);
    return matchesSearch && matchesActive;
  });

  const reset = () => {
    setSearch('');
    setActiveFilter(null);
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '最終需要家']}
        title="最終需要家"
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
                placeholder="状態"
                data={[
                  { value: 'active', label: '有効' },
                  { value: 'inactive', label: '無効' },
                ]}
                value={activeFilter}
                onChange={setActiveFilter}
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
              placeholder="状態"
              data={[
                { value: 'active', label: '有効' },
                { value: 'inactive', label: '無効' },
              ]}
              value={activeFilter}
              onChange={setActiveFilter}
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
