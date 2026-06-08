import {
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
  IconEdit,
  IconFileTypePdf,
  IconRuler2,
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
import { ORDER_TYPE_LABEL } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

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

const MOCK_ITEMS = [
  { id: '1', productName: '精密軸 PRD-2601-0001', orderType: 'PRODUCTION', quantity: 50, unitPrice: 5000, amount: 250000, deliveryDate: '2026-07-10' },
  { id: '2', productName: 'ロッド PRD-2602-0008', orderType: 'TEST', quantity: 5, unitPrice: 6200, amount: 31000, deliveryDate: null },
];

const MOCK_AUDIT_LOG = [
  { id: 1, action: 'UPDATE', user: '鈴木', at: '2026-06-05 14:30', detail: 'ステータス: DRAFT → ISSUED' },
  { id: 2, action: 'CREATE', user: '鈴木', at: '2026-06-03 09:15', detail: '見積書を作成' },
];

const totalAmount = MOCK_ITEMS.reduce((s, i) => s + i.amount, 0);

export default function QuoteDetailPage() {
  const isMobile = useIsMobile();
  const q = MOCK;

  const menuItems = (
    <>
      <Menu.Item leftSection={<IconRuler2 size={14} />}>設計依頼書を作成（設計図なし分岐）</Menu.Item>
      <Menu.Item>コピーして新規作成</Menu.Item>
      <Menu.Divider />
      <Menu.Item color="red">キャンセル</Menu.Item>
    </>
  );

  const actions = isMobile ? (
    <Menu shadow="sm" position="bottom-end">
      <Menu.Target>
        <Button variant="default" px="xs" size="sm">
          <IconDotsVertical size={16} />
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconEdit size={14} />}>編集</Menu.Item>
        <Menu.Item leftSection={<IconFileTypePdf size={14} />}>PDF</Menu.Item>
        {menuItems}
      </Menu.Dropdown>
    </Menu>
  ) : (
    <Group gap="xs" style={{ flexShrink: 0 }}>
      <Button variant="default" leftSection={<IconEdit size={14} />}>編集</Button>
      <Button variant="default" leftSection={<IconFileTypePdf size={14} />}>PDF</Button>
      <Menu shadow="sm">
        <Menu.Target>
          <Button variant="default" px="xs">
            <IconDotsVertical size={16} />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>{menuItems}</Menu.Dropdown>
      </Menu>
    </Group>
  );

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '販売', '見積書', q.quoteNumber]}
        title={q.quoteNumber}
        status={<StatusBadge entity="Quote" status={q.status} />}
        align="flex-start"
        actions={actions}
      />

      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="見積番号" value={<DocNumber>{q.quoteNumber}</DocNumber>} />
          <FieldValue label="顧客" value={q.customerName} />
          <FieldValue label="支店" value={q.branchName} />
          <FieldValue label="有効期限" value={formatDate(q.validUntil)} />
          <FieldValue label="作成者" value={q.createdBy} />
          <FieldValue label="合計金額" value={<MoneyText value={totalAmount} ta="left" />} />
          <FieldValue label="備考" value={q.notes} />
        </SimpleGrid>
        {isMobile && (
          <Group gap="xl" mt="sm">
            <Text size="xs" c="dimmed">作成: {formatDateTime(q.createdAt)}</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(q.updatedAt)}</Text>
          </Group>
        )}
      </Paper>

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
                {!isMobile && <Table.Th>納期</Table.Th>}
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
                  {!isMobile && <Table.Td>{i.deliveryDate ? formatDate(i.deliveryDate) : '—'}</Table.Td>}
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td colSpan={4} ta="right">
                  <Text size="sm" c="dimmed" fw={500}>合計金額</Text>
                </Table.Td>
                <Table.Td>
                  <MoneyText value={totalAmount} />
                </Table.Td>
                {!isMobile && <Table.Td />}
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="xs">
            <Group>
              <Text size="sm" c="dimmed" w={120}>注文受諾書</Text>
              <DocNumber c="blue">ORD-202606-00001</DocNumber>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <Timeline active={-1} bulletSize={28} lineWidth={2}>
            {MOCK_AUDIT_LOG.map((log) => (
              <Timeline.Item
                key={log.id}
                bullet={<Text size="xs" fw={700}>{log.user[0]}</Text>}
                title={log.action}
              >
                <Text size="xs" c="dimmed">{log.at} · {log.user}</Text>
                <Text size="sm" mt={4}>{log.detail}</Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Tabs.Panel>
      </Tabs>

      {!isMobile && (
        <>
          <Divider />
          <Group gap="xl">
            <Text size="xs" c="dimmed">作成: {formatDateTime(q.createdAt)}</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(q.updatedAt)}</Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
