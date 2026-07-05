'use client';

import { useState } from 'react';
import { Group, Stack, Table, Tabs, Text } from '@mantine/core';
import { IconCopy, IconRuler2, IconX } from '@tabler/icons-react';
import { DocNumber, FieldValue, formatDate, formatDateTime, MoneyText } from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import {
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
  type AuditEntry,
} from '../../lib/shells';
import { PdfAttachmentPanel, type PdfFileMeta } from '../../lib/pdf-panel';
import { ORDER_TYPE_LABEL } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';
import { CancelQuoteModal } from './_modals/cancel';
import { IssueQuoteModal } from './_modals/issue';

const MOCK = {
  quoteNumber: 'QOT-202606-00001',
  status: 'ISSUED',
  customerName: '株式会社ABC製作所',
  branchName: '東京本社',
  validUntil: '2026-07-15',
  createdBy: '鈴木 一郎',
  createdAt: '2026-06-03 09:15',
  updatedAt: '2026-06-05 14:30',
  notes: '納期厳守でお願いします。',
};

// 発行時に保存された PDF（quotes.pdf_file_id → files）。DRAFT の間は null。
const MOCK_PDF: PdfFileMeta | null = {
  filename: 'QOT-202606-00001.pdf',
  sizeBytes: 182_400,
  generatedAt: '2026-06-05 14:30',
  generatedBy: '鈴木 一郎',
};

// 明細は価格表（試算から登録した単価）から自動生成（priceListRef = 適用価格表）
const MOCK_ITEMS = [
  { id: '1', productName: '精密軸 PRD-2601-0001', orderType: 'PRODUCTION', quantity: 50, unitPrice: 5000, discountAmount: 10000, amount: 240000, deliveryDate: '2026-07-10', priceListRef: '1〜99本 ¥5,000' },
  { id: '2', productName: 'ロッド PRD-2602-0008', orderType: 'TEST', quantity: 5, unitPrice: 6200, discountAmount: 0, amount: 31000, deliveryDate: null, priceListRef: null },
];

const MOCK_AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '鈴木', at: '2026-06-05 14:30', detail: 'ステータス: DRAFT → ISSUED（PDF 生成・保存）' },
  { id: 2, action: 'CREATE', user: '鈴木', at: '2026-06-03 09:15', detail: '価格表から見積書を作成' },
];

const totalAmount = MOCK_ITEMS.reduce((s, i) => s + i.amount, 0);

export default function QuoteDetailPage() {
  const isMobile = useIsMobile();
  const q = MOCK;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', '販売', '見積書', q.quoteNumber]}
      title={q.quoteNumber}
      status={<StatusBadge entity="Quote" status={q.status} />}
      createdAt={formatDateTime(q.createdAt)}
      updatedAt={formatDateTime(q.updatedAt)}
      actions={
        <ResourceActions
          onEdit={() => {}}
          pdf={{ label: 'PDF' }}
          menuItems={[
            { label: '発行', onClick: () => setIssueOpen(true) },
            { label: '設計依頼書を作成', icon: <IconRuler2 size={14} /> },
            { label: 'コピーして新規作成', icon: <IconCopy size={14} /> },
            { label: 'キャンセル', icon: <IconX size={14} />, color: 'red', divider: true, onClick: () => setCancelOpen(true) },
          ]}
        />
      }
    >
      <SummaryGrid>
        <FieldValue label="見積番号" value={<DocNumber>{q.quoteNumber}</DocNumber>} />
        <FieldValue label="顧客" value={q.customerName} />
        <FieldValue label="支店" value={q.branchName} />
        <FieldValue label="有効期限" value={formatDate(q.validUntil)} />
        <FieldValue label="作成者" value={q.createdBy} />
        <FieldValue label="合計金額" value={<MoneyText value={totalAmount} ta="left" />} />
        <FieldValue label="備考" value={q.notes} />
      </SummaryGrid>

      <Tabs defaultValue="items">
        <Tabs.List>
          <Tabs.Tab value="items">明細</Tabs.Tab>
          <Tabs.Tab value="pdf">PDF</Tabs.Tab>
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
                <Table.Th ta="right">値引き</Table.Th>
                <Table.Th ta="right">金額</Table.Th>
                {!isMobile && <Table.Th>納期</Table.Th>}
                {!isMobile && <Table.Th>適用価格表</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {MOCK_ITEMS.map((i) => (
                <Table.Tr key={i.id}>
                  <Table.Td>{i.productName}</Table.Td>
                  <Table.Td>{ORDER_TYPE_LABEL[i.orderType]}</Table.Td>
                  <Table.Td ta="right">{i.quantity} 本</Table.Td>
                  <Table.Td><MoneyText value={i.unitPrice} /></Table.Td>
                  <Table.Td>{i.discountAmount > 0 ? <MoneyText value={-i.discountAmount} /> : <Text size="sm" ta="right" c="dimmed">—</Text>}</Table.Td>
                  <Table.Td><MoneyText value={i.amount} /></Table.Td>
                  {!isMobile && <Table.Td>{i.deliveryDate ? formatDate(i.deliveryDate) : '—'}</Table.Td>}
                  {!isMobile && (
                    <Table.Td>
                      {i.priceListRef
                        ? <Text size="xs" c="dimmed" ff="mono">{i.priceListRef}</Text>
                        : <Text size="xs" c="orange">手動入力</Text>}
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td colSpan={5} ta="right"><Text size="sm" c="dimmed" fw={500}>合計金額</Text></Table.Td>
                <Table.Td><MoneyText value={totalAmount} /></Table.Td>
                {!isMobile && <Table.Td colSpan={2} />}
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Tabs.Panel>

        {/* 発行時に保存された PDF（quotes.pdf_file_id）をインライン閲覧 */}
        <Tabs.Panel value="pdf" pt="md">
          <PdfAttachmentPanel
            file={MOCK_PDF}
            previewSrc="/pdf-templates/quote.html"
            emptyMessage="PDF は未生成です。発行すると PDF が生成・保存されます。"
            onRegenerate={() => {}}
          />
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="xs">
            <Group>
              <Text size="sm" c="dimmed" w={120}>試算</Text>
              <DocNumber c="blue">EST-202606-00012</DocNumber>
            </Group>
            <Group>
              <Text size="sm" c="dimmed" w={120}>価格表</Text>
              <Text size="sm">株式会社ABC製作所 × 精密軸 PRD-2601-0001（1〜99本 ¥5,000）</Text>
            </Group>
            <Group>
              <Text size="sm" c="dimmed" w={120}>注文受諾書</Text>
              <DocNumber c="blue">ORD-202606-00001</DocNumber>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={MOCK_AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <CancelQuoteModal opened={cancelOpen} onClose={() => setCancelOpen(false)} quoteNumber={q.quoteNumber} />
      <IssueQuoteModal opened={issueOpen} onClose={() => setIssueOpen(false)} quoteNumber={q.quoteNumber} />
    </DetailShell>
  );
}
