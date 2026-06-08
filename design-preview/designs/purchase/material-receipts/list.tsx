'use client';

import {
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Button,
} from '@mantine/core';
import { IconPackageImport, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import {
  EmptyState,
  formatDate,
  NewButton,
  PageHeader,
} from '../../lib/ui';
import { SUPPLIERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data ───────────────────────────────────────────────────────────────
interface MaterialReceiptRow {
  id: string;
  materialCode: string;
  materialName: string;
  supplierName: string;
  quantity: number;
  unit: string;
  receivedAt: string;
}

const MOCK_RECORDS: MaterialReceiptRow[] = [
  {
    id: '1',
    materialCode: 'A01A0001-A001-001',
    materialName: 'SUS303 φ20×3000（研磨）',
    supplierName: '山陽素材商事',
    quantity: 100,
    unit: '本',
    receivedAt: '2026-05-28',
  },
  {
    id: '2',
    materialCode: 'A02B0014-B001-002',
    materialName: 'SKD11 φ32×2500（定尺）',
    supplierName: '山陽素材商事',
    quantity: 48,
    unit: '本',
    receivedAt: '2026-05-22',
  },
  {
    id: '3',
    materialCode: 'A01A0001-C001-003',
    materialName: 'リブ母材（半製品）',
    supplierName: '中央コーティング工業',
    quantity: 18,
    unit: '本',
    receivedAt: '2026-05-30',
  },
  {
    id: '4',
    materialCode: 'B01A0007-A002-001',
    materialName: 'S45C φ16×4000（研磨）',
    supplierName: '山陽素材商事',
    quantity: 12.5,
    unit: '本',
    receivedAt: '2026-06-01',
  },
];

export default function MaterialReceiptsListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [materialFilter, setMaterialFilter] = useState<string | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.materialCode.includes(search) ||
      r.materialName.includes(search) ||
      r.supplierName.includes(search);
    const matchesMaterial = !materialFilter || r.materialCode === materialFilter;
    const matchesSupplier = !supplierFilter || r.supplierName === supplierFilter;
    return matchesSearch && matchesMaterial && matchesSupplier;
  });

  const reset = () => {
    setSearch('');
    setMaterialFilter(null);
    setSupplierFilter(null);
  };

  const materialOptions = MOCK_RECORDS.map((r) => ({
    value: r.materialCode,
    label: `${r.materialCode} — ${r.materialName}`,
  }));
  const supplierOptions = SUPPLIERS.map((s) => ({ value: s.label, label: s.label }));

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '購買', '素材入荷']}
        title="素材入荷"
        actions={<NewButton label="素材入荷登録" />}
      />

      <Paper withBorder p="sm">
        {/* Filter bar */}
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="素材・仕入先で検索"
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
                placeholder="仕入先"
                data={supplierOptions}
                value={supplierFilter}
                onChange={setSupplierFilter}
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
              placeholder="素材・仕入先で検索"
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
              placeholder="仕入先"
              data={supplierOptions}
              value={supplierFilter}
              onChange={setSupplierFilter}
              searchable
              clearable
              w={200}
            />
            <Button variant="subtle" onClick={reset}>
              リセット
            </Button>
          </Group>
        )}

        {/* Records */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconPackageImport size={24} />}
            message="素材入荷がありません"
            action={
              <Button variant="subtle" size="sm">
                素材入荷登録
              </Button>
            }
          />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <Text size="xs" ff="mono" c="dimmed">
                      {r.materialCode}
                    </Text>
                    <Text size="sm" fw={600} truncate>
                      {r.materialName}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {r.supplierName}
                    </Text>
                    <Text size="xs" c="dimmed" mt={2}>
                      {r.quantity} {r.unit}
                    </Text>
                  </Stack>
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                    {formatDate(r.receivedAt)}
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
                <Table.Th>仕入先</Table.Th>
                <Table.Th ta="right">数量</Table.Th>
                <Table.Th>入荷日</Table.Th>
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
                      <Text size="sm">{r.materialName}</Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>{r.supplierName}</Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" ta="right">
                      {r.quantity} {r.unit}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(r.receivedAt)}</Text>
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
