'use client';

import { useState } from 'react';
import { Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconCopy,
  IconCurrencyYen,
  IconEdit,
  IconFileText,
  IconSearch,
  IconToggleRight,
  IconTrash,
} from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  formatDate,
  MoneyText,
  NewButton,
} from '../../lib/ui';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import {
  CUSTOMERS,
  ORDER_TYPE_LABEL,
  ORDER_TYPE_OPTIONS,
  PRODUCTS,
} from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data ───────────────────────────────────────────────────────────────
interface PriceListRow {
  id: string;
  customerName: string;
  productName: string;
  orderType: string;
  minQuantity: number;
  maxQuantity: number | null;
  unitPrice: number;
  validFrom: string;
  validUntil: string | null;
  estimateNumber: string | null; // 試算元（手動登録時は null）
  isActive: boolean;
}

const MOCK_RECORDS: PriceListRow[] = [
  { id: '1', customerName: '株式会社ABC製作所', productName: '精密軸 PRD-2601-0001', orderType: 'PRODUCTION', minQuantity: 1, maxQuantity: 99, unitPrice: 5000, validFrom: '2026-01-01', validUntil: null, estimateNumber: 'EST-202606-00012', isActive: true },
  { id: '2', customerName: '株式会社ABC製作所', productName: '精密軸 PRD-2601-0001', orderType: 'PRODUCTION', minQuantity: 100, maxQuantity: null, unitPrice: 4500, validFrom: '2026-01-01', validUntil: null, estimateNumber: 'EST-202606-00012', isActive: true },
  { id: '3', customerName: '合同会社XYZ工業', productName: 'ロッド PRD-2602-0008', orderType: 'PRODUCTION', minQuantity: 1, maxQuantity: null, unitPrice: 6200, validFrom: '2026-04-01', validUntil: '2026-09-30', estimateNumber: null, isActive: true },
  { id: '4', customerName: '株式会社DEFエンジニアリング', productName: '特殊加工品 PRD-2603-0012', orderType: 'TEST', minQuantity: 1, maxQuantity: 10, unitPrice: 9500, validFrom: '2026-05-01', validUntil: null, estimateNumber: 'EST-202606-00018', isActive: false },
];

function quantityRange(min: number, max: number | null): string {
  return max == null ? `${min}本〜` : `${min}〜${max}本`;
}

function validPeriod(from: string, until: string | null): string {
  return `${formatDate(from)} 〜 ${until ? formatDate(until) : '無期限'}`;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function PriceListListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState<string | null>(null);
  const [product, setProduct] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<string | null>(null);

  const reset = () => {
    setSearch('');
    setCustomer(null);
    setProduct(null);
    setOrderType(null);
  };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch = !search || r.customerName.includes(search) || r.productName.includes(search);
    const matchesCustomer = !customer || r.customerName === customer;
    const matchesProduct = !product || r.productName.includes(product);
    const matchesType = !orderType || r.orderType === orderType;
    return matchesSearch && matchesCustomer && matchesProduct && matchesType;
  });

  const columns: Column<PriceListRow>[] = [
    { key: 'customerName', header: '顧客', sortable: true, render: (r) => r.customerName },
    { key: 'productName', header: '製品', sortable: true, render: (r) => r.productName },
    { key: 'orderType', header: '注文種別', sortable: true, hideable: true, width: 110, render: (r) => ORDER_TYPE_LABEL[r.orderType] },
    { key: 'quantity', header: '数量範囲', hideable: true, width: 120, sortValue: (r) => r.minQuantity, render: (r) => quantityRange(r.minQuantity, r.maxQuantity) },
    { key: 'unitPrice', header: '単価', sortable: true, align: 'right', width: 120, sortValue: (r) => r.unitPrice, render: (r) => <MoneyText value={r.unitPrice} /> },
    { key: 'validPeriod', header: '有効期間', hideable: true, sortValue: (r) => r.validFrom, render: (r) => <Text size="sm">{validPeriod(r.validFrom, r.validUntil)}</Text> },
    { key: 'estimateNumber', header: '試算元', hideable: true, width: 170, sortValue: (r) => r.estimateNumber ?? '', render: (r) => (r.estimateNumber ? <DocNumber c="blue">{r.estimateNumber}</DocNumber> : <Text size="sm" c="dimmed">手動</Text>) },
    { key: 'isActive', header: '状態', sortable: true, width: 90, sortValue: (r) => (r.isActive ? 1 : 0), render: (r) => <ActiveBadge active={r.isActive} /> },
  ];

  return (
    <ListShell
      breadcrumbs={['ホーム', '販売', '価格表']}
      title="価格表"
      action={<NewButton />}
      onReset={reset}
      search={
        <TextInput
          placeholder="顧客・製品で検索"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      }
      filters={
        <>
          <Select
            placeholder="顧客" data={CUSTOMERS.map((c) => ({ value: c.label, label: c.label }))}
            value={customer} onChange={setCustomer} clearable searchable
            w={isMobile ? undefined : 180} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="製品" data={PRODUCTS.map((p) => ({ value: p.value, label: p.label }))}
            value={product} onChange={setProduct} clearable searchable
            w={isMobile ? undefined : 180} style={isMobile ? { flex: 1 } : undefined}
          />
          <Select
            placeholder="注文種別" data={ORDER_TYPE_OPTIONS}
            value={orderType} onChange={setOrderType} clearable
            w={isMobile ? undefined : 140} style={isMobile ? { flex: 1 } : undefined}
          />
        </>
      }
    >
      <DataTable
        data={filtered}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={() => { /* navigate to detail */ }}
        defaultSort={{ key: 'customerName', dir: 'asc' }}
        selectable
        bulkActions={[
          { label: '有効化', icon: <IconToggleRight size={16} />, color: 'green' },
          { label: '無効化', icon: <IconToggleRight size={16} />, color: 'gray' },
          { label: '一括削除', icon: <IconTrash size={16} />, color: 'red' },
        ]}
        rowActions={() => [
          { label: '見積書を作成', icon: <IconFileText size={14} /> },
          { label: '編集', icon: <IconEdit size={14} /> },
          { label: '有効期間を変えて複製', icon: <IconCopy size={14} /> },
          { label: '削除', icon: <IconTrash size={14} />, color: 'red' },
        ]}
        emptyIcon={<IconCurrencyYen size={24} />}
        emptyMessage="価格表がありません"
        emptyAction={<NewButton />}
        renderCard={(r) => (
          <Paper p="sm" withBorder radius="sm">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} truncate>{r.customerName}</Text>
                <Text size="xs" c="dimmed" truncate>{r.productName}</Text>
                <Text size="xs" c="dimmed">
                  {ORDER_TYPE_LABEL[r.orderType]} · {quantityRange(r.minQuantity, r.maxQuantity)}
                </Text>
                <Text size="xs" c="dimmed">{validPeriod(r.validFrom, r.validUntil)}</Text>
                {r.estimateNumber && (
                  <Text size="xs" ff="mono" c="blue">{r.estimateNumber}</Text>
                )}
              </Stack>
              <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                <MoneyText value={r.unitPrice} />
                <ActiveBadge active={r.isActive} />
              </Stack>
            </Group>
          </Paper>
        )}
      />
    </ListShell>
  );
}
