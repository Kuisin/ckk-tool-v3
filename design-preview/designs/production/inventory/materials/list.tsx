'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconAdjustments,
  IconBookmark,
  IconBookmarkOff,
  IconSearch,
  IconStack2,
} from '@tabler/icons-react';
import { formatDate } from '../../../lib/ui';
import { DataTable, type Column } from '../../../lib/data-table';
import { ListShell } from '../../../lib/shells';
import { MATERIAL_TYPES } from '../../../lib/mock';
import { useIsMobile } from '../../../lib/viewport-context';
import { AdjustMaterialStockModal } from './_modals/adjust-stock';
import { ReserveMaterialModal } from './_modals/reserve';
import { ReleaseMaterialReservationModal } from './_modals/release';

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
  { id: '1', materialCode: 'A01A0001-A001-001', materialName: 'SUS303 φ20×3000（研磨）', materialTypeId: 'A01A0001', quantity: 124.5, reserved: 30, unit: '本', location: 'M-01-2', updatedAt: '2026-05-28' },
  { id: '2', materialCode: 'A02B0014-B001-002', materialName: 'SKD11 φ32×2500（定尺）', materialTypeId: 'A02B0014', quantity: 48, reserved: 0, unit: '本', location: 'M-02-1', updatedAt: '2026-05-22' },
  { id: '3', materialCode: 'B01A0007-A002-001', materialName: 'S45C φ16×4000（研磨）', materialTypeId: 'B01A0007', quantity: 6.25, reserved: 6, unit: '本', location: 'M-01-5', updatedAt: '2026-06-01' },
  { id: '4', materialCode: 'A01A0001-C001-003', materialName: 'リブ母材（半製品・外部調達）', materialTypeId: 'A01A0001', quantity: 18, reserved: 8, unit: '本', location: 'M-03-1', updatedAt: '2026-05-30', isSemiFinished: true },
];

export default function MaterialInventoryListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [materialFilter, setMaterialFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const [adjustTarget, setAdjustTarget] = useState<MaterialInventoryRow | null>(null);
  const [reserveTarget, setReserveTarget] = useState<MaterialInventoryRow | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<MaterialInventoryRow | null>(null);

  const reset = () => {
    setSearch('');
    setMaterialFilter(null);
    setTypeFilter(null);
  };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch = !search || r.materialCode.includes(search) || r.materialName.includes(search);
    const matchesMaterial = !materialFilter || r.materialCode === materialFilter;
    const matchesType = !typeFilter || r.materialTypeId === typeFilter;
    return matchesSearch && matchesMaterial && matchesType;
  });

  const materialOptions = MOCK_RECORDS.map((r) => ({
    value: r.materialCode,
    label: `${r.materialCode} — ${r.materialName}`,
  }));

  const columns: Column<MaterialInventoryRow>[] = [
    {
      key: 'materialName',
      header: '素材',
      sortable: true,
      sortValue: (r) => r.materialCode,
      render: (r) => (
        <Stack gap={2}>
          <Text size="xs" ff="mono" c="dimmed">{r.materialCode}</Text>
          <Group gap="xs">
            <Text size="sm">{r.materialName}</Text>
            {r.isSemiFinished && <Badge size="xs" color="teal" variant="light">半製品</Badge>}
          </Group>
        </Stack>
      ),
    },
    {
      key: 'quantity',
      header: '在庫数',
      sortable: true,
      width: 170,
      sortValue: (r) => r.quantity,
      // inventory list reuses the inline InventoryBadge in this column render
      render: (r) => <InventoryBadge available={r.quantity} reserved={r.reserved} unit={r.unit} />,
    },
    { key: 'unit', header: '単位', sortable: true, hideable: true, width: 80, render: (r) => r.unit },
    { key: 'location', header: 'ロケーション', sortable: true, hideable: true, width: 130, render: (r) => r.location },
    { key: 'updatedAt', header: '更新日', sortable: true, hideable: true, width: 120, render: (r) => formatDate(r.updatedAt) },
  ];

  return (
    <>
      <ListShell
        breadcrumbs={['ホーム', '生産', '素材在庫']}
        title="素材在庫"
        onReset={reset}
        search={
          <TextInput
            placeholder="素材コード・名称で検索"
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        }
        filters={
          <>
            <Select
              placeholder="素材" data={materialOptions} value={materialFilter} onChange={setMaterialFilter}
              searchable clearable w={isMobile ? undefined : 240} style={isMobile ? { flex: 1 } : undefined}
            />
            <Select
              placeholder="材種" data={MATERIAL_TYPES} value={typeFilter} onChange={setTypeFilter}
              searchable clearable w={isMobile ? undefined : 180} style={isMobile ? { flex: 1 } : undefined}
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
          emptyIcon={<IconStack2 size={24} />}
          emptyMessage="素材在庫がありません"
        />
      </ListShell>

      <AdjustMaterialStockModal
        opened={!!adjustTarget}
        onClose={() => setAdjustTarget(null)}
        label={adjustTarget ? `${adjustTarget.materialName}（${adjustTarget.materialCode}）` : ''}
        unit={adjustTarget?.unit ?? '本'}
      />
      <ReserveMaterialModal
        opened={!!reserveTarget}
        onClose={() => setReserveTarget(null)}
        label={reserveTarget ? `${reserveTarget.materialName}（${reserveTarget.materialCode}）` : ''}
        available={reserveTarget ? reserveTarget.quantity - reserveTarget.reserved : 0}
        unit={reserveTarget?.unit ?? '本'}
      />
      <ReleaseMaterialReservationModal
        opened={!!releaseTarget}
        onClose={() => setReleaseTarget(null)}
        label={releaseTarget ? `${releaseTarget.materialName}（${releaseTarget.materialCode}）` : ''}
        reserved={releaseTarget?.reserved ?? 0}
        unit={releaseTarget?.unit ?? '本'}
      />
    </>
  );
}
