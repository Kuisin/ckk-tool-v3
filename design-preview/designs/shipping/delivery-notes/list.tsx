'use client';

import { useState } from 'react';
import { Badge, Select, TextInput } from '@mantine/core';
import {
  IconCircleCheck,
  IconCopy,
  IconEdit,
  IconFileExport,
  IconReceipt,
  IconSearch,
  IconSend,
  IconX,
} from '@tabler/icons-react';
import { DocNumber, formatDate, NewButton } from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { useIsMobile } from '../../lib/viewport-context';

// ── Delivery method labels (tables.md DELIVERY_METHOD) ───────────────────────
const METHOD_LABEL: Record<string, string> = {
  DIRECT_TO_USER: 'ユーザー直送',
  NORMAL: '通常納品',
};

const METHOD_OPTIONS = [
  { value: 'DIRECT_TO_USER', label: 'ユーザー直送' },
  { value: 'NORMAL', label: '通常納品' },
];

function MethodBadge({ method }: { method: string }) {
  return (
    <Badge variant="light" color={method === 'DIRECT_TO_USER' ? 'violet' : 'gray'}>
      {METHOD_LABEL[method] ?? method}
    </Badge>
  );
}

interface DeliveryNoteRow {
  id: string;
  deliveryNumber: string;
  shippingOrderNumber: string;
  recipientName: string;
  method: string;
  status: string;
  deliveredAt: string | null;
}

const MOCK_RECORDS: DeliveryNoteRow[] = [
  { id: '1', deliveryNumber: 'DRN-202606-00012', shippingOrderNumber: 'SHP-202606-0007', recipientName: '株式会社ABC製作所 東京本社', method: 'NORMAL', status: 'DELIVERED', deliveredAt: '2026-06-05' },
  { id: '2', deliveryNumber: 'DRN-202606-00011', shippingOrderNumber: 'SHP-202606-0006', recipientName: '合同会社XYZ工業', method: 'DIRECT_TO_USER', status: 'ISSUED', deliveredAt: null },
  { id: '3', deliveryNumber: 'DRN-202606-00010', shippingOrderNumber: 'SHP-202606-0004', recipientName: '株式会社DEFエンジニアリング 名古屋支店', method: 'NORMAL', status: 'DRAFT', deliveredAt: null },
  { id: '4', deliveryNumber: 'DRN-202605-00009', shippingOrderNumber: 'SHP-202605-0021', recipientName: '株式会社ABC製作所 大阪支社', method: 'DIRECT_TO_USER', status: 'DELIVERED', deliveredAt: '2026-05-29' },
];

export default function DeliveryNotesListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [methodFilter, setMethodFilter] = useState<string | null>(null);

  const reset = () => { setSearch(''); setStatusFilter(null); setMethodFilter(null); };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.deliveryNumber.includes(search) ||
      r.shippingOrderNumber.includes(search) ||
      r.recipientName.includes(search);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    const matchesMethod = !methodFilter || r.method === methodFilter;
    return matchesSearch && matchesStatus && matchesMethod;
  });

  const columns: Column<DeliveryNoteRow>[] = [
    { key: 'deliveryNumber', header: '納品番号', sortable: true, width: 170, render: (r) => <DocNumber>{r.deliveryNumber}</DocNumber> },
    { key: 'shippingOrderNumber', header: '出荷書番号', sortable: true, hideable: true, width: 160, render: (r) => <DocNumber>{r.shippingOrderNumber}</DocNumber> },
    { key: 'recipientName', header: '納品先', sortable: true, render: (r) => r.recipientName },
    { key: 'method', header: '方法', sortable: true, width: 130, sortValue: (r) => METHOD_LABEL[r.method] ?? r.method, render: (r) => <MethodBadge method={r.method} /> },
    { key: 'status', header: '状態', sortable: true, width: 100, render: (r) => <StatusBadge entity="DeliveryNote" status={r.status} /> },
    { key: 'deliveredAt', header: '納品日', sortable: true, hideable: true, width: 120, sortValue: (r) => r.deliveredAt ?? '', render: (r) => formatDate(r.deliveredAt) },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', '出荷', '納品書']}
      title="納品書"
      action={<NewButton />}
      onReset={reset}
      search={
        <TextInput
          placeholder="納品番号・出荷書番号・納品先で検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <>
          <Select
            placeholder="状態" data={statusOptions('DeliveryNote')} value={statusFilter} onChange={setStatusFilter}
            clearable w={isMobile ? undefined : 150} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="方法" data={METHOD_OPTIONS} value={methodFilter} onChange={setMethodFilter}
            clearable w={isMobile ? undefined : 160} style={isMobile ? { flex: 1 } : undefined}
          />
        </>
      }
    >
      <DataTable
        data={filtered}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={() => { /* navigate to detail */ }}
        defaultSort={{ key: 'deliveryNumber', dir: 'desc' }}
        selectable
        bulkActions={[
          { label: 'PDF一括出力', icon: <IconFileExport size={16} />, color: 'blue' },
          { label: '一括発行', icon: <IconSend size={16} />, color: 'blue' },
          { label: '一括キャンセル', icon: <IconX size={16} />, color: 'red' },
        ]}
        rowActions={(r) => [
          { label: '編集', icon: <IconEdit size={14} /> },
          ...(r.status === 'DRAFT' ? [{ label: '発行', icon: <IconSend size={14} />, color: 'blue' }] : []),
          ...(r.status === 'ISSUED' ? [{ label: '納品完了', icon: <IconCircleCheck size={14} />, color: 'green' }] : []),
          { label: 'コピーして新規作成', icon: <IconCopy size={14} /> },
          { label: 'キャンセル', icon: <IconX size={14} />, color: 'red' },
        ]}
        emptyIcon={<IconReceipt size={24} />}
        emptyMessage="納品書がありません"
        emptyAction={<NewButton />}
      />
    </ListShell>
  );
}
