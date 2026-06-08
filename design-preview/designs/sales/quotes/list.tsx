'use client';

import { useState } from 'react';
import { Select, TextInput } from '@mantine/core';
import {
  IconCopy,
  IconEdit,
  IconFileExport,
  IconFileText,
  IconRuler2,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { DocNumber, formatDate, NewButton } from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { CUSTOMERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

interface QuoteRow {
  id: string;
  quoteNumber: string;
  customerName: string;
  validUntil: string | null;
  status: string;
  updatedAt: string;
}

const MOCK_RECORDS: QuoteRow[] = [
  { id: '1', quoteNumber: 'QOT-202606-00001', customerName: '株式会社ABC製作所', validUntil: '2026-07-15', status: 'ISSUED', updatedAt: '2026-06-05' },
  { id: '2', quoteNumber: 'QOT-202606-00002', customerName: '合同会社XYZ工業', validUntil: '2026-07-20', status: 'ACCEPTED', updatedAt: '2026-06-04' },
  { id: '3', quoteNumber: 'QOT-202605-00018', customerName: '株式会社DEFエンジニアリング', validUntil: '2026-06-01', status: 'EXPIRED', updatedAt: '2026-05-12' },
  { id: '4', quoteNumber: 'QOT-202606-00003', customerName: '東邦精密株式会社', validUntil: null, status: 'DRAFT', updatedAt: '2026-06-06' },
  { id: '5', quoteNumber: 'QOT-202606-00004', customerName: '株式会社ABC製作所', validUntil: '2026-07-25', status: 'REJECTED', updatedAt: '2026-06-07' },
];

export default function QuoteListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [customer, setCustomer] = useState<string | null>(null);

  const reset = () => { setSearch(''); setStatus(null); setCustomer(null); };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch = !search || r.quoteNumber.includes(search) || r.customerName.includes(search);
    const matchesStatus = !status || r.status === status;
    const matchesCustomer = !customer || r.customerName === customer;
    return matchesSearch && matchesStatus && matchesCustomer;
  });

  // Column definitions feed the unified <DataTable> (sortable / hideable).
  const columns: Column<QuoteRow>[] = [
    { key: 'quoteNumber', header: '見積番号', sortable: true, width: 190, render: (r) => <DocNumber>{r.quoteNumber}</DocNumber> },
    { key: 'customerName', header: '顧客', sortable: true, render: (r) => r.customerName },
    { key: 'validUntil', header: '有効期限', sortable: true, hideable: true, sortValue: (r) => r.validUntil ?? '', render: (r) => (r.validUntil ? formatDate(r.validUntil) : '—') },
    { key: 'status', header: '状態', sortable: true, width: 110, render: (r) => <StatusBadge entity="Quote" status={r.status} /> },
    { key: 'updatedAt', header: '更新日', sortable: true, hideable: true, width: 120, render: (r) => formatDate(r.updatedAt) },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', '販売', '見積書']}
      title="見積書"
      action={<NewButton />}
      onReset={reset}
      search={
        <TextInput
          placeholder="見積番号・顧客名で検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <>
          <Select
            placeholder="状態" data={statusOptions('Quote')} value={status} onChange={setStatus}
            clearable w={isMobile ? undefined : 140} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="顧客" data={CUSTOMERS.map((c) => ({ value: c.label, label: c.label }))}
            value={customer} onChange={setCustomer} clearable searchable
            w={isMobile ? undefined : 200} style={isMobile ? { flex: 1 } : undefined}
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
          { label: 'PDF一括出力', icon: <IconFileExport size={16} />, color: 'blue' },
          { label: '一括キャンセル', icon: <IconTrash size={16} />, color: 'red' },
        ]}
        rowActions={() => [
          { label: '編集', icon: <IconEdit size={14} /> },
          { label: 'コピーして新規作成', icon: <IconCopy size={14} /> },
          { label: '設計依頼書を作成', icon: <IconRuler2 size={14} /> },
          { label: 'キャンセル', icon: <IconTrash size={14} />, color: 'red' },
        ]}
        emptyIcon={<IconFileText size={24} />}
        emptyMessage="見積書がありません"
        emptyAction={<NewButton />}
      />
    </ListShell>
  );
}
