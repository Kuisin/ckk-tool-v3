'use client';

import { useState } from 'react';
import { Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconCheck,
  IconClipboardCheck,
  IconCopy,
  IconEdit,
  IconFileExport,
  IconSearch,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import {
  DocNumber,
  formatDate,
  MoneyText,
  NewButton,
} from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { CUSTOMERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

interface OrderAcceptanceRow {
  id: string;
  orderNumber: string;
  customerName: string;
  customerOrderRef: string;
  totalAmount: number;
  status: string;
  updatedAt: string;
}

const MOCK_RECORDS: OrderAcceptanceRow[] = [
  { id: '1', orderNumber: 'ORD-202606-00001', customerName: '株式会社ABC製作所', customerOrderRef: 'PO-ABC-2026-0512', totalAmount: 281000, status: 'CONFIRMED', updatedAt: '2026-06-05' },
  { id: '2', orderNumber: 'ORD-202606-00002', customerName: '合同会社XYZ工業', customerOrderRef: 'XYZ-20260604-01', totalAmount: 186000, status: 'PRICE_DIFF', updatedAt: '2026-06-04' },
  { id: '3', orderNumber: 'ORD-202606-00003', customerName: '東邦精密株式会社', customerOrderRef: 'TH-PO-6677', totalAmount: 95000, status: 'PENDING', updatedAt: '2026-06-06' },
];

export default function OrderAcceptanceListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [customer, setCustomer] = useState<string | null>(null);

  const reset = () => {
    setSearch('');
    setStatus(null);
    setCustomer(null);
  };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.orderNumber.includes(search) ||
      r.customerName.includes(search) ||
      r.customerOrderRef.includes(search);
    const matchesStatus = !status || r.status === status;
    const matchesCustomer = !customer || r.customerName === customer;
    return matchesSearch && matchesStatus && matchesCustomer;
  });

  const columns: Column<OrderAcceptanceRow>[] = [
    { key: 'orderNumber', header: '注文番号', sortable: true, width: 180, render: (r) => <DocNumber>{r.orderNumber}</DocNumber> },
    { key: 'customerName', header: '顧客', sortable: true, render: (r) => r.customerName },
    { key: 'customerOrderRef', header: '顧客注文書番号', sortable: true, hideable: true, render: (r) => r.customerOrderRef },
    { key: 'totalAmount', header: '合計金額', sortable: true, align: 'right', width: 130, sortValue: (r) => r.totalAmount, render: (r) => <MoneyText value={r.totalAmount} /> },
    { key: 'status', header: '状態', sortable: true, width: 110, render: (r) => <StatusBadge entity="OrderAcceptance" status={r.status} /> },
    { key: 'updatedAt', header: '更新日', sortable: true, hideable: true, width: 120, render: (r) => formatDate(r.updatedAt) },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', '販売', '注文受諾書']}
      title="注文受諾書"
      action={<NewButton />}
      onReset={reset}
      search={
        <TextInput
          placeholder="注文番号・顧客・顧客注文書番号で検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <>
          <Select
            placeholder="状態" data={statusOptions('OrderAcceptance')} value={status} onChange={setStatus}
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
          { label: '一括確定', icon: <IconCheck size={16} />, color: 'green' },
          { label: '一括キャンセル', icon: <IconTrash size={16} />, color: 'red' },
        ]}
        rowActions={() => [
          { label: '編集', icon: <IconEdit size={14} /> },
          { label: '注文書PDFをアップロード', icon: <IconUpload size={14} /> },
          { label: '確定', icon: <IconCheck size={14} /> },
          { label: 'コピーして新規作成', icon: <IconCopy size={14} /> },
          { label: 'キャンセル', icon: <IconTrash size={14} />, color: 'red' },
        ]}
        emptyIcon={<IconClipboardCheck size={24} />}
        emptyMessage="注文受諾書がありません"
        emptyAction={<NewButton />}
        renderCard={(r) => (
          <Paper p="sm" withBorder radius="sm">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <Text size="xs" ff="mono" c="dimmed">{r.orderNumber}</Text>
                <Text size="sm" fw={600} truncate>{r.customerName}</Text>
                <Text size="xs" c="dimmed" truncate>顧客注文書: {r.customerOrderRef}</Text>
                <Text size="xs" fw={500}>
                  {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(r.totalAmount)}
                </Text>
              </Stack>
              <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                <StatusBadge entity="OrderAcceptance" status={r.status} />
                <Text size="xs" c="dimmed">{formatDate(r.updatedAt)}</Text>
              </Stack>
            </Group>
          </Paper>
        )}
      />
    </ListShell>
  );
}
