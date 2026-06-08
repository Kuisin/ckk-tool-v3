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
  IconDotsVertical,
  IconFileExport,
  IconInfoCircle,
} from '@tabler/icons-react';
import {
  DocNumber,
  FieldValue,
  formatDate,
  formatDateTime,
  MoneyText,
  PageHeader,
} from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data ────────────────────────────────────────────────────────────────
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
  {
    id: '1',
    shippingOrderNumber: 'SHP-202605-0018',
    deliveryNumber: 'DRN-202605-00007',
    productName: '精密軸 PRD-2601-0001',
    quantity: 200,
    amount: 1000000,
  },
  {
    id: '2',
    shippingOrderNumber: 'SHP-202605-0019',
    deliveryNumber: 'DRN-202605-00008',
    productName: 'ロッド PRD-2602-0008',
    quantity: 70,
    amount: 350000,
  },
];

const shipmentTotal = SHIPMENTS.reduce((s, it) => s + it.amount, 0);

const GENERATED_INVOICE = 'INV-202605-00008';

const AUDIT = [
  { id: 1, action: 'EXPORT', user: '佐藤 工場長', at: '2026-06-02 09:00', detail: '弥生会計 Next CSV エクスポート（ステータス: PROCESSED → EXPORTED）' },
  { id: 2, action: 'UPDATE', user: 'システム', at: '2026-06-01 02:00', detail: '対象発送レコードを集計・請求書を生成（INV-202605-00008）' },
  { id: 3, action: 'CREATE', user: 'システム', at: '2026-06-01 02:00', detail: '締日処理を作成（月次バッチ）' },
];

export default function ClosingDetailPage() {
  const isMobile = useIsMobile();
  const alreadyExported = Boolean(CL.yayoiExportedAt);

  const actions = isMobile ? (
    <Menu shadow="sm" position="bottom-end">
      <Menu.Target>
        <Button variant="default" px="xs" size="sm">
          <IconDotsVertical size={16} />
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconFileExport size={14} />}>弥生会計CSVエクスポート</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ) : (
    <Group gap="xs" style={{ flexShrink: 0 }}>
      <Button
        variant={alreadyExported ? 'default' : 'filled'}
        leftSection={<IconFileExport size={14} />}
      >
        弥生会計CSVエクスポート
      </Button>
    </Group>
  );

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '請求', '締日処理', `${CL.customerName} 2026/05/31 締`]}
        title="締日処理"
        status={<StatusBadge entity="BillingClosing" status={CL.status} />}
        actions={actions}
        align="flex-start"
      />

      {/* 二重エクスポート防止 notice */}
      {alreadyExported && (
        <Alert color="green" icon={<IconInfoCircle size={16} />} variant="light">
          弥生会計 Next へ {formatDateTime(CL.yayoiExportedAt)} にエクスポート済みです（`yayoi_exported_at`）。二重エクスポートは仕訳の重複計上につながるため注意してください。
        </Alert>
      )}

      {/* Summary card */}
      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="顧客" value={CL.customerName} />
          <FieldValue label="締日" value={formatDate(CL.closingDate)} />
          <FieldValue
            label="合計金額"
            value={
              <Text fw={700} ff="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(
                  CL.totalAmount,
                )}
              </Text>
            }
          />
          <FieldValue label="処理日時" value={formatDateTime(CL.processedAt)} />
          <FieldValue label="処理者" value={CL.processedBy} />
          <FieldValue label="弥生エクスポート日時" value={formatDateTime(CL.yayoiExportedAt)} />
        </SimpleGrid>
      </Paper>

      {/* Tabs */}
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
          <Table striped withTableBorder>
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
                  <Table.Td>
                    <DocNumber c="blue">{it.shippingOrderNumber}</DocNumber>
                  </Table.Td>
                  {!isMobile && (
                    <Table.Td>
                      <DocNumber c="blue">{it.deliveryNumber}</DocNumber>
                    </Table.Td>
                  )}
                  <Table.Td>{it.productName}</Table.Td>
                  <Table.Td ta="right">{it.quantity} 本</Table.Td>
                  <Table.Td>
                    <MoneyText value={it.amount} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td colSpan={isMobile ? 3 : 4} ta="right">
                  <Text size="sm" fw={600}>
                    合計
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text fw={700} ta="right" ff="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(
                      shipmentTotal,
                    )}
                  </Text>
                </Table.Td>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="invoice" pt="md">
          <Stack gap="sm">
            <Group>
              <Text size="sm" c="dimmed" w={120}>
                生成された請求書
              </Text>
              <DocNumber c="blue">{GENERATED_INVOICE}</DocNumber>
            </Group>
            <Divider />
            <Group>
              <Text size="sm" c="dimmed" w={120}>
                請求金額
              </Text>
              <MoneyText value={CL.totalAmount} ta="left" />
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
              作成: {formatDateTime(CL.createdAt)}
            </Text>
            <Text size="xs" c="dimmed">
              処理: {formatDateTime(CL.processedAt)}
            </Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
