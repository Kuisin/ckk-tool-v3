'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconCheck,
  IconCopy,
  IconFileTypePdf,
  IconLock,
  IconX,
} from '@tabler/icons-react';
import {
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
import { useIsMobile } from '../../lib/viewport-context';
import { CancelSalesOrderModal } from './_modals/cancel';
import { ConfirmSalesOrderModal } from './_modals/confirm';
import { CopySalesOrderModal } from './_modals/copy';
import { LockNoticeModal } from './_modals/lock-notice';

const SO = {
  salesOrderNumber: 'ORD-202601-00001-01',
  status: 'CONFIRMED',
  isLocked: true, // 承認依頼中のロック
  customerName: '株式会社ABC製作所',
  branchName: '東京本社',
  productName: '精密軸 PRD-2601-0001',
  lotNumber: 1042,
  orderType: 'PRODUCTION',
  quantity: 50,
  unitPrice: 5000,
  amount: 250000,
  deliveryDate: '2026-06-15',
  endUserName: '日本重工業株式会社',
  customerOrderRef: 'PO-ABC-2026-0345',
  createdBy: '鈴木 一郎',
  createdAt: '2026-05-20 09:15',
  updatedAt: '2026-05-28 14:30',
};

const RELATED = {
  orderAcceptance: 'ORD-202601-00001',
  workOrders: [1042, 1043],
};

const AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '鈴木 一郎', at: '2026-05-28 14:30', detail: 'ステータス: DRAFT → CONFIRMED' },
  { id: 2, action: 'UPDATE', user: '鈴木 一郎', at: '2026-05-22 11:00', detail: '数量: 40 → 50' },
  { id: 3, action: 'CREATE', user: '鈴木 一郎', at: '2026-05-20 09:15', detail: '受注書を作成' },
];

export default function SalesOrderDetailPage() {
  const isMobile = useIsMobile();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);

  // 注文書PDF サイドパネル placeholder（bespoke — kept inline）
  const orderDocPanel = (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={5}>受領注文書</Title>
        <ThemeIcon variant="light" color="pink" size="md" radius="sm">
          <IconFileTypePdf size={16} />
        </ThemeIcon>
      </Group>
      <Box
        h={isMobile ? 180 : 320}
        style={{
          border: '1px dashed var(--mantine-color-default-border)',
          borderRadius: 'var(--mantine-radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--mantine-color-gray-0)',
        }}
      >
        <Stack align="center" gap={4}>
          <IconFileTypePdf size={40} color="var(--mantine-color-gray-5)" />
          <Text size="xs" c="dimmed">注文書プレビュー（FAX 受領）</Text>
          <DocNumber c="dimmed">{SO.customerOrderRef}</DocNumber>
        </Stack>
      </Box>
      <Button variant="light" size="xs" fullWidth mt="sm" leftSection={<IconFileTypePdf size={14} />}>
        注文書を開く
      </Button>
    </Paper>
  );

  const summary = (
    <SummaryGrid>
      <FieldValue label="受注番号" value={<DocNumber>{SO.salesOrderNumber}</DocNumber>} />
      <FieldValue label="顧客" value={SO.customerName} />
      <FieldValue label="支店" value={SO.branchName} />
      <FieldValue label="製品" value={SO.productName} />
      <FieldValue label="ロット番号" value={<DocNumber>{SO.lotNumber}</DocNumber>} />
      <FieldValue label="注文種別" value="本番" />
      <FieldValue label="数量" value={`${SO.quantity} 本`} />
      <FieldValue label="単価" value={<MoneyText value={SO.unitPrice} ta="left" />} />
      <FieldValue label="金額" value={<MoneyText value={SO.amount} ta="left" />} />
      <FieldValue label="納期" value={formatDate(SO.deliveryDate)} />
      <FieldValue label="最終需要家" value={SO.endUserName} />
      <FieldValue label="顧客注文書番号" value={<DocNumber>{SO.customerOrderRef}</DocNumber>} />
    </SummaryGrid>
  );

  return (
    <DetailShell
      breadcrumbs={['ホーム', '生産', '受注書', SO.salesOrderNumber]}
      title={`受注書 ${SO.salesOrderNumber}`}
      status={<StatusBadge entity="SalesOrder" status={SO.status} />}
      createdAt={`${formatDateTime(SO.createdAt)}（${SO.createdBy}）`}
      updatedAt={formatDateTime(SO.updatedAt)}
      actions={
        <ResourceActions
          onEdit={SO.isLocked ? () => setLockOpen(true) : () => {}}
          pdf={{ label: 'PDF' }}
          menuItems={[
            ...(SO.status === 'DRAFT'
              ? [{ label: '確定', icon: <IconCheck size={14} />, onClick: () => setConfirmOpen(true) }]
              : []),
            { label: 'コピーして新規作成', icon: <IconCopy size={14} />, onClick: () => setCopyOpen(true) },
            { label: 'キャンセル', icon: <IconX size={14} />, color: 'red', divider: true, onClick: () => setCancelOpen(true) },
          ]}
        />
      }
    >
      {SO.isLocked && (
        <Alert color="orange" icon={<IconLock size={16} />} title="承認依頼中のためロック中">
          この受注書は生産判断の承認依頼中です。承認が完了するまで受注数量・製品品目は変更できません。
        </Alert>
      )}

      {isMobile ? (
        <Stack gap="md">
          {summary}
          {orderDocPanel}
        </Stack>
      ) : (
        <Group align="stretch" gap="md" wrap="nowrap">
          <Box style={{ flex: 2, minWidth: 0 }}>{summary}</Box>
          <Box style={{ flex: 1, minWidth: 0 }}>{orderDocPanel}</Box>
        </Group>
      )}

      <Tabs defaultValue="items">
        <Tabs.List>
          <Tabs.Tab value="items">明細</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="items" pt="md">
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>製品</Table.Th>
                <Table.Th>注文種別</Table.Th>
                <Table.Th ta="right">数量</Table.Th>
                <Table.Th ta="right">単価</Table.Th>
                <Table.Th ta="right">金額</Table.Th>
                <Table.Th>納期</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>{SO.productName}</Table.Td>
                <Table.Td>本番</Table.Td>
                <Table.Td ta="right">{SO.quantity} 本</Table.Td>
                <Table.Td><MoneyText value={SO.unitPrice} /></Table.Td>
                <Table.Td><MoneyText value={SO.amount} /></Table.Td>
                <Table.Td>{formatDate(SO.deliveryDate)}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="sm">
            <Group>
              <Text size="sm" c="dimmed" w={120}>注文受諾書</Text>
              <DocNumber c="blue">{RELATED.orderAcceptance}</DocNumber>
            </Group>
            <Divider />
            <Group align="flex-start">
              <Text size="sm" c="dimmed" w={120}>指示書</Text>
              <Stack gap={4}>
                {RELATED.workOrders.map((wo) => (
                  <DocNumber key={wo} c="blue">指示書 #{wo}</DocNumber>
                ))}
              </Stack>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <CancelSalesOrderModal opened={cancelOpen} onClose={() => setCancelOpen(false)} salesOrderNumber={SO.salesOrderNumber} />
      <ConfirmSalesOrderModal opened={confirmOpen} onClose={() => setConfirmOpen(false)} salesOrderNumber={SO.salesOrderNumber} />
      <CopySalesOrderModal opened={copyOpen} onClose={() => setCopyOpen(false)} salesOrderNumber={SO.salesOrderNumber} />
      <LockNoticeModal opened={lockOpen} onClose={() => setLockOpen(false)} salesOrderNumber={SO.salesOrderNumber} />
    </DetailShell>
  );
}
