'use client';

import { useState } from 'react';
import { Badge, Group, Stack, Table, Tabs, Text } from '@mantine/core';
import { IconCircleCheck, IconCopy, IconSend, IconX } from '@tabler/icons-react';
import { DocNumber, FieldValue, formatDateTime, formatMoney, MoneyText } from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import {
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
  type AuditEntry,
} from '../../lib/shells';
import { useIsMobile } from '../../lib/viewport-context';
import { IssueDeliveryNoteModal } from './_modals/issue';
import { DeliverDeliveryNoteModal } from './_modals/deliver';
import { CancelDeliveryNoteModal } from './_modals/cancel';

const DN = {
  deliveryNumber: 'DRN-202606-00012',
  status: 'DELIVERED',
  method: 'NORMAL',
  shippingOrderNumber: 'SHP-202606-0007',
  recipientName: '株式会社ABC製作所',
  recipientBranchName: '東京本社',
  endUserName: '—',
  includePrice: true,
  deliveredAt: '2026-06-05 13:00',
  createdBy: '鈴木 一郎',
  createdAt: '2026-06-04 11:00',
  updatedAt: '2026-06-05 13:00',
};

const METHOD_LABEL: Record<string, string> = {
  DIRECT_TO_USER: 'ユーザー直送',
  NORMAL: '通常納品',
};

const ITEMS = [
  { id: '1', productName: '精密軸 PRD-2601-0001', quantity: 50, unitPrice: 5000, amount: 250000 },
  { id: '2', productName: '精密軸 PRD-2601-0001', quantity: 20, unitPrice: 5000, amount: 100000 },
];

const totalAmount = ITEMS.reduce((s, it) => s + it.amount, 0);

const AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '鈴木 一郎', at: '2026-06-05 13:00', detail: 'ステータス: ISSUED → DELIVERED' },
  { id: 2, action: 'UPDATE', user: '鈴木 一郎', at: '2026-06-04 11:30', detail: 'ステータス: DRAFT → ISSUED（PDF生成）' },
  { id: 3, action: 'CREATE', user: '鈴木 一郎', at: '2026-06-04 11:00', detail: '納品書を作成' },
];

export default function DeliveryNoteDetailPage() {
  const isMobile = useIsMobile();
  const [issueOpen, setIssueOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', '出荷', '納品書', DN.deliveryNumber]}
      title={`納品書 ${DN.deliveryNumber}`}
      status={<StatusBadge entity="DeliveryNote" status={DN.status} />}
      createdAt={formatDateTime(DN.createdAt)}
      updatedAt={formatDateTime(DN.updatedAt)}
      actions={
        <ResourceActions
          onEdit={() => {}}
          pdf={{ label: 'PDF' }}
          menuItems={[
            { label: '発行', icon: <IconSend size={14} />, onClick: () => setIssueOpen(true) },
            { label: '納品完了', icon: <IconCircleCheck size={14} />, onClick: () => setDeliverOpen(true) },
            { label: 'コピーして新規作成', icon: <IconCopy size={14} /> },
            { label: 'キャンセル', icon: <IconX size={14} />, color: 'red', divider: true, onClick: () => setCancelOpen(true) },
          ]}
        />
      }
    >
      <SummaryGrid>
        <FieldValue label="納品番号" value={<DocNumber>{DN.deliveryNumber}</DocNumber>} />
        <FieldValue label="出荷書番号" value={<DocNumber>{DN.shippingOrderNumber}</DocNumber>} />
        <FieldValue
          label="配送方法"
          value={
            <Badge variant="light" color={DN.method === 'DIRECT_TO_USER' ? 'violet' : 'gray'}>
              {METHOD_LABEL[DN.method]}
            </Badge>
          }
        />
        <FieldValue label="納品先" value={DN.recipientName} />
        <FieldValue label="納品先支店" value={DN.recipientBranchName} />
        <FieldValue label="最終需要家" value={DN.endUserName} />
        <FieldValue
          label="価格記載"
          value={
            <Badge variant="light" color={DN.includePrice ? 'blue' : 'gray'}>
              {DN.includePrice ? '記載あり' : '記載なし'}
            </Badge>
          }
        />
        <FieldValue label="納品日時" value={formatDateTime(DN.deliveredAt)} />
        <FieldValue label="作成者" value={DN.createdBy} />
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
                <Table.Th ta="right">数量</Table.Th>
                <Table.Th ta="right">単価</Table.Th>
                <Table.Th ta="right">金額</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {ITEMS.map((it) => (
                <Table.Tr key={it.id}>
                  <Table.Td>{it.productName}</Table.Td>
                  <Table.Td ta="right">{it.quantity} 本</Table.Td>
                  <Table.Td><MoneyText value={it.unitPrice} /></Table.Td>
                  <Table.Td><MoneyText value={it.amount} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td colSpan={3} ta="right"><Text size="sm" fw={600}>合計</Text></Table.Td>
                <Table.Td>
                  <Text fw={700} ta="right" ff="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(totalAmount)}
                  </Text>
                </Table.Td>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="sm">
            <Group>
              <Text size="sm" c="dimmed" w={120}>出荷書</Text>
              <DocNumber c="blue">{DN.shippingOrderNumber}</DocNumber>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <IssueDeliveryNoteModal opened={issueOpen} onClose={() => setIssueOpen(false)} deliveryNumber={DN.deliveryNumber} />
      <DeliverDeliveryNoteModal opened={deliverOpen} onClose={() => setDeliverOpen(false)} deliveryNumber={DN.deliveryNumber} />
      <CancelDeliveryNoteModal opened={cancelOpen} onClose={() => setCancelOpen(false)} deliveryNumber={DN.deliveryNumber} />
    </DetailShell>
  );
}
