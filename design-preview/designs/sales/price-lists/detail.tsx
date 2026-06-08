'use client';

import { useState } from 'react';
import { Tabs } from '@mantine/core';
import { IconCopy, IconTrash } from '@tabler/icons-react';
import {
  ActiveBadge,
  FieldValue,
  formatDate,
  formatDateTime,
  MoneyText,
} from '../../lib/ui';
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
  isActive: true,
  createdBy: '鈴木 一郎',
  createdAt: '2025-12-20 09:15',
  updatedAt: '2026-01-05 14:30',
};

const MOCK_AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '鈴木', at: '2026-01-05 14:30', detail: '単価: ¥5,200 → ¥5,000' },
  { id: 2, action: 'CREATE', user: '鈴木', at: '2025-12-20 09:15', detail: '価格表を作成' },
];

export default function PriceListDetailPage() {
  const r = MOCK;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);

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
        <FieldValue label="作成者" value={r.createdBy} />
      </SummaryGrid>

      <Tabs defaultValue="history">
        <Tabs.List>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={MOCK_AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <DeletePriceListModal opened={deleteOpen} onClose={() => setDeleteOpen(false)} productName={r.productName} />
      <DuplicatePriceListModal opened={duplicateOpen} onClose={() => setDuplicateOpen(false)} productName={r.productName} unitPrice={r.unitPrice} />
    </DetailShell>
  );
}
