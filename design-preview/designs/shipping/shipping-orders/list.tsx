'use client';

import { useState } from 'react';
import { Badge, Select, TextInput } from '@mantine/core';
import {
  IconCircleCheck,
  IconCopy,
  IconEdit,
  IconFileExport,
  IconSearch,
  IconTruck,
  IconTruckDelivery,
  IconX,
} from '@tabler/icons-react';
import { DocNumber, formatDate, NewButton } from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { useIsMobile } from '../../lib/viewport-context';

// ── Shipping type labels (tables.md SHIPPING_TYPE) ───────────────────────────
const TYPE_LABEL: Record<string, string> = {
  STOCK_STORAGE: '在庫保管',
  DISPATCH: '発送',
};

const TYPE_OPTIONS = [
  { value: 'STOCK_STORAGE', label: '在庫保管' },
  { value: 'DISPATCH', label: '発送' },
];

function TypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="light" color={type === 'STOCK_STORAGE' ? 'gray' : 'orange'}>
      {TYPE_LABEL[type] ?? type}
    </Badge>
  );
}

interface ShippingOrderRow {
  id: string;
  shippingOrderNumber: string;
  salesOrderNumber: string;
  customerName: string;
  type: string;
  status: string;
  shippedAt: string | null;
}

const MOCK_RECORDS: ShippingOrderRow[] = [
  { id: '1', shippingOrderNumber: 'SHP-202606-0007', salesOrderNumber: 'ORD-202601-00001-01', customerName: '株式会社ABC製作所', type: 'DISPATCH', status: 'SHIPPED', shippedAt: '2026-06-04' },
  { id: '2', shippingOrderNumber: 'SHP-202606-0006', salesOrderNumber: 'ORD-202601-00002-01', customerName: '合同会社XYZ工業', type: 'DISPATCH', status: 'CONFIRMED', shippedAt: null },
  { id: '3', shippingOrderNumber: 'SHP-202606-0005', salesOrderNumber: 'ORD-202512-00018-02', customerName: '東邦精密株式会社', type: 'STOCK_STORAGE', status: 'CONFIRMED', shippedAt: null },
  { id: '4', shippingOrderNumber: 'SHP-202606-0004', salesOrderNumber: 'ORD-202601-00003-01', customerName: '株式会社DEFエンジニアリング', type: 'DISPATCH', status: 'DRAFT', shippedAt: null },
  { id: '5', shippingOrderNumber: 'SHP-202605-0021', salesOrderNumber: 'ORD-202512-00012-01', customerName: '株式会社ABC製作所', type: 'STOCK_STORAGE', status: 'SHIPPED', shippedAt: '2026-05-28' },
];

export default function ShippingOrdersListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const reset = () => { setSearch(''); setStatusFilter(null); setTypeFilter(null); };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.shippingOrderNumber.includes(search) ||
      r.salesOrderNumber.includes(search) ||
      r.customerName.includes(search);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    const matchesType = !typeFilter || r.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const columns: Column<ShippingOrderRow>[] = [
    { key: 'shippingOrderNumber', header: '出荷書番号', sortable: true, width: 170, render: (r) => <DocNumber>{r.shippingOrderNumber}</DocNumber> },
    { key: 'salesOrderNumber', header: '受注番号', sortable: true, hideable: true, render: (r) => <DocNumber>{r.salesOrderNumber}</DocNumber> },
    { key: 'customerName', header: '顧客', sortable: true, render: (r) => r.customerName },
    { key: 'type', header: '種別', sortable: true, width: 110, sortValue: (r) => TYPE_LABEL[r.type] ?? r.type, render: (r) => <TypeBadge type={r.type} /> },
    { key: 'status', header: '状態', sortable: true, width: 100, render: (r) => <StatusBadge entity="ShippingOrder" status={r.status} /> },
    { key: 'shippedAt', header: '出荷日', sortable: true, hideable: true, width: 120, sortValue: (r) => r.shippedAt ?? '', render: (r) => formatDate(r.shippedAt) },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', '出荷', '出荷書']}
      title="出荷書"
      action={<NewButton />}
      onReset={reset}
      search={
        <TextInput
          placeholder="出荷書番号・受注番号・顧客で検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <>
          <Select
            placeholder="状態" data={statusOptions('ShippingOrder')} value={statusFilter} onChange={setStatusFilter}
            clearable w={isMobile ? undefined : 150} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="種別" data={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter}
            clearable w={isMobile ? undefined : 150} style={isMobile ? { flex: 1 } : undefined}
          />
        </>
      }
    >
      <DataTable
        data={filtered}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={() => { /* navigate to detail */ }}
        defaultSort={{ key: 'shippingOrderNumber', dir: 'desc' }}
        selectable
        bulkActions={[
          { label: 'PDF一括出力', icon: <IconFileExport size={16} />, color: 'blue' },
          { label: '一括出荷確定', icon: <IconTruckDelivery size={16} />, color: 'green' },
          { label: '一括キャンセル', icon: <IconX size={16} />, color: 'red' },
        ]}
        rowActions={(r) => [
          { label: '編集', icon: <IconEdit size={14} /> },
          ...(r.status === 'DRAFT' ? [{ label: '確定', icon: <IconCircleCheck size={14} />, color: 'blue' }] : []),
          ...(r.status === 'CONFIRMED' ? [{ label: '出荷確定', icon: <IconTruckDelivery size={14} />, color: 'green' }] : []),
          { label: 'コピーして新規作成', icon: <IconCopy size={14} /> },
          { label: 'キャンセル', icon: <IconX size={14} />, color: 'red' },
        ]}
        emptyIcon={<IconTruck size={24} />}
        emptyMessage="出荷書がありません"
        emptyAction={<NewButton />}
      />
    </ListShell>
  );
}
