'use client';

import { useState } from 'react';
import { Button, Select, Text, TextInput } from '@mantine/core';
import {
  IconCalendarDue,
  IconFileExport,
  IconPlayerPlay,
  IconSearch,
} from '@tabler/icons-react';
import { formatDate, formatDateTime, MoneyText } from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { CUSTOMERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';
import { RunClosingModal } from './_modals/run-closing';
import { YayoiExportClosingModal } from './_modals/yayoi-export';

interface ClosingRow {
  id: string;
  customerName: string;
  closingDate: string;
  totalAmount: number | null;
  status: string;
  processedAt: string | null;
  yayoiExportedAt: string | null;
}

const MOCK_RECORDS: ClosingRow[] = [
  { id: '1', customerName: '株式会社ABC製作所', closingDate: '2026-05-31', totalAmount: 1485000, status: 'EXPORTED', processedAt: '2026-06-01 02:00', yayoiExportedAt: '2026-06-02 09:00' },
  { id: '2', customerName: '合同会社XYZ工業', closingDate: '2026-05-31', totalAmount: 660000, status: 'PROCESSED', processedAt: '2026-06-01 02:00', yayoiExportedAt: null },
  { id: '3', customerName: '株式会社DEFエンジニアリング', closingDate: '2026-05-20', totalAmount: 209000, status: 'PROCESSED', processedAt: '2026-05-21 02:00', yayoiExportedAt: null },
  { id: '4', customerName: '東邦精密株式会社', closingDate: '2026-06-30', totalAmount: null, status: 'PENDING', processedAt: null, yayoiExportedAt: null },
];

export default function ClosingsListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<ClosingRow | null>(null);

  const reset = () => { setSearch(''); setStatusFilter(null); setCustomerFilter(null); };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch = !search || r.customerName.includes(search);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    const matchesCustomer = !customerFilter || r.customerName.includes(customerFilter);
    return matchesSearch && matchesStatus && matchesCustomer;
  });

  const customerOptions = CUSTOMERS.map((c) => ({ value: c.label, label: c.label }));

  const columns: Column<ClosingRow>[] = [
    { key: 'customerName', header: '顧客', sortable: true, render: (r) => r.customerName },
    { key: 'closingDate', header: '締日', sortable: true, width: 120, render: (r) => formatDate(r.closingDate) },
    { key: 'totalAmount', header: '合計金額', sortable: true, align: 'right', width: 130, sortValue: (r) => r.totalAmount ?? -1, render: (r) => <MoneyText value={r.totalAmount} /> },
    { key: 'status', header: '状態', sortable: true, width: 130, render: (r) => <StatusBadge entity="BillingClosing" status={r.status} /> },
    { key: 'processedAt', header: '処理日', sortable: true, hideable: true, width: 150, sortValue: (r) => r.processedAt ?? '', render: (r) => formatDateTime(r.processedAt) },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', '請求', '締日処理']}
      title="締日処理"
      action={
        <Button
          leftSection={<IconPlayerPlay size={16} />}
          size={isMobile ? 'sm' : 'md'}
          style={{ flexShrink: 0 }}
          onClick={() => setRunOpen(true)}
        >
          {isMobile ? '締日処理' : '締日処理を実行'}
        </Button>
      }
      onReset={reset}
      search={
        <TextInput
          placeholder="顧客で検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <>
          <Select
            placeholder="状態" data={statusOptions('BillingClosing')} value={statusFilter} onChange={setStatusFilter}
            clearable w={isMobile ? undefined : 170} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="顧客" data={customerOptions} value={customerFilter} onChange={setCustomerFilter}
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
        defaultSort={{ key: 'closingDate', dir: 'desc' }}
        selectable
        bulkActions={[
          { label: '弥生CSV一括エクスポート', icon: <IconFileExport size={16} />, color: 'blue' },
        ]}
        rowActions={(r) => [
          ...(r.status !== 'PENDING' ? [{ label: '弥生CSVエクスポート', icon: <IconFileExport size={14} />, onAction: () => setExportTarget(r) }] : []),
        ]}
        emptyIcon={<IconCalendarDue size={24} />}
        emptyMessage="締日処理がありません"
      />

      <RunClosingModal opened={runOpen} onClose={() => setRunOpen(false)} />
      <YayoiExportClosingModal
        opened={!!exportTarget}
        onClose={() => setExportTarget(null)}
        customerName={exportTarget?.customerName ?? ''}
        closingDate={exportTarget ? formatDate(exportTarget.closingDate) : ''}
        alreadyExportedAt={exportTarget?.yayoiExportedAt ? formatDateTime(exportTarget.yayoiExportedAt) : null}
      />
    </ListShell>
  );
}
