'use client';

import { useState } from 'react';
import { Alert, Divider, Group, Stack, Table, Tabs, Text } from '@mantine/core';
import { IconFileExport, IconInfoCircle } from '@tabler/icons-react';
import {
  DocNumber,
  FieldValue,
  formatDate,
  formatDateTime,
  formatMoney,
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
import { useIsMobile } from '../../lib/viewport-context';
import { YayoiExportClosingModal } from './_modals/yayoi-export';

const CL = {
  customerName: '株式会社ABC製作所',
  closingDate: '2026-05-31',
  status: 'EXPORTED',
  totalAmount: 1485000,
  processedAt: '2026-06-01 02:00',
  processedBy: 'システム（BullMQ 月次バッチ）',
  yayoiExportedAt: '2026-06-02 09:00',
  createdAt: '2026-06-01 02:00',
};

// 対象出荷（発送レコード — 在庫保管分は対象外）
const SHIPMENTS = [
  { id: '1', shippingOrderNumber: 'SHP-202605-0018', deliveryNumber: 'DRN-202605-00007', productName: '精密軸 PRD-202601-0001', quantity: 200, amount: 1000000 },
  { id: '2', shippingOrderNumber: 'SHP-202605-0019', deliveryNumber: 'DRN-202605-00008', productName: 'ロッド PRD-202602-0008', quantity: 70, amount: 350000 },
];

const shipmentTotal = SHIPMENTS.reduce((s, it) => s + it.amount, 0);
const GENERATED_INVOICE = 'INV-202605-00008';

const AUDIT: AuditEntry[] = [
  { id: 1, action: 'EXPORT', user: '佐藤 工場長', at: '2026-06-02 09:00', detail: '弥生会計 Next CSV エクスポート（ステータス: PROCESSED → EXPORTED）' },
  { id: 2, action: 'UPDATE', user: 'システム', at: '2026-06-01 02:00', detail: '対象発送レコードを集計・請求書を生成（INV-202605-00008）' },
  { id: 3, action: 'CREATE', user: 'システム', at: '2026-06-01 02:00', detail: '締日処理を作成（月次バッチ）' },
];

export default function ClosingDetailPage() {
  const isMobile = useIsMobile();
  const alreadyExported = Boolean(CL.yayoiExportedAt);
  const [yayoiOpen, setYayoiOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', '請求', '締日処理', `${CL.customerName} 2026/05/31 締`]}
      title="締日処理"
      status={<StatusBadge entity="BillingClosing" status={CL.status} />}
      createdAt={formatDateTime(CL.createdAt)}
      updatedAt={formatDateTime(CL.processedAt)}
      actions={
        <ResourceActions
          menuItems={[
            { label: '弥生CSVエクスポート', icon: <IconFileExport size={14} />, onClick: () => setYayoiOpen(true) },
          ]}
        />
      }
    >
      {/* 二重エクスポート防止 notice */}
      {alreadyExported && (
        <Alert color="green" icon={<IconInfoCircle size={16} />} variant="light">
          弥生会計 Next へ {formatDateTime(CL.yayoiExportedAt)} にエクスポート済みです。二重エクスポートは仕訳の重複計上につながるため注意してください。
        </Alert>
      )}

      <SummaryGrid>
        <FieldValue label="顧客" value={CL.customerName} />
        <FieldValue label="締日" value={formatDate(CL.closingDate)} />
        <FieldValue
          label="合計金額"
          value={
            <Text fw={700} ff="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(CL.totalAmount)}</Text>
          }
        />
        <FieldValue label="処理日時" value={formatDateTime(CL.processedAt)} />
        <FieldValue label="処理者" value={CL.processedBy} />
        <FieldValue label="弥生エクスポート日時" value={formatDateTime(CL.yayoiExportedAt)} />
      </SummaryGrid>

      <Tabs defaultValue="shipments">
        <Tabs.List>
          <Tabs.Tab value="shipments">対象出荷</Tabs.Tab>
          <Tabs.Tab value="invoice">請求書</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="shipments" pt="md">
          <Text size="xs" c="dimmed" mb="xs">
            発送レコードのみ集計対象です（在庫保管分は請求フロー外）。
          </Text>
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>出荷書番号</Table.Th>
                {!isMobile && <Table.Th>納品書番号</Table.Th>}
                <Table.Th>製品</Table.Th>
                <Table.Th ta="right">数量</Table.Th>
                <Table.Th ta="right">金額</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {SHIPMENTS.map((it) => (
                <Table.Tr key={it.id}>
                  <Table.Td><DocNumber c="blue">{it.shippingOrderNumber}</DocNumber></Table.Td>
                  {!isMobile && <Table.Td><DocNumber c="blue">{it.deliveryNumber}</DocNumber></Table.Td>}
                  <Table.Td>{it.productName}</Table.Td>
                  <Table.Td ta="right">{it.quantity} 本</Table.Td>
                  <Table.Td><MoneyText value={it.amount} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td colSpan={isMobile ? 3 : 4} ta="right"><Text size="sm" fw={600}>合計</Text></Table.Td>
                <Table.Td>
                  <Text fw={700} ta="right" ff="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(shipmentTotal)}</Text>
                </Table.Td>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="invoice" pt="md">
          <Stack gap="sm">
            <Group>
              <Text size="sm" c="dimmed" w={120}>生成された請求書</Text>
              <DocNumber c="blue">{GENERATED_INVOICE}</DocNumber>
            </Group>
            <Divider />
            <Group>
              <Text size="sm" c="dimmed" w={120}>請求金額</Text>
              <MoneyText value={CL.totalAmount} ta="left" />
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <YayoiExportClosingModal
        opened={yayoiOpen}
        onClose={() => setYayoiOpen(false)}
        customerName={CL.customerName}
        closingDate={formatDate(CL.closingDate)}
        alreadyExportedAt={alreadyExported ? formatDateTime(CL.yayoiExportedAt) : null}
      />
    </DetailShell>
  );
}
