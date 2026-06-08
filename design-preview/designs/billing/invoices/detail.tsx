import {
  Alert,
  Button,
  Divider,
  Group,
  Menu,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Timeline,
} from '@mantine/core';
import {
  IconChevronDown,
  IconDotsVertical,
  IconFileExport,
  IconFileTypePdf,
  IconInfoCircle,
} from '@tabler/icons-react';
import {
  DocNumber,
  FieldValue,
  formatDate,
  formatDateTime,
  localized,
  MoneyText,
  PageHeader,
} from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data ────────────────────────────────────────────────────────────────
const INV = {
  invoiceNumber: 'INV-202605-00008',
  status: 'SENT',
  customerName: '株式会社ABC製作所',
  branchName: '東京本社',
  periodFrom: '2026-05-01',
  periodTo: '2026-05-31',
  subtotal: 1350000,
  taxAmount: 135000,
  totalAmount: 1485000,
  issuedAt: '2026-06-01 10:00',
  dueDate: '2026-06-30',
  sentAt: '2026-06-01 15:20',
  yayoiExportedAt: '2026-06-02 09:00',
  createdBy: '佐藤 工場長',
  createdAt: '2026-06-01 09:30',
  updatedAt: '2026-06-01 15:20',
};

const ITEMS = [
  {
    id: '1',
    shippingOrderNumber: 'SHP-202605-0018',
    deliveryNumber: 'DRN-202605-00007',
    description: { ja: '精密軸 PRD-2601-0001（5月出荷分）', en: 'Precision Shaft (May)' },
    quantity: 200,
    unitPrice: 5000,
    amount: 1000000,
  },
  {
    id: '2',
    shippingOrderNumber: 'SHP-202605-0019',
    deliveryNumber: 'DRN-202605-00008',
    description: { ja: 'ロッド PRD-2602-0008（5月出荷分）', en: 'Rod (May)' },
    quantity: 70,
    unitPrice: 5000,
    amount: 350000,
  },
];

const AUDIT = [
  { id: 1, action: 'UPDATE', user: '佐藤 工場長', at: '2026-06-01 15:20', detail: 'ステータス: ISSUED → SENT' },
  { id: 2, action: 'EXPORT', user: 'システム', at: '2026-06-02 09:00', detail: '弥生会計 Next CSV エクスポート' },
  { id: 3, action: 'UPDATE', user: 'システム', at: '2026-06-01 10:00', detail: 'ステータス: DRAFT → ISSUED（PDF生成・採番）' },
  { id: 4, action: 'CREATE', user: 'システム', at: '2026-06-01 09:30', detail: '締日処理により請求書を自動生成' },
];

