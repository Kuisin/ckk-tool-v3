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
import { IconBuilding, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import {
  ActiveBadge,
  DocNumber,
  EmptyState,
  formatDate,
  localized,
  type LocalizedText,
  NewButton,
  PageHeader,
} from '../../lib/ui';
import { useIsMobile } from '../../lib/viewport-context';

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
  {
    id: 'bp-001',
    bpCode: 'BP-00001',
    name: { ja: '株式会社ABC製作所', en: 'ABC Manufacturing Co., Ltd.' },
    branchCount: 2,
    isActive: true,
    updatedAt: '2026-05-28 14:30',
  },
  {
    id: 'bp-002',
    bpCode: 'BP-00002',
    name: { ja: '合同会社XYZ工業', en: 'XYZ Industries LLC' },
    branchCount: 0,
    isActive: true,
    updatedAt: '2026-05-22 09:10',
  },
  {
    id: 'bp-003',
    bpCode: 'BP-00003',
    name: { ja: '株式会社DEFエンジニアリング', en: 'DEF Engineering Inc.' },
    branchCount: 1,
    isActive: true,
    updatedAt: '2026-04-15 16:45',
  },
  {
    id: 'bp-004',
    bpCode: 'BP-00004',
    name: { ja: '東邦精密株式会社', en: 'Toho Precision Co., Ltd.' },
    branchCount: 1,
    isActive: false,
    updatedAt: '2026-03-02 11:20',
  },
];

// ── Mobile card list ─────────────────────────────────────────────────────────
function MobileCardList({ records }: { records: CustomerRow[] }) {
  if (records.length === 0) {
    return <EmptyState icon={<IconBuilding size={24} />} message="顧客がありません" />;
  }
  return (
    <Stack gap="xs">
      {records.map((r) => (
        <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
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
      ))}
    </Stack>
  );
}

// ── Desktop table ────────────────────────────────────────────────────────────
function DesktopTable({ records }: { records: CustomerRow[] }) {
  if (records.length === 0) {
    return <EmptyState icon={<IconBuilding size={24} />} message="顧客がありません" />;
  }
  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={{ width: 120 }}>コード</Table.Th>
          <Table.Th>名称</Table.Th>
          <Table.Th style={{ width: 90 }} ta="right">支店数</Table.Th>
          <Table.Th style={{ width: 90 }}>状態</Table.Th>
          <Table.Th style={{ width: 150 }}>更新日</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {records.map((r) => (
          <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
            <Table.Td><DocNumber>{r.bpCode}</DocNumber></Table.Td>
            <Table.Td><Text size="sm">{localized(r.name)}</Text></Table.Td>
            <Table.Td ta="right"><Text size="sm">{r.branchCount}</Text></Table.Td>
            <Table.Td><ActiveBadge active={r.isActive} /></Table.Td>
            <Table.Td><Text size="sm" c="dimmed">{formatDate(r.updatedAt)}</Text></Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function CustomersListPage() {
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
        breadcrumbs={['ホーム', 'マスタ', '顧客']}
        title="顧客"
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
