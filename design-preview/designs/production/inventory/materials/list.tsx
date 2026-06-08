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
  Tooltip,
} from '@mantine/core';
import { IconStack2, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { EmptyState, formatDate, PageHeader } from '../../../lib/ui';
import { MATERIAL_TYPES } from '../../../lib/mock';
import { useIsMobile } from '../../../lib/viewport-context';

// ── InventoryBadge (design.md §12.7) ─────────────────────────────────────────
function InventoryBadge({
  available,
  reserved,
  unit,
}: {
  available: number;
  reserved: number;
  unit: string;
}) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Text size="sm">
        {available} {unit}
      </Text>
      {reserved > 0 && (
        <Tooltip label={`予約中: ${reserved} ${unit}`}>
          <Badge color="orange" variant="light">
            予約 {reserved}
          </Badge>
        </Tooltip>
      )}
    </Group>
  );
}

// ── Mock data ───────────────────────────────────────────────────────────────
interface MaterialInventoryRow {
  id: string;
  materialCode: string;
  materialName: string;
  materialTypeId: string;
  quantity: number;
  reserved: number;
  unit: string;
  location: string;
  updatedAt: string;
  isSemiFinished?: boolean;
}

const MOCK_RECORDS: MaterialInventoryRow[] = [
  {
    id: '1',
    materialCode: 'A01A0001-A001-001',
    materialName: 'SUS303 φ20×3000（研磨）',
    materialTypeId: 'A01A0001',
    quantity: 124.5,
    reserved: 30,
    unit: '本',
    location: 'M-01-2',
    updatedAt: '2026-05-28',
  },
  {
    id: '2',
    materialCode: 'A02B0014-B001-002',
    materialName: 'SKD11 φ32×2500（定尺）',
    materialTypeId: 'A02B0014',
    quantity: 48,
    reserved: 0,
    unit: '本',
    location: 'M-02-1',
    updatedAt: '2026-05-22',
  },
  {
    id: '3',
    materialCode: 'B01A0007-A002-001',
    materialName: 'S45C φ16×4000（研磨）',
    materialTypeId: 'B01A0007',
    quantity: 6.25,
    reserved: 6,
    unit: '本',
    location: 'M-01-5',
    updatedAt: '2026-06-01',
  },
  {
    id: '4',
    materialCode: 'A01A0001-C001-003',
    materialName: 'リブ母材（半製品・外部調達）',
    materialTypeId: 'A01A0001',
    quantity: 18,
    reserved: 8,
    unit: '本',
    location: 'M-03-1',
    updatedAt: '2026-05-30',
    isSemiFinished: true,
  },
];

export default function MaterialInventoryListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [materialFilter, setMaterialFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.materialCode.includes(search) ||
      r.materialName.includes(search);
    const matchesMaterial = !materialFilter || r.materialCode === materialFilter;
    const matchesType = !typeFilter || r.materialTypeId === typeFilter;
    return matchesSearch && matchesMaterial && matchesType;
  });

  const reset = () => {
    setSearch('');
    setMaterialFilter(null);
    setTypeFilter(null);
  };

  const materialOptions = MOCK_RECORDS.map((r) => ({
    value: r.materialCode,
    label: `${r.materialCode} — ${r.materialName}`,
  }));

  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={['ホーム', '生産', '素材在庫']} title="素材在庫" />

      <Paper withBorder p="sm">
        {/* Filter bar */}
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="素材コード・名称で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="素材"
                data={materialOptions}
                value={materialFilter}
                onChange={setMaterialFilter}
                searchable
                clearable
                style={{ flex: 1 }}
              />
              <Select
                placeholder="材種"
                data={MATERIAL_TYPES}
                value={typeFilter}
                onChange={setTypeFilter}
                searchable
                clearable
                style={{ flex: 1 }}
              />
            </Group>
            <Button variant="subtle" size="sm" onClick={reset}>
              リセット
            </Button>
          </Stack>
        ) : (
          <Group mb="sm" align="flex-end">
            <TextInput
              placeholder="素材コード・名称で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="素材"
              data={materialOptions}
              value={materialFilter}
              onChange={setMaterialFilter}
              searchable
              clearable
              w={240}
            />
            <Select
              placeholder="材種"
              data={MATERIAL_TYPES}
              value={typeFilter}
              onChange={setTypeFilter}
              searchable
              clearable
              w={180}
            />
            <Button variant="subtle" onClick={reset}>
              リセット
            </Button>
          </Group>
        )}

        {/* Records */}
        {filtered.length === 0 ? (
          <EmptyState icon={<IconStack2 size={24} />} message="素材在庫がありません" />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <Text size="xs" ff="mono" c="dimmed">
                      {r.materialCode}
                    </Text>
                    <Group gap="xs">
                      <Text size="sm" fw={600} truncate>
                        {r.materialName}
                      </Text>
                      {r.isSemiFinished && (
                        <Badge size="xs" color="teal" variant="light">
                          半製品
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      ロケーション: {r.location}
                    </Text>
                    <Group gap="md" mt={2}>
                      <InventoryBadge available={r.quantity} reserved={r.reserved} unit={r.unit} />
                    </Group>
                  </Stack>
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                    {formatDate(r.updatedAt)}
                  </Text>
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>素材</Table.Th>
                <Table.Th>在庫数</Table.Th>
                <Table.Th>単位</Table.Th>
                <Table.Th>ロケーション</Table.Th>
                <Table.Th>更新日</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text size="xs" ff="mono" c="dimmed">
                        {r.materialCode}
                      </Text>
                      <Group gap="xs">
                        <Text size="sm">{r.materialName}</Text>
                        {r.isSemiFinished && (
                          <Badge size="xs" color="teal" variant="light">
                            半製品
                          </Badge>
                        )}
                      </Group>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <InventoryBadge available={r.quantity} reserved={r.reserved} unit={r.unit} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{r.unit}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{r.location}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(r.updatedAt)}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
