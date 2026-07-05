'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconAdjustments,
  IconBookmark,
  IconBoxSeam,
  IconBookmarkOff,
  IconSearch,
} from '@tabler/icons-react';
import { DocNumber, formatDate, PageHeader } from '../../../lib/ui';
import { DataTable, type Column } from '../../../lib/data-table';
import { ListShell } from '../../../lib/shells';
import { PRODUCTS } from '../../../lib/mock';
import { useIsMobile } from '../../../lib/viewport-context';
import { AdjustProductStockModal } from './_modals/adjust-stock';
import { ReserveProductModal } from './_modals/reserve';
import { ReleaseProductReservationModal } from './_modals/release';

// ── InventoryBadge (design.md §12.7) — kept inline per domain requirement ──────
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
  { id: '1', productName: '精密軸 PRD-202601-0001', lotNumber: 1042, quantity: 50, reserved: 20, location: 'A-12-3', updatedAt: '2026-05-28' },
  { id: '2', productName: 'ロッド PRD-202602-0008', lotNumber: 1038, quantity: 12, reserved: 0, location: 'A-08-1', updatedAt: '2026-05-25' },
  { id: '3', productName: '特殊加工品 PRD-202603-0012', lotNumber: 1051, quantity: 8, reserved: 8, location: 'B-02-4', updatedAt: '2026-06-01' },
  { id: '4', productName: '精密軸 PRD-202601-0001', lotNumber: 1029, quantity: 120, reserved: 40, location: 'A-12-1', updatedAt: '2026-05-12' },
];

export default function ProductInventoryListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);

  // Modal state (each carries the active row's display label).
  const [adjustTarget, setAdjustTarget] = useState<ProductInventoryRow | null>(null);
  const [reserveTarget, setReserveTarget] = useState<ProductInventoryRow | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<ProductInventoryRow | null>(null);

  const reset = () => {
    setSearch('');
    setProductFilter(null);
    setLocationFilter(null);
  };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search || r.productName.includes(search) || String(r.lotNumber).includes(search);
    const matchesProduct = !productFilter || r.productName.includes(productFilter);
    const matchesLocation = !locationFilter || r.location.startsWith(locationFilter);
    return matchesSearch && matchesProduct && matchesLocation;
  });

  const productOptions = PRODUCTS.map((p) => ({ value: p.label, label: p.label }));
  const locationOptions = [
    { value: 'A', label: 'A棟' },
    { value: 'B', label: 'B棟' },
  ];

  const columns: Column<ProductInventoryRow>[] = [
    { key: 'productName', header: '製品', sortable: true, render: (r) => r.productName },
    { key: 'lotNumber', header: 'ロット番号', sortable: true, width: 130, sortValue: (r) => r.lotNumber, render: (r) => <DocNumber>#{r.lotNumber}</DocNumber> },
    {
      key: 'quantity',
      header: '在庫数',
      sortable: true,
      width: 170,
      sortValue: (r) => r.quantity,
      // inventory list reuses the inline InventoryBadge in this column render
      render: (r) => <InventoryBadge available={r.quantity} reserved={r.reserved} unit="本" />,
    },
    { key: 'location', header: 'ロケーション', sortable: true, hideable: true, width: 130, render: (r) => r.location },
    { key: 'updatedAt', header: '更新日', sortable: true, hideable: true, width: 120, render: (r) => formatDate(r.updatedAt) },
  ];

  return (
    <>
      <ListShell
        breadcrumbs={['ホーム', '生産', '製品在庫']}
        title="製品在庫"
        action={
          <Button
            variant="default"
            leftSection={<IconAdjustments size={16} />}
            size={isMobile ? 'sm' : 'md'}
            style={{ flexShrink: 0 }}
            onClick={() => setAdjustTarget(MOCK_RECORDS[0])}
          >
            {isMobile ? '棚卸' : '棚卸調整'}
          </Button>
        }
        onReset={reset}
        search={
          <TextInput
            placeholder="製品・ロット番号で検索"
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        }
        filters={
          <>
            <Select
              placeholder="製品" data={productOptions} value={productFilter} onChange={setProductFilter}
              searchable clearable w={isMobile ? undefined : 200} style={isMobile ? { flex: 1 } : undefined}
            />
            <Select
              placeholder="ロケーション" data={locationOptions} value={locationFilter} onChange={setLocationFilter}
              clearable w={isMobile ? undefined : 140} style={isMobile ? { flex: 1 } : undefined}
            />
          </>
        }
      >
        <DataTable
          data={filtered}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={() => { /* navigate to detail */ }}
          defaultSort={{ key: 'updatedAt', dir: 'desc' }}
          selectable
          bulkActions={[
            { label: '一括棚卸調整', icon: <IconAdjustments size={16} />, color: 'violet', onAction: (rows) => setAdjustTarget(rows[0]) },
          ]}
          rowActions={(r) => [
            { label: '棚卸調整', icon: <IconAdjustments size={14} />, color: 'violet', onAction: () => setAdjustTarget(r) },
            { label: '引当予約', icon: <IconBookmark size={14} />, onAction: () => setReserveTarget(r) },
            ...(r.reserved > 0
              ? [{ label: '予約解除', icon: <IconBookmarkOff size={14} />, color: 'red', onAction: () => setReleaseTarget(r) }]
              : []),
          ]}
          emptyIcon={<IconBoxSeam size={24} />}
          emptyMessage="製品在庫がありません"
        />
      </ListShell>

      <AdjustProductStockModal
        opened={!!adjustTarget}
        onClose={() => setAdjustTarget(null)}
        label={adjustTarget ? `${adjustTarget.productName}（ロット #${adjustTarget.lotNumber}）` : ''}
        unit="本"
      />
      <ReserveProductModal
        opened={!!reserveTarget}
        onClose={() => setReserveTarget(null)}
        label={reserveTarget ? `${reserveTarget.productName}（ロット #${reserveTarget.lotNumber}）` : ''}
        available={reserveTarget ? reserveTarget.quantity - reserveTarget.reserved : 0}
        unit="本"
      />
      <ReleaseProductReservationModal
        opened={!!releaseTarget}
        onClose={() => setReleaseTarget(null)}
        label={releaseTarget ? `${releaseTarget.productName}（ロット #${releaseTarget.lotNumber}）` : ''}
        reserved={releaseTarget?.reserved ?? 0}
        unit="本"
      />
    </>
  );
}
