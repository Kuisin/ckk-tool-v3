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
import { IconAlertTriangle, IconSearch } from '@tabler/icons-react';
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

// ── Mock data ───────────────────────────────────────────────────────────────
interface DefectTypeRow {
  id: number;
  code: string;
  name: LocalizedText;
  sortOrder: number;
  isActive: boolean;
}

const MOCK_RECORDS: DefectTypeRow[] = [
  { id: 1, code: 'DIM', name: { ja: '寸法不良', en: 'Dimensional Defect' }, sortOrder: 1, isActive: true },
  { id: 2, code: 'SCRATCH', name: { ja: 'キズ', en: 'Scratch' }, sortOrder: 2, isActive: true },
  { id: 3, code: 'CRACK', name: { ja: 'クラック', en: 'Crack' }, sortOrder: 3, isActive: true },
  { id: 4, code: 'COATING', name: { ja: 'コーティング不良', en: 'Coating Defect' }, sortOrder: 4, isActive: true },
  { id: 5, code: 'RUST', name: { ja: '錆', en: 'Rust' }, sortOrder: 5, isActive: false },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

export default function DefectTypeListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

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

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '不良種類']}
        title="不良種類"
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
              placeholder="コード・名称で検索"
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
          <EmptyState icon={<IconAlertTriangle size={24} />} message="不良種類がありません" />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <DocNumber c="dimmed">{r.code}</DocNumber>
                    <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
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
                <Table.Th>コード</Table.Th>
                <Table.Th>名称</Table.Th>
                <Table.Th>状態</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td><DocNumber>{r.code}</DocNumber></Table.Td>
                  <Table.Td>{localized(r.name)}</Table.Td>
                  <Table.Td><ActiveBadge active={r.isActive} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
