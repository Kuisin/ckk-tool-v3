'use client';

import {
  Box,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconCurrencyYen, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import {
  ActiveBadge,
  EmptyState,
  formatDate,
  MoneyText,
  NewButton,
  PageHeader,
} from '../../lib/ui';
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
  isActive: boolean;
}

const MOCK_RECORDS: PriceListRow[] = [
  {
    id: '1',
    customerName: '株式会社ABC製作所',
    productName: '精密軸 PRD-2601-0001',
    orderType: 'PRODUCTION',
    minQuantity: 1,
    maxQuantity: 99,
    unitPrice: 5000,
    validFrom: '2026-01-01',
    validUntil: null,
    isActive: true,
  },
  {
    id: '2',
    customerName: '株式会社ABC製作所',
    productName: '精密軸 PRD-2601-0001',
    orderType: 'PRODUCTION',
    minQuantity: 100,
    maxQuantity: null,
    unitPrice: 4500,
    validFrom: '2026-01-01',
    validUntil: null,
    isActive: true,
  },
  {
    id: '3',
    customerName: '合同会社XYZ工業',
    productName: 'ロッド PRD-2602-0008',
    orderType: 'PRODUCTION',
    minQuantity: 1,
    maxQuantity: null,
    unitPrice: 6200,
    validFrom: '2026-04-01',
    validUntil: '2026-09-30',
    isActive: true,
  },
  {
    id: '4',
    customerName: '株式会社DEFエンジニアリング',
    productName: '特殊加工品 PRD-2603-0012',
    orderType: 'TEST',
    minQuantity: 1,
    maxQuantity: 10,
    unitPrice: 9500,
    validFrom: '2026-05-01',
    validUntil: null,
    isActive: false,
  },
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
    const matchesSearch =
      !search ||
      r.customerName.includes(search) ||
      r.productName.includes(search);
    const matchesCustomer = !customer || r.customerName === customer;
    const matchesProduct = !product || r.productName.includes(product);
    const matchesType = !orderType || r.orderType === orderType;
    return matchesSearch && matchesCustomer && matchesProduct && matchesType;
  });

  const filterControls = (
    <>
      <Select
        placeholder="顧客"
        data={CUSTOMERS.map((c) => ({ value: c.label, label: c.label }))}
        value={customer}
        onChange={setCustomer}
        clearable
        searchable
        w={isMobile ? undefined : 180}
        style={isMobile ? { flex: 1 } : undefined}
      />
      <Select
        placeholder="製品"
        data={PRODUCTS.map((p) => ({ value: p.value, label: p.label }))}
        value={product}
        onChange={setProduct}
        clearable
        searchable
        w={isMobile ? undefined : 180}
        style={isMobile ? { flex: 1 } : undefined}
      />
      <Select
        placeholder="注文種別"
        data={ORDER_TYPE_OPTIONS}
        value={orderType}
        onChange={setOrderType}
        clearable
        w={isMobile ? undefined : 140}
        style={isMobile ? { flex: 1 } : undefined}
      />
      <Button variant="subtle" size={isMobile ? 'sm' : undefined} onClick={reset}>
        リセット
      </Button>
    </>
  );

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '販売', '価格表']}
        title="価格表"
        actions={<NewButton />}
      />

      <Paper withBorder p="sm">
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="顧客・製品で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">{filterControls}</Group>
          </Stack>
        ) : (
          <Group mb="sm" align="flex-end">
            <TextInput
              placeholder="顧客・製品で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            {filterControls}
          </Group>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconCurrencyYen size={24} />}
            message="価格表がありません"
            action={
              <Button variant="subtle" size="sm">
                新規作成
              </Button>
            }
          />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>
                      {r.customerName}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {r.productName}
                    </Text>
                    <Group gap="md" mt={2}>
                      <Text size="xs" c="dimmed">
                        {ORDER_TYPE_LABEL[r.orderType]} · {quantityRange(r.minQuantity, r.maxQuantity)}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {validPeriod(r.validFrom, r.validUntil)}
                    </Text>
                  </Stack>
                  <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                    <MoneyText value={r.unitPrice} />
                    <ActiveBadge active={r.isActive} />
                  </Stack>
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Table highlightOnHover striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>顧客</Table.Th>
                <Table.Th>製品</Table.Th>
                <Table.Th>注文種別</Table.Th>
                <Table.Th>数量範囲</Table.Th>
                <Table.Th ta="right">単価</Table.Th>
                <Table.Th>有効期間</Table.Th>
                <Table.Th>状態</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td>{r.customerName}</Table.Td>
                  <Table.Td>{r.productName}</Table.Td>
                  <Table.Td>{ORDER_TYPE_LABEL[r.orderType]}</Table.Td>
                  <Table.Td>{quantityRange(r.minQuantity, r.maxQuantity)}</Table.Td>
                  <Table.Td>
                    <Box w={100} ml="auto">
                      <MoneyText value={r.unitPrice} />
                    </Box>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{validPeriod(r.validFrom, r.validUntil)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <ActiveBadge active={r.isActive} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
