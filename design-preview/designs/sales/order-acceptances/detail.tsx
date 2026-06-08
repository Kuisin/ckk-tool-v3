'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Center,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconFileTypePdf,
  IconScale,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import {
  DocNumber,
  FieldValue,
  formatDateTime,
  MoneyText,
} from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import {
  AuditTimeline,
  DetailShell,
  ResourceActions,
  type AuditEntry,
} from '../../lib/shells';
import { ORDER_TYPE_LABEL } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';
import { CancelOrderAcceptanceModal } from './_modals/cancel';
import { ConfirmOrderAcceptanceModal } from './_modals/confirm';
import { PriceDiffModal } from './_modals/price-diff';
import { UploadOrderModal } from './_modals/upload-order';

const MOCK = {
  orderNumber: 'ORD-202606-00002',
  status: 'PRICE_DIFF',
  customerName: '合同会社XYZ工業',
  branchName: '—',
  customerOrderRef: 'XYZ-20260604-01',
  totalAmount: 186000,
  quotedTotal: 180000,
  createdBy: '田中 太郎',
  createdAt: '2026-06-04 10:20',
  updatedAt: '2026-06-04 16:45',
  orderDocFileName: 'order-XYZ-20260604-01.pdf',
};

const MOCK_ITEMS = [
  { id: '1', productName: 'ロッド PRD-2602-0008', orderType: 'PRODUCTION', quantity: 30, unitPrice: 6200, amount: 186000 },
];

const MOCK_AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '田中', at: '2026-06-04 16:45', detail: 'ステータス: PENDING → PRICE_DIFF' },
  { id: 2, action: 'CREATE', user: '田中', at: '2026-06-04 10:20', detail: '注文受諾書を作成' },
];

const totalAmount = MOCK_ITEMS.reduce((s, i) => s + i.amount, 0);

export default function OrderAcceptanceDetailPage() {
  const isMobile = useIsMobile();
  const o = MOCK;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [priceDiffOpen, setPriceDiffOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const pdfPreview = (
    <Paper withBorder p="md" radius="md">
      <Text size="sm" fw={600} mb="sm">受領した注文書</Text>
      <Center
        h={isMobile ? 200 : 320}
        style={{
          border: '1px dashed var(--mantine-color-gray-4)',
          borderRadius: 'var(--mantine-radius-sm)',
          backgroundColor: 'var(--mantine-color-gray-0)',
        }}
      >
        <Stack align="center" gap="xs">
          <ThemeIcon size="xl" variant="light" color="gray">
            <IconFileTypePdf size={28} />
          </ThemeIcon>
          <Text size="xs" c="dimmed">{o.orderDocFileName}</Text>
          <Button variant="subtle" size="xs" leftSection={<IconFileTypePdf size={14} />}>
            PDFを開く
          </Button>
        </Stack>
      </Center>
    </Paper>
  );

  return (
    <DetailShell
      breadcrumbs={['ホーム', '販売', '注文受諾書', o.orderNumber]}
      title={o.orderNumber}
      status={<StatusBadge entity="OrderAcceptance" status={o.status} />}
      createdAt={formatDateTime(o.createdAt)}
      updatedAt={formatDateTime(o.updatedAt)}
      actions={
        <ResourceActions
          onEdit={() => {}}
          pdf={{ label: 'PDF' }}
          menuItems={[
            { label: '注文書PDFをアップロード', icon: <IconUpload size={14} />, onClick: () => setUploadOpen(true) },
            { label: '価格差異の再調整', icon: <IconScale size={14} />, onClick: () => setPriceDiffOpen(true) },
            { label: '確定', icon: <IconCheck size={14} />, onClick: () => setConfirmOpen(true) },
            { label: 'コピーして新規作成', icon: <IconCopy size={14} /> },
            { label: 'キャンセル', icon: <IconX size={14} />, color: 'red', divider: true, onClick: () => setCancelOpen(true) },
          ]}
        />
      }
    >
      {o.status === 'PRICE_DIFF' && (
        <Alert color="orange" icon={<IconAlertTriangle size={16} />} title="価格差異あり">
          見積金額と顧客注文書の金額に差異があります。価格を再調整してください。
        </Alert>
      )}

      <SimpleGrid cols={isMobile ? 1 : 2} spacing="md">
        <Paper withBorder p="md" radius="md">
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="md">
            <FieldValue label="注文番号" value={<DocNumber>{o.orderNumber}</DocNumber>} />
            <FieldValue label="顧客" value={o.customerName} />
            <FieldValue label="支店" value={o.branchName} />
            <FieldValue label="顧客注文書番号" value={o.customerOrderRef} />
            <FieldValue label="合計金額" value={<MoneyText value={o.totalAmount} ta="left" />} />
            <FieldValue label="作成者" value={o.createdBy} />
          </SimpleGrid>
        </Paper>
        {pdfPreview}
      </SimpleGrid>

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
                <Table.Th>注文種別</Table.Th>
                <Table.Th ta="right">数量</Table.Th>
                <Table.Th ta="right">単価</Table.Th>
                <Table.Th ta="right">金額</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {MOCK_ITEMS.map((i) => (
                <Table.Tr key={i.id}>
                  <Table.Td>{i.productName}</Table.Td>
                  <Table.Td>{ORDER_TYPE_LABEL[i.orderType]}</Table.Td>
                  <Table.Td ta="right">{i.quantity} 本</Table.Td>
                  <Table.Td><MoneyText value={i.unitPrice} /></Table.Td>
                  <Table.Td><MoneyText value={i.amount} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td colSpan={4} ta="right">
                  <Text size="sm" c="dimmed" fw={500}>合計金額</Text>
                </Table.Td>
                <Table.Td><MoneyText value={totalAmount} /></Table.Td>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="xs">
            <Group>
              <Text size="sm" c="dimmed" w={120}>見積書</Text>
              <DocNumber c="blue">QOT-202606-00002</DocNumber>
            </Group>
            <Group>
              <Text size="sm" c="dimmed" w={120}>受注書</Text>
              <DocNumber c="blue">ORD-202606-00002-01</DocNumber>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={MOCK_AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <UploadOrderModal opened={uploadOpen} onClose={() => setUploadOpen(false)} orderNumber={o.orderNumber} currentFileName={o.orderDocFileName} />
      <PriceDiffModal opened={priceDiffOpen} onClose={() => setPriceDiffOpen(false)} orderNumber={o.orderNumber} quotedTotal={o.quotedTotal} orderedTotal={o.totalAmount} />
      <ConfirmOrderAcceptanceModal opened={confirmOpen} onClose={() => setConfirmOpen(false)} orderNumber={o.orderNumber} />
      <CancelOrderAcceptanceModal opened={cancelOpen} onClose={() => setCancelOpen(false)} orderNumber={o.orderNumber} />
    </DetailShell>
  );
}
