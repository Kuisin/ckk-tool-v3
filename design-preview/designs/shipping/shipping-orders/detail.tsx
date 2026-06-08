'use client';

import { useState } from 'react';
import { Badge, Divider, Group, Stack, Table, Tabs, Text } from '@mantine/core';
import { IconCircleCheck, IconCopy, IconTruckDelivery, IconX } from '@tabler/icons-react';
import { DocNumber, FieldValue, formatDateTime } from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import {
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
  type AuditEntry,
} from '../../lib/shells';
import { useIsMobile } from '../../lib/viewport-context';
import { ConfirmShippingOrderModal } from './_modals/confirm';
import { ShipShippingOrderModal } from './_modals/ship';
import { CancelShippingOrderModal } from './_modals/cancel';

const SH = {
  shippingOrderNumber: 'SHP-202606-0007',
  status: 'SHIPPED',
  type: 'DISPATCH',
  salesOrderNumber: 'ORD-202601-00001-01',
  customerName: '株式会社ABC製作所',
  workOrderNumber: 1042,
  shippedAt: '2026-06-04 10:30',
  createdBy: '鈴木 一郎',
  createdAt: '2026-06-02 09:15',
  updatedAt: '2026-06-04 10:30',
  notes: '客先指定の梱包仕様にて出荷',
};

const TYPE_LABEL: Record<string, string> = {
  STOCK_STORAGE: '在庫保管',
  DISPATCH: '発送',
};

const ITEMS = [
  { id: '1', productName: '精密軸 PRD-2601-0001', lotNumber: 1042, quantity: 50, notes: '—' },
  { id: '2', productName: '精密軸 PRD-2601-0001', lotNumber: 1045, quantity: 20, notes: '予備' },
];

const RELATED = {
  salesOrder: 'ORD-202601-00001-01',
  workOrder: 1042,
  deliveryNote: 'DRN-202606-00012',
};

const AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '鈴木 一郎', at: '2026-06-04 10:30', detail: 'ステータス: CONFIRMED → SHIPPED（在庫台帳を出荷確定更新）' },
  { id: 2, action: 'UPDATE', user: '鈴木 一郎', at: '2026-06-02 14:00', detail: 'ステータス: DRAFT → CONFIRMED' },
  { id: 3, action: 'CREATE', user: '鈴木 一郎', at: '2026-06-02 09:15', detail: '出荷書を作成' },
];

export default function ShippingOrderDetailPage() {
  const isMobile = useIsMobile();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', '出荷', '出荷書', SH.shippingOrderNumber]}
      title={`出荷書 ${SH.shippingOrderNumber}`}
      status={<StatusBadge entity="ShippingOrder" status={SH.status} />}
      createdAt={formatDateTime(SH.createdAt)}
      updatedAt={formatDateTime(SH.updatedAt)}
      actions={
        <ResourceActions
          onEdit={() => {}}
          pdf={{ label: 'PDF' }}
          menuItems={[
            { label: '確定', icon: <IconCircleCheck size={14} />, onClick: () => setConfirmOpen(true) },
            { label: '出荷確定', icon: <IconTruckDelivery size={14} />, onClick: () => setShipOpen(true) },
            { label: 'コピーして新規作成', icon: <IconCopy size={14} /> },
            { label: 'キャンセル', icon: <IconX size={14} />, color: 'red', divider: true, onClick: () => setCancelOpen(true) },
          ]}
        />
      }
    >
      <SummaryGrid>
        <FieldValue label="出荷書番号" value={<DocNumber>{SH.shippingOrderNumber}</DocNumber>} />
        <FieldValue label="受注番号" value={<DocNumber>{SH.salesOrderNumber}</DocNumber>} />
        <FieldValue label="顧客" value={SH.customerName} />
        <FieldValue
          label="種別"
          value={
            <Badge variant="light" color={SH.type === 'STOCK_STORAGE' ? 'gray' : 'orange'}>
              {TYPE_LABEL[SH.type]}
            </Badge>
          }
        />
        <FieldValue label="指示書" value={<DocNumber>指示書 #{SH.workOrderNumber}</DocNumber>} />
        <FieldValue label="出荷日時" value={formatDateTime(SH.shippedAt)} />
        <FieldValue label="作成者" value={SH.createdBy} />
        <FieldValue label="備考" value={SH.notes} />
      </SummaryGrid>

      <Tabs defaultValue="items">
        <Tabs.List>
          <Tabs.Tab value="items">明細</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="items" pt="md">
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>製品</Table.Th>
                <Table.Th>ロット番号</Table.Th>
                <Table.Th ta="right">数量</Table.Th>
                {!isMobile && <Table.Th>備考</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {ITEMS.map((it) => (
                <Table.Tr key={it.id}>
                  <Table.Td>{it.productName}</Table.Td>
                  <Table.Td><DocNumber>{it.lotNumber}</DocNumber></Table.Td>
                  <Table.Td ta="right">{it.quantity} 本</Table.Td>
                  {!isMobile && <Table.Td>{it.notes}</Table.Td>}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="sm">
            <Group>
              <Text size="sm" c="dimmed" w={120}>受注書</Text>
              <DocNumber c="blue">{RELATED.salesOrder}</DocNumber>
            </Group>
            <Divider />
            <Group>
              <Text size="sm" c="dimmed" w={120}>指示書</Text>
              <DocNumber c="blue">指示書 #{RELATED.workOrder}</DocNumber>
            </Group>
            <Divider />
            <Group>
              <Text size="sm" c="dimmed" w={120}>納品書</Text>
              <DocNumber c="blue">{RELATED.deliveryNote}</DocNumber>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <ConfirmShippingOrderModal opened={confirmOpen} onClose={() => setConfirmOpen(false)} shippingOrderNumber={SH.shippingOrderNumber} />
      <ShipShippingOrderModal opened={shipOpen} onClose={() => setShipOpen(false)} shippingOrderNumber={SH.shippingOrderNumber} />
      <CancelShippingOrderModal opened={cancelOpen} onClose={() => setCancelOpen(false)} shippingOrderNumber={SH.shippingOrderNumber} />
    </DetailShell>
  );
}
