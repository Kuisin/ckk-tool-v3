'use client';

import { useState } from 'react';
import { Group, Stack, Table, Tabs, Text } from '@mantine/core';
import { IconCopy, IconFileText, IconTrash } from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  FieldValue,
  formatDate,
  formatDateTime,
  MoneyText,
} from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import {
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
  type AuditEntry,
} from '../../lib/shells';
import { ORDER_TYPE_LABEL } from '../../lib/mock';
import { DeletePriceListModal } from './_modals/delete';
import { DuplicatePriceListModal } from './_modals/duplicate';
import { CreateQuoteModal } from './_modals/create-quote';

const MOCK = {
  customerName: '株式会社ABC製作所',
  productName: '精密軸 PRD-2601-0001',
  orderType: 'PRODUCTION',
  minQuantity: 1,
  maxQuantity: 99,
  unitPrice: 5000,
  currency: 'JPY',
  validFrom: '2026-01-01',
  validUntil: null as string | null,
  estimateNumber: 'EST-202606-00012' as string | null, // 試算元（手動登録時は null）
  isActive: true,
  createdBy: '鈴木 一郎',
  createdAt: '2025-12-20 09:15',
  updatedAt: '2026-01-05 14:30',
};

// この価格表から作成した見積書
const MOCK_QUOTES = [
  { id: '1', quoteNumber: 'QOT-202606-00001', status: 'ISSUED', quantity: 50, amount: 240000, createdAt: '2026-06-03' },
  { id: '2', quoteNumber: 'QOT-202605-00018', status: 'EXPIRED', quantity: 30, amount: 150000, createdAt: '2026-05-08' },
];

const MOCK_AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '鈴木', at: '2026-01-05 14:30', detail: '単価: ¥5,200 → ¥5,000' },
  { id: 2, action: 'CREATE', user: '鈴木', at: '2025-12-20 09:15', detail: '試算 EST-202606-00012 から登録' },
];

export default function PriceListDetailPage() {
  const r = MOCK;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [createQuoteOpen, setCreateQuoteOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', '販売', '価格表', '詳細']}
      title="価格表 詳細"
      status={<ActiveBadge active={r.isActive} />}
      createdAt={formatDateTime(r.createdAt)}
      updatedAt={formatDateTime(r.updatedAt)}
      actions={
        <ResourceActions
          onEdit={() => {}}
          menuItems={[
            { label: '見積書を作成', icon: <IconFileText size={14} />, onClick: () => setCreateQuoteOpen(true) },
            { label: '有効期間を変えて複製', icon: <IconCopy size={14} />, onClick: () => setDuplicateOpen(true) },
            { label: '削除', icon: <IconTrash size={14} />, color: 'red', divider: true, onClick: () => setDeleteOpen(true) },
          ]}
        />
      }
    >
      <SummaryGrid>
        <FieldValue label="顧客" value={r.customerName} />
        <FieldValue label="製品" value={r.productName} />
        <FieldValue label="注文種別" value={ORDER_TYPE_LABEL[r.orderType]} />
        <FieldValue
          label="数量範囲"
          value={r.maxQuantity == null ? `${r.minQuantity}本〜` : `${r.minQuantity}〜${r.maxQuantity}本`}
        />
        <FieldValue label="単価" value={<MoneyText value={r.unitPrice} currency={r.currency} ta="left" />} />
        <FieldValue label="通貨" value={r.currency} />
        <FieldValue label="有効開始日" value={formatDate(r.validFrom)} />
        <FieldValue label="有効終了日" value={r.validUntil ? formatDate(r.validUntil) : '無期限'} />
        <FieldValue
          label="試算元"
          value={r.estimateNumber ? <DocNumber c="blue">{r.estimateNumber}</DocNumber> : '手動登録'}
        />
        <FieldValue label="作成者" value={r.createdBy} />
      </SummaryGrid>

      <Tabs defaultValue="related">
        <Tabs.List>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="md">
            <Group>
              <Text size="sm" c="dimmed" w={120}>試算元</Text>
              {r.estimateNumber
                ? <DocNumber c="blue">{r.estimateNumber}</DocNumber>
                : <Text size="sm" c="dimmed">手動登録</Text>}
            </Group>

            <Stack gap="xs">
              <Text size="sm" c="dimmed">この価格表から作成した見積書</Text>
              <Table withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>見積番号</Table.Th>
                    <Table.Th ta="right">数量</Table.Th>
                    <Table.Th ta="right">金額</Table.Th>
                    <Table.Th>状態</Table.Th>
                    <Table.Th>作成日</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {MOCK_QUOTES.map((q) => (
                    <Table.Tr key={q.id}>
                      <Table.Td><DocNumber c="blue">{q.quoteNumber}</DocNumber></Table.Td>
                      <Table.Td ta="right">{q.quantity} 本</Table.Td>
                      <Table.Td><MoneyText value={q.amount} /></Table.Td>
                      <Table.Td><StatusBadge entity="Quote" status={q.status} /></Table.Td>
                      <Table.Td>{formatDate(q.createdAt)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={MOCK_AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <DeletePriceListModal opened={deleteOpen} onClose={() => setDeleteOpen(false)} productName={r.productName} />
      <DuplicatePriceListModal opened={duplicateOpen} onClose={() => setDuplicateOpen(false)} productName={r.productName} unitPrice={r.unitPrice} />
      <CreateQuoteModal
        opened={createQuoteOpen}
        onClose={() => setCreateQuoteOpen(false)}
        customerName={r.customerName}
        productName={r.productName}
        unitPrice={r.unitPrice}
        minQuantity={r.minQuantity}
      />
    </DetailShell>
  );
}
