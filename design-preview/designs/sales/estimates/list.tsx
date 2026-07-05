'use client';

import { useState } from 'react';
import { Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconCalculator,
  IconCopy,
  IconCurrencyYen,
  IconEdit,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { DocNumber, formatDate, formatMoney, NewButton } from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { CUSTOMERS, ORDER_TYPE_LABEL, ORDER_TYPE_OPTIONS, PRODUCTS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data ───────────────────────────────────────────────────────────────
interface EstimateRow {
  id: string;
  estimateNumber: string;
  customerName: string;
  productName: string;
  orderType: string;
  minUnitPrice: number;
  maxUnitPrice: number;
  status: string;
  updatedAt: string;
}

const MOCK_RECORDS: EstimateRow[] = [
  { id: '1', estimateNumber: 'EST-202606-00012', customerName: '株式会社ABC製作所', productName: '精密軸 PRD-2601-0001', orderType: 'PRODUCTION', minUnitPrice: 4500, maxUnitPrice: 5000, status: 'REGISTERED', updatedAt: '2026-06-02' },
  { id: '2', estimateNumber: 'EST-202606-00015', customerName: '合同会社XYZ工業', productName: 'ロッド PRD-2602-0008', orderType: 'PRODUCTION', minUnitPrice: 6200, maxUnitPrice: 6200, status: 'CONFIRMED', updatedAt: '2026-06-05' },
  { id: '3', estimateNumber: 'EST-202606-00018', customerName: '株式会社DEFエンジニアリング', productName: '特殊加工品 PRD-2603-0012', orderType: 'TEST', minUnitPrice: 9500, maxUnitPrice: 11200, status: 'DRAFT', updatedAt: '2026-06-07' },
  { id: '4', estimateNumber: 'EST-202605-00009', customerName: '東邦精密株式会社', productName: '精密軸 PRD-2601-0001', orderType: 'SAMPLE', minUnitPrice: 0, maxUnitPrice: 0, status: 'REGISTERED', updatedAt: '2026-05-28' },
];

function unitPriceRange(min: number, max: number): string {
  return min === max ? formatMoney(min) : `${formatMoney(min)} 〜 ${formatMoney(max)}`;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function EstimateListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [customer, setCustomer] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<string | null>(null);

  const reset = () => {
    setSearch('');
    setStatus(null);
    setCustomer(null);
    setOrderType(null);
  };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch = !search || r.estimateNumber.includes(search) || r.customerName.includes(search) || r.productName.includes(search);
    const matchesStatus = !status || r.status === status;
    const matchesCustomer = !customer || r.customerName === customer;
    const matchesType = !orderType || r.orderType === orderType;
    return matchesSearch && matchesStatus && matchesCustomer && matchesType;
  });

  const columns: Column<EstimateRow>[] = [
    { key: 'estimateNumber', header: '試算番号', sortable: true, width: 180, render: (r) => <DocNumber>{r.estimateNumber}</DocNumber> },
    { key: 'customerName', header: '顧客', sortable: true, render: (r) => r.customerName },
    { key: 'productName', header: '製品', sortable: true, hideable: true, render: (r) => r.productName },
    { key: 'orderType', header: '注文種別', sortable: true, hideable: true, width: 100, render: (r) => ORDER_TYPE_LABEL[r.orderType] },
    { key: 'unitPrice', header: '単価範囲', align: 'right', width: 160, sortValue: (r) => r.minUnitPrice, render: (r) => <Text size="sm" ta="right" ff="mono">{unitPriceRange(r.minUnitPrice, r.maxUnitPrice)}</Text> },
    { key: 'status', header: '状態', sortable: true, width: 130, render: (r) => <StatusBadge entity="Estimate" status={r.status} /> },
    { key: 'updatedAt', header: '更新日', sortable: true, hideable: true, width: 110, render: (r) => formatDate(r.updatedAt) },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', '販売', '試算']}
      title="試算"
      action={<NewButton />}
      onReset={reset}
      search={
        <TextInput
          placeholder="試算番号・顧客・製品で検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <>
          <Select
            placeholder="状態" data={statusOptions('Estimate')} value={status} onChange={setStatus}
            clearable w={isMobile ? undefined : 150} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="顧客" data={CUSTOMERS.map((c) => ({ value: c.label, label: c.label }))}
            value={customer} onChange={setCustomer} clearable searchable
            w={isMobile ? undefined : 180} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="注文種別" data={ORDER_TYPE_OPTIONS}
            value={orderType} onChange={setOrderType} clearable
            w={isMobile ? undefined : 130} style={isMobile ? { flex: 1 } : undefined}
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
          { label: '一括削除', icon: <IconTrash size={16} />, color: 'red' },
        ]}
        rowActions={(r) => [
          { label: '編集', icon: <IconEdit size={14} /> },
          { label: '複製して再試算', icon: <IconCopy size={14} /> },
          ...(r.status === 'CONFIRMED'
            ? [{ label: '価格表に登録', icon: <IconCurrencyYen size={14} /> }]
            : []),
          { label: '削除', icon: <IconTrash size={14} />, color: 'red' },
        ]}
        emptyIcon={<IconCalculator size={24} />}
        emptyMessage="試算がありません"
        emptyAction={<NewButton />}
        renderCard={(r) => (
          <Paper p="sm" withBorder radius="sm">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <Text size="xs" ff="mono" c="dimmed">{r.estimateNumber}</Text>
                <Text size="sm" fw={600} truncate>{r.customerName}</Text>
                <Text size="xs" c="dimmed" truncate>{r.productName}</Text>
                <Group gap="md" mt={2}>
                  <Text size="xs" c="dimmed">{ORDER_TYPE_LABEL[r.orderType]}</Text>
                  <Text size="xs" fw={500} ff="mono">{unitPriceRange(r.minUnitPrice, r.maxUnitPrice)}</Text>
                </Group>
              </Stack>
              <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                <StatusBadge entity="Estimate" status={r.status} />
                <Text size="xs" c="dimmed">{formatDate(r.updatedAt)}</Text>
              </Stack>
            </Group>
          </Paper>
        )}
      />
    </ListShell>
  );
}
