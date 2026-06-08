'use client';

import { useState } from 'react';
import { Group, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconClipboardList,
  IconCopy,
  IconEdit,
  IconFileExport,
  IconSearch,
  IconSettings2,
  IconX,
} from '@tabler/icons-react';
import { DocNumber, formatDate, MoneyText, NewButton } from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { CUSTOMERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

interface SalesOrderRow {
  id: string;
  salesOrderNumber: string;
  customerName: string;
  productName: string;
  quantity: number;
  amount: number;
  deliveryDate: string;
  status: string;
}

const MOCK_RECORDS: SalesOrderRow[] = [
  { id: '1', salesOrderNumber: 'ORD-202601-00001-01', customerName: '株式会社ABC製作所', productName: '精密軸 PRD-2601-0001', quantity: 50, amount: 250000, deliveryDate: '2026-06-15', status: 'IN_PRODUCTION' },
  { id: '2', salesOrderNumber: 'ORD-202601-00002-01', customerName: '合同会社XYZ工業', productName: 'ロッド PRD-2602-0008', quantity: 30, amount: 180000, deliveryDate: '2026-06-20', status: 'CONFIRMED' },
  { id: '3', salesOrderNumber: 'ORD-202601-00003-01', customerName: '株式会社DEFエンジニアリング', productName: '特殊加工品 PRD-2603-0012', quantity: 10, amount: 95000, deliveryDate: '2026-07-01', status: 'DRAFT' },
  { id: '4', salesOrderNumber: 'ORD-202512-00018-02', customerName: '東邦精密株式会社', productName: '精密軸 PRD-2601-0001', quantity: 120, amount: 600000, deliveryDate: '2026-05-30', status: 'PARTIAL_SHIPPED' },
  { id: '5', salesOrderNumber: 'ORD-202512-00012-01', customerName: '株式会社ABC製作所', productName: 'ロッド PRD-2602-0008', quantity: 40, amount: 240000, deliveryDate: '2026-05-12', status: 'SHIPPED' },
];

export default function SalesOrdersListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);

  const reset = () => { setSearch(''); setStatusFilter(null); setCustomerFilter(null); };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.salesOrderNumber.includes(search) ||
      r.customerName.includes(search) ||
      r.productName.includes(search);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    const matchesCustomer = !customerFilter || r.customerName === customerFilter;
    return matchesSearch && matchesStatus && matchesCustomer;
  });

  const columns: Column<SalesOrderRow>[] = [
    { key: 'salesOrderNumber', header: '受注番号', sortable: true, width: 190, render: (r) => <DocNumber>{r.salesOrderNumber}</DocNumber> },
    { key: 'customerName', header: '顧客', sortable: true, render: (r) => r.customerName },
    { key: 'productName', header: '製品', sortable: true, hideable: true, render: (r) => r.productName },
    { key: 'quantity', header: '数量', sortable: true, align: 'right', width: 90, sortValue: (r) => r.quantity, render: (r) => `${r.quantity} 本` },
    { key: 'amount', header: '金額', sortable: true, align: 'right', width: 120, sortValue: (r) => r.amount, render: (r) => <MoneyText value={r.amount} /> },
    { key: 'deliveryDate', header: '納期', sortable: true, hideable: true, width: 120, render: (r) => formatDate(r.deliveryDate) },
    { key: 'status', header: '状態', sortable: true, width: 110, render: (r) => <StatusBadge entity="SalesOrder" status={r.status} /> },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', '生産', '受注書']}
      title="受注書"
      action={<NewButton />}
      onReset={reset}
      search={
        <TextInput
          placeholder="受注番号・顧客・製品で検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <>
          <Select
            placeholder="状態" data={statusOptions('SalesOrder')} value={statusFilter} onChange={setStatusFilter}
            clearable w={isMobile ? undefined : 160} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="顧客" data={CUSTOMERS.map((c) => ({ value: c.label, label: c.label }))}
            value={customerFilter} onChange={setCustomerFilter} clearable searchable
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
        defaultSort={{ key: 'deliveryDate', dir: 'asc' }}
        selectable
        bulkActions={[
          { label: 'PDF一括出力', icon: <IconFileExport size={16} />, color: 'blue' },
          { label: '一括キャンセル', icon: <IconX size={16} />, color: 'red' },
        ]}
        rowActions={() => [
          { label: '編集', icon: <IconEdit size={14} /> },
          { label: '指示書を作成', icon: <IconSettings2 size={14} /> },
          { label: 'コピーして新規作成', icon: <IconCopy size={14} /> },
          { label: 'キャンセル', icon: <IconX size={14} />, color: 'red' },
        ]}
        renderCard={(r) => (
          <Group justify="space-between" wrap="nowrap" align="flex-start"
            style={{ padding: 'var(--mantine-spacing-sm)', border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }}>
            <Stack gap={3} style={{ minWidth: 0 }}>
              <DocNumber c="dimmed">{r.salesOrderNumber}</DocNumber>
              <Text size="sm" fw={600} truncate>{r.customerName}</Text>
              <Text size="xs" c="dimmed" truncate>{r.productName}</Text>
              <Group gap="md" mt={2}>
                <Text size="xs" c="dimmed">{r.quantity} 本</Text>
                <MoneyText value={r.amount} ta="left" />
              </Group>
            </Stack>
            <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
              <StatusBadge entity="SalesOrder" status={r.status} />
              <Text size="xs" c="dimmed">{formatDate(r.deliveryDate)}</Text>
            </Stack>
          </Group>
        )}
        emptyIcon={<IconClipboardList size={24} />}
        emptyMessage="受注書がありません"
        emptyAction={<NewButton />}
      />
    </ListShell>
  );
}
