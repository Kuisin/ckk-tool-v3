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
import { IconAdjustments, IconBoxSeam, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import {
  DocNumber,
  EmptyState,
  formatDate,
  PageHeader,
} from '../../../lib/ui';
import { PRODUCTS } from '../../../lib/mock';
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
interface ProductInventoryRow {
  id: string;
  productName: string;
  lotNumber: number;
  quantity: number;
  reserved: number;
  location: string;
  updatedAt: string;
}

const MOCK_RECORDS: ProductInventoryRow[] = [
  {
    id: '1',
    productName: '精密軸 PRD-2601-0001',
    lotNumber: 1042,
    quantity: 50,
    reserved: 20,
    location: 'A-12-3',
    updatedAt: '2026-05-28',
  },
  {
    id: '2',
    productName: 'ロッド PRD-2602-0008',
    lotNumber: 1038,
    quantity: 12,
    reserved: 0,
    location: 'A-08-1',
    updatedAt: '2026-05-25',
  },
  {
    id: '3',
    productName: '特殊加工品 PRD-2603-0012',
    lotNumber: 1051,
    quantity: 8,
    reserved: 8,
    location: 'B-02-4',
    updatedAt: '2026-06-01',
  },
  {
    id: '4',
    productName: '精密軸 PRD-2601-0001',
    lotNumber: 1029,
    quantity: 120,
    reserved: 40,
    location: 'A-12-1',
    updatedAt: '2026-05-12',
  },
];

export default function ProductInventoryListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.productName.includes(search) ||
      String(r.lotNumber).includes(search);
    const matchesProduct = !productFilter || r.productName.includes(productFilter);
    const matchesLocation = !locationFilter || r.location.startsWith(locationFilter);
    return matchesSearch && matchesProduct && matchesLocation;
  });

  const reset = () => {
    setSearch('');
    setProductFilter(null);
    setLocationFilter(null);
  };

  const productOptions = PRODUCTS.map((p) => ({ value: p.label, label: p.label }));
  const locationOptions = [
    { value: 'A', label: 'A棟' },
    { value: 'B', label: 'B棟' },
  ];

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '生産', '製品在庫']}
        title="製品在庫"
        actions={
          <Button
            variant="default"
            leftSection={<IconAdjustments size={16} />}
            size={isMobile ? 'sm' : 'md'}
            style={{ flexShrink: 0 }}
          >
            {isMobile ? '棚卸' : '棚卸調整'}
          </Button>
        }
      />

      <Paper withBorder p="sm">
        {/* Filter bar */}
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="製品・ロット番号で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="製品"
                data={productOptions}
                value={productFilter}
                onChange={setProductFilter}
                searchable
                clearable
                style={{ flex: 1 }}
              />
              <Select
                placeholder="ロケーション"
                data={locationOptions}
                value={locationFilter}
                onChange={setLocationFilter}
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
              placeholder="製品・ロット番号で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="製品"
              data={productOptions}
              value={productFilter}
              onChange={setProductFilter}
              searchable
              clearable
              w={200}
            />
            <Select
              placeholder="ロケーション"
              data={locationOptions}
              value={locationFilter}
              onChange={setLocationFilter}
              clearable
              w={140}
            />
            <Button variant="subtle" onClick={reset}>
              リセット
            </Button>
          </Group>
        )}

        {/* Records */}
        {filtered.length === 0 ? (
          <EmptyState icon={<IconBoxSeam size={24} />} message="製品在庫がありません" />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <DocNumber c="dimmed">ロット #{r.lotNumber}</DocNumber>
                    <Text size="sm" fw={600} truncate>
                      {r.productName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      ロケーション: {r.location}
                    </Text>
                    <Group gap="md" mt={2}>
                      <InventoryBadge available={r.quantity} reserved={r.reserved} unit="本" />
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
                <Table.Th>製品</Table.Th>
                <Table.Th>ロット番号</Table.Th>
                <Table.Th>在庫数</Table.Th>
                <Table.Th>ロケーション</Table.Th>
                <Table.Th>更新日</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td>{r.productName}</Table.Td>
                  <Table.Td>
                    <DocNumber>#{r.lotNumber}</DocNumber>
                  </Table.Td>
                  <Table.Td>
                    <InventoryBadge available={r.quantity} reserved={r.reserved} unit="本" />
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