export default function InvoiceDetailPage() {
  const isMobile = useIsMobile();

  const statusMenu = (
    <Menu shadow="sm">
      <Menu.Target>
        <Button variant="default" rightSection={<IconChevronDown size={14} />}>
          ステータス変更
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>請求書ステータス</Menu.Label>
        <Menu.Item>発行（ISSUED）</Menu.Item>
        <Menu.Item>送付済（SENT）</Menu.Item>
        <Menu.Item>支払済（PAID）</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  const actions = isMobile ? (
    <Menu shadow="sm" position="bottom-end">
      <Menu.Target>
        <Button variant="default" px="xs" size="sm">
          <IconDotsVertical size={16} />
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconFileTypePdf size={14} />}>PDF</Menu.Item>
        <Menu.Item leftSection={<IconFileExport size={14} />}>弥生CSVエクスポート</Menu.Item>
        <Menu.Divider />
        <Menu.Label>ステータス変更</Menu.Label>
        <Menu.Item>発行（ISSUED）</Menu.Item>
        <Menu.Item>送付済（SENT）</Menu.Item>
        <Menu.Item>支払済（PAID）</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ) : (
    <Group gap="xs" style={{ flexShrink: 0 }}>
      <Button variant="default" leftSection={<IconFileTypePdf size={14} />}>
        PDF
      </Button>
      <Button variant="default" leftSection={<IconFileExport size={14} />}>
        弥生CSV
      </Button>
      {statusMenu}
    </Group>
  );

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '請求', '請求書', INV.invoiceNumber]}
        title={`請求書 ${INV.invoiceNumber}`}
        status={<StatusBadge entity="Invoice" status={INV.status} />}
        actions={actions}
        align="flex-start"
      />

      {/* 弥生エクスポート済み notice */}
      {INV.yayoiExportedAt && (
        <Alert color="green" icon={<IconInfoCircle size={16} />} variant="light">
          弥生会計 Next へ {formatDateTime(INV.yayoiExportedAt)} にエクスポート済みです。再エクスポートは二重計上の恐れがあるため注意してください。
        </Alert>
      )}

      {/* Summary card */}
      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="請求番号" value={<DocNumber>{INV.invoiceNumber}</DocNumber>} />
          <FieldValue label="顧客" value={INV.customerName} />
          <FieldValue label="支店" value={INV.branchName} />
          <FieldValue
            label="請求期間"
            value={`${formatDate(INV.periodFrom)} 〜 ${formatDate(INV.periodTo)}`}
          />
          <FieldValue label="小計" value={<MoneyText value={INV.subtotal} ta="left" />} />
          <FieldValue label="消費税" value={<MoneyText value={INV.taxAmount} ta="left" />} />
          <FieldValue
            label="合計金額"
            value={
              <Text fw={700} ff="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(
                  INV.totalAmount,
                )}
              </Text>
            }
          />
          <FieldValue label="発行日時" value={formatDateTime(INV.issuedAt)} />
          <FieldValue label="支払期限" value={formatDate(INV.dueDate)} />
          <FieldValue label="送付日時" value={formatDateTime(INV.sentAt)} />
          <FieldValue label="弥生エクスポート日時" value={formatDateTime(INV.yayoiExportedAt)} />
        </SimpleGrid>
        {isMobile && (
          <Group gap="xl" mt="sm">
            <Text size="xs" c="dimmed">
              作成: {formatDateTime(INV.createdAt)}
            </Text>
            <Text size="xs" c="dimmed">
              更新: {formatDateTime(INV.updatedAt)}
            </Text>
          </Group>
        )}
      </Paper>

      {/* Tabs */}
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
                <Table.Th>摘要</Table.Th>
                {!isMobile && <Table.Th>出荷書 / 納品書</Table.Th>}
                <Table.Th ta="right">数量</Table.Th>
                <Table.Th ta="right">単価</Table.Th>
                <Table.Th ta="right">金額</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {ITEMS.map((it) => (
                <Table.Tr key={it.id}>
                  <Table.Td>{localized(it.description)}</Table.Td>
                  {!isMobile && (
                    <Table.Td>
                      <Stack gap={2}>
                        <DocNumber c="blue">{it.shippingOrderNumber}</DocNumber>
                        <DocNumber c="blue">{it.deliveryNumber}</DocNumber>
                      </Stack>
                    </Table.Td>
                  )}
                  <Table.Td ta="right">{it.quantity} 本</Table.Td>
                  <Table.Td>
                    <MoneyText value={it.unitPrice} />
                  </Table.Td>
                  <Table.Td>
                    <MoneyText value={it.amount} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td colSpan={isMobile ? 3 : 4} ta="right">
                  <Text size="sm" c="dimmed">
                    小計
                  </Text>
                </Table.Td>
                <Table.Td>
                  <MoneyText value={INV.subtotal} />
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td colSpan={isMobile ? 3 : 4} ta="right">
                  <Text size="sm" c="dimmed">
                    消費税（10%）
                  </Text>
                </Table.Td>
                <Table.Td>
                  <MoneyText value={INV.taxAmount} />
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td colSpan={isMobile ? 3 : 4} ta="right">
                  <Text size="sm" fw={600}>
                    合計
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text fw={700} ta="right" ff="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(
                      INV.totalAmount,
                    )}
                  </Text>
                </Table.Td>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="sm">
            <Group align="flex-start">
              <Text size="sm" c="dimmed" w={120}>
                対象納品書
              </Text>
              <Stack gap={4}>
                {ITEMS.map((it) => (
                  <DocNumber key={it.id} c="blue">
                    {it.deliveryNumber}
                  </DocNumber>
                ))}
              </Stack>
            </Group>
            <Divider />
            <Group>
              <Text size="sm" c="dimmed" w={120}>
                締日処理
              </Text>
              <Text size="sm" c="blue">
                株式会社ABC製作所 — 2026/05/31 締
              </Text>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <Timeline active={-1} bulletSize={28} lineWidth={2}>
            {AUDIT.map((log) => (
              <Timeline.Item
                key={log.id}
                bullet={
                  <Text size="xs" fw={700}>
                    {log.user[0]}
                  </Text>
                }
                title={log.action}
              >
                <Text size="xs" c="dimmed">
                  {formatDateTime(log.at)} · {log.user}
                </Text>
                <Text size="sm" mt={4}>
                  {log.detail}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Tabs.Panel>
      </Tabs>

      {!isMobile && (
        <>
          <Divider />
          <Group gap="xl">
            <Text size="xs" c="dimmed">
              作成: {formatDateTime(INV.createdAt)}（{INV.createdBy}）
            </Text>
            <Text size="xs" c="dimmed">
              更新: {formatDateTime(INV.updatedAt)}
            </Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
