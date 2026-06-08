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
import { IconCylinder, IconSearch } from '@tabler/icons-react';
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
import { MATERIALS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data ───────────────────────────────────────────────────────────────
interface ProductRow {
  id: string;
  name: LocalizedText;
  materialId: string;
  unit: string;
  isActive: boolean;
}

const MOCK_RECORDS: ProductRow[] = [
  { id: 'PRD-2601-0001', name: { ja: '精密軸', en: 'Precision shaft' }, materialId: 'A01A0001-A001-001', unit: '本', isActive: true },
  { id: 'PRD-2602-0008', name: { ja: 'ロッド', en: 'Rod' }, materialId: 'A02B0014-B001-002', unit: '本', isActive: true },
  { id: 'PRD-2603-0012', name: { ja: '特殊加工品', en: 'Custom machined part' }, materialId: 'B01A0007-A002-001', unit: '本', isActive: true },
  { id: 'PRD-2511-0044', name: { ja: '旧型スリーブ', en: 'Legacy sleeve' }, materialId: 'A01A0001-A001-001', unit: '個', isActive: false },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

export default function ProductListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [materialFilter, setMaterialFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search || r.id.includes(search) || localized(r.name).includes(search);
    const matchesMaterial = !materialFilter || r.materialId === materialFilter;
    const matchesStatus =
      !statusFilter || (statusFilter === 'active' ? r.isActive : !r.isActive);
    return matchesSearch && matchesMaterial && matchesStatus;
  });

  const reset = () => {
    setSearch('');
    setMaterialFilter(null);
    setStatusFilter(null);
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '製品']}
        title="製品"
        actions={<NewButton />}
      />

      <Paper withBorder p="sm">
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="製品コード・名称・仕様で全文検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="素材"
                data={MATERIALS}
                value={materialFilter}
                onChange={setMaterialFilter}
                searchable
                clearable
                style={{ flex: 1 }}
              />
              <Select
                placeholder="状態"
                data={STATUS_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
                clearable
                w={110}
              />
            </Group>
            <Group gap="xs" justify="flex-end">
              <Button variant="subtle" size="sm" onClick={reset}>
                リセット
              </Button>
            </Group>
          </Stack>
        ) : (
          <Group mb="sm" align="flex-end">
            <TextInput
              placeholder="製品コード・名称・仕様で全文検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="素材"
              data={MATERIALS}
              value={materialFilter}
              onChange={setMaterialFilter}
              searchable
              clearable
              w={220}
            />
            <Select
              placeholder="状態"
              data={STATUS_OPTIONS}
              value={statusFilter}
              onChange={setStatusFilter}
              clearable
              w={120}
            />
            <Button variant="subtle" onClick={reset}>
              リセット
            </Button>
          </Group>
        )}

        {filtered.length === 0 ? (
          <EmptyState icon={<IconCylinder size={24} />} message="製品がありません" />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <DocNumber c="dimmed">{r.id}</DocNumber>
                    <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
                    <Group gap="md" mt={2}>
                      <DocNumber c="dimmed">{r.materialId}</DocNumber>
                      <Text size="xs" c="dimmed">{r.unit}</Text>
                    </Group>
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
                <Table.Th>製品コード</Table.Th>
                <Table.Th>名称</Table.Th>
                <Table.Th>素材</Table.Th>
                <Table.Th>単位</Table.Th>
                <Table.Th>状態</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td><DocNumber>{r.id}</DocNumber></Table.Td>
                  <Table.Td>{localized(r.name)}</Table.Td>
                  <Table.Td><DocNumber c="dimmed">{r.materialId}</DocNumber></Table.Td>
                  <Table.Td>{r.unit}</Table.Td>
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
