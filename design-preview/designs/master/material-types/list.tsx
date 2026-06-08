'use client';

import {
  Button,
  Center,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconAtom, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import {
  ActiveBadge,
  DocNumber,
  EmptyState,
  formatDate,
  localized,
  NewButton,
  PageHeader,
  type LocalizedText,
} from '../../lib/ui';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data ───────────────────────────────────────────────────────────────
interface MaterialTypeRow {
  id: string;
  name: LocalizedText;
  isActive: boolean;
  updatedAt: string;
}

const MOCK_RECORDS: MaterialTypeRow[] = [
  { id: 'A01A0001', name: { ja: 'SUS303', en: 'SUS303' }, isActive: true, updatedAt: '2026-05-12 10:30' },
  { id: 'A02B0014', name: { ja: 'SKD11', en: 'SKD11' }, isActive: true, updatedAt: '2026-04-28 14:05' },
  { id: 'B01A0007', name: { ja: 'S45C 炭素鋼', en: 'S45C' }, isActive: true, updatedAt: '2026-03-19 09:11' },
  { id: 'C03A0002', name: { ja: 'A5052 アルミ合金', en: 'A5052' }, isActive: false, updatedAt: '2025-12-02 16:42' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

export default function MaterialTypeListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search || r.id.includes(search) || localized(r.name).includes(search);
    const matchesStatus =
      !statusFilter ||
      (statusFilter === 'active' ? r.isActive : !r.isActive);
    return matchesSearch && matchesStatus;
  });

  const reset = () => {
    setSearch('');
    setStatusFilter(null);
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '材種']}
        title="材種"
        actions={<NewButton />}
      />

      <Paper withBorder p="sm">
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="材種コード・名称で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="状態"
                data={STATUS_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
                clearable
                style={{ flex: 1 }}
              />
              <Button variant="subtle" size="sm" onClick={reset}>
                リセット
              </Button>
            </Group>
          </Stack>
        ) : (
          <Group mb="sm" align="flex-end">
            <TextInput
              placeholder="材種コード・名称で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="状態"
              data={STATUS_OPTIONS}
              value={statusFilter}
              onChange={setStatusFilter}
              clearable
              w={160}
            />
            <Button variant="subtle" onClick={reset}>
              リセット
            </Button>
          </Group>
        )}

        {filtered.length === 0 ? (
          <EmptyState icon={<IconAtom size={24} />} message="材種がありません" />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <DocNumber c="dimmed">{r.id}</DocNumber>
                    <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
                    <Text size="xs" c="dimmed">更新: {formatDate(r.updatedAt)}</Text>
                  </Stack>
                  <ActiveBadge active={r.isActive} />
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>材種コード</Table.Th>
                <Table.Th>名称</Table.Th>
                <Table.Th>状態</Table.Th>
                <Table.Th>更新日</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td><DocNumber>{r.id}</DocNumber></Table.Td>
                  <Table.Td>{localized(r.name)}</Table.Td>
                  <Table.Td><ActiveBadge active={r.isActive} /></Table.Td>
                  <Table.Td>{formatDate(r.updatedAt)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
