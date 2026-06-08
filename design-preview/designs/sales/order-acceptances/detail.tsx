import {
  Alert,
  Button,
  Center,
  Divider,
  Group,
  Menu,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Timeline,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconDotsVertical,
  IconEdit,
  IconFileTypePdf,
} from '@tabler/icons-react';
import {
  DocNumber,
  FieldValue,
  formatDateTime,
  MoneyText,
  PageHeader,
} from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import { ORDER_TYPE_LABEL } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

const MOCK = {
  orderNumber: 'ORD-202606-00002',
  status: 'PRICE_DIFF',
  customerName: '合同会社XYZ工業',
  branchName: '—',
  customerOrderRef: 'XYZ-20260604-01',
  totalAmount: 186000,
  createdBy: '田中 太郎',
  createdAt: '2026-06-04 10:20',
  updatedAt: '2026-06-04 16:45',
};

const MOCK_ITEMS = [
  { id: '1', productName: 'ロッド PRD-2602-0008', orderType: 'PRODUCTION', quantity: 30, unitPrice: 6200, amount: 186000 },
];

const MOCK_AUDIT_LOG = [
  { id: 1, action: 'UPDATE', user: '田中', at: '2026-06-04 16:45', detail: 'ステータス: PENDING → PRICE_DIFF' },
  { id: 2, action: 'CREATE', user: '田中', at: '2026-06-04 10:20', detail: '注文受諾書を作成' },
];

const totalAmount = MOCK_ITEMS.reduce((s, i) => s + i.amount, 0);

export default function OrderAcceptanceDetailPage() {
  const isMobile = useIsMobile();
  const o = MOCK;

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
        <Menu.Item>コピーして新規作成</Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red">キャンセル</Menu.Item>
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
        <Menu.Dropdown>
          <Menu.Item>コピーして新規作成</Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red">キャンセル</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );

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
          <Text size="xs" c="dimmed">order-XYZ-20260604-01.pdf</Text>
          <Button variant="subtle" size="xs" leftSection={<IconFileTypePdf size={14} />}>
            PDFを開く
          </Button>
        </Stack>
      </Center>
    </Paper>
  );

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '販売', '注文受諾書', o.orderNumber]}
        title={o.orderNumber}
        status={<StatusBadge entity="OrderAcceptance" status={o.status} />}
        align="flex-start"
        actions={actions}
      />

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
          {isMobile && (
            <Group gap="xl" mt="sm">
              <Text size="xs" c="dimmed">作成: {formatDateTime(o.createdAt)}</Text>
              <Text size="xs" c="dimmed">更新: {formatDateTime(o.updatedAt)}</Text>
            </Group>
          )}
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
                <Table.Td>
                  <MoneyText value={totalAmount} />
                </Table.Td>
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
            <Text size="xs" c="dimmed">作成: {formatDateTime(o.createdAt)}</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(o.updatedAt)}</Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
