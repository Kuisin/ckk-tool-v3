'use client';

import { useState } from 'react';
import { Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconBolt,
  IconPackageImport,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { formatDate, NewButton } from '../../lib/ui';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { SUPPLIERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';
import { DeleteMaterialReceiptModal } from './_modals/delete';
import { QuickReceiptModal } from './_modals/quick-receipt';

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
  { id: '1', materialCode: 'A01A0001-A001-001', materialName: 'SUS303 φ20×3000（研磨）', supplierName: '山陽素材商事', quantity: 100, unit: '本', receivedAt: '2026-05-28' },
  { id: '2', materialCode: 'A02B0014-B001-002', materialName: 'SKD11 φ32×2500（定尺）', supplierName: '山陽素材商事', quantity: 48, unit: '本', receivedAt: '2026-05-22' },
  { id: '3', materialCode: 'A01A0001-C001-003', materialName: 'リブ母材（半製品）', supplierName: '中央コーティング工業', quantity: 18, unit: '本', receivedAt: '2026-05-30' },
  { id: '4', materialCode: 'B01A0007-A002-001', materialName: 'S45C φ16×4000（研磨）', supplierName: '山陽素材商事', quantity: 12.5, unit: '本', receivedAt: '2026-06-01' },
];

export default function MaterialReceiptsListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [materialFilter, setMaterialFilter] = useState<string | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);

  const [quickOpen, setQuickOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MaterialReceiptRow | null>(null);

  const reset = () => {
    setSearch('');
    setMaterialFilter(null);
    setSupplierFilter(null);
  };

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

  const materialOptions = MOCK_RECORDS.map((r) => ({
    value: r.materialCode,
    label: `${r.materialCode} — ${r.materialName}`,
  }));
  const supplierOptions = SUPPLIERS.map((s) => ({ value: s.label, label: s.label }));

  const columns: Column<MaterialReceiptRow>[] = [
    {
      key: 'materialName',
      header: '素材',
      sortable: true,
      sortValue: (r) => r.materialCode,
      render: (r) => (
        <Stack gap={2}>
          <Text size="xs" ff="mono" c="dimmed">{r.materialCode}</Text>
          <Text size="sm">{r.materialName}</Text>
        </Stack>
      ),
    },
    { key: 'supplierName', header: '仕入先', sortable: true, render: (r) => r.supplierName },
    { key: 'quantity', header: '数量', sortable: true, align: 'right', width: 120, sortValue: (r) => r.quantity, render: (r) => `${r.quantity} ${r.unit}` },
    { key: 'receivedAt', header: '入荷日', sortable: true, width: 120, render: (r) => formatDate(r.receivedAt) },
  ];

  return (
    <>
      <ListShell
        breadcrumbs={['ホーム', '購買', '素材入荷']}
        title="素材入荷"
        action={<NewButton label="素材入荷登録" />}
        onReset={reset}
        search={
          <TextInput
            placeholder="素材・仕入先で検索"
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
              placeholder="仕入先" data={supplierOptions} value={supplierFilter} onChange={setSupplierFilter}
              searchable clearable w={isMobile ? undefined : 200} style={isMobile ? { flex: 1 } : undefined}
            />
          </>
        }
      >
        <DataTable
          data={filtered}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={() => { /* navigate to detail */ }}
          defaultSort={{ key: 'receivedAt', dir: 'desc' }}
          selectable
          bulkActions={[
            { label: '一括取消', icon: <IconTrash size={16} />, color: 'red', onAction: (rows) => setDeleteTarget(rows[0]) },
          ]}
          rowActions={(r) => [
            { label: 'クイック入荷登録', icon: <IconBolt size={14} />, onAction: () => setQuickOpen(true) },
            { label: '取消', icon: <IconTrash size={14} />, color: 'red', onAction: () => setDeleteTarget(r) },
          ]}
          emptyIcon={<IconPackageImport size={24} />}
          emptyMessage="素材入荷がありません"
          emptyAction={<NewButton label="素材入荷登録" />}
        />
      </ListShell>

      <QuickReceiptModal opened={quickOpen} onClose={() => setQuickOpen(false)} />
      <DeleteMaterialReceiptModal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        label={deleteTarget ? `${deleteTarget.materialName}（${deleteTarget.quantity} ${deleteTarget.unit}）` : ''}
      />
    </>
  );
}
