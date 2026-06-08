import {
  Alert,
  Box,
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
  ThemeIcon,
  Timeline,
  Title,
} from '@mantine/core';
import {
  IconDotsVertical,
  IconEdit,
  IconFileTypePdf,
  IconLock,
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

const AUDIT = [
  { id: 1, action: 'UPDATE', user: '鈴木 一郎', at: '2026-05-28 14:30', detail: 'ステータス: DRAFT → CONFIRMED' },
  { id: 2, action: 'UPDATE', user: '鈴木 一郎', at: '2026-05-22 11:00', detail: '数量: 40 → 50' },
  { id: 3, action: 'CREATE', user: '鈴木 一郎', at: '2026-05-20 09:15', detail: '受注書を作成' },
];

export default function SalesOrderDetailPage() {
  const isMobile = useIsMobile();

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
      <Button variant="default" leftSection={<IconEdit size={14} />} disabled={SO.isLocked}>
        編集
      </Button>
      <Button variant="default" leftSection={<IconFileTypePdf size={14} />}>
        PDF
      </Button>
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

  const summary = (
    <Paper withBorder p="md" radius="md">
      <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
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
      </SimpleGrid>
      {isMobile && (
        <Group gap="xl" mt="sm">
          <Text size="xs" c="dimmed">
            作成: {formatDateTime(SO.createdAt)}
          </Text>
          <Text size="xs" c="dimmed">
            更新: {formatDateTime(SO.updatedAt)}
          </Text>
        </Group>
      )}
    </Paper>
  );

  // 注文書PDF サイドパネル placeholder
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
          <Text size="xs" c="dimmed">
            注文書プレビュー（FAX 受領）
          </Text>
          <DocNumber c="dimmed">{SO.customerOrderRef}</DocNumber>
        </Stack>
      </Box>
      <Button variant="light" size="xs" fullWidth mt="sm" leftSection={<IconFileTypePdf size={14} />}>
        注文書を開く
      </Button>
    </Paper>
  );

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '生産', '受注書', SO.salesOrderNumber]}
        title={`受注書 ${SO.salesOrderNumber}`}
        status={<StatusBadge entity="SalesOrder" status={SO.status} />}
        actions={actions}
        align="flex-start"
      />

      {/* 承認依頼中ロック warning */}
      {SO.isLocked && (
        <Alert color="orange" icon={<IconLock size={16} />} title="承認依頼中のためロック中">
          この受注書は生産判断の承認依頼中です。承認が完了するまで受注数量・製品品目は変更できません。
        </Alert>
      )}

      {/* Summary + side panel */}
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
                <Table.Td>
                  <MoneyText value={SO.unitPrice} />
                </Table.Td>
                <Table.Td>
                  <MoneyText value={SO.amount} />
                </Table.Td>
                <Table.Td>{formatDate(SO.deliveryDate)}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="sm">
            <Group>
              <Text size="sm" c="dimmed" w={120}>
                注文受諾書
              </Text>
              <DocNumber c="blue">{RELATED.orderAcceptance}</DocNumber>
            </Group>
            <Divider />
            <Group align="flex-start">
              <Text size="sm" c="dimmed" w={120}>
                指示書
              </Text>
              <Stack gap={4}>
                {RELATED.workOrders.map((wo) => (
                  <DocNumber key={wo} c="blue">
                    指示書 #{wo}
                  </DocNumber>
                ))}
              </Stack>
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
              作成: {formatDateTime(SO.createdAt)}（{SO.createdBy}）
            </Text>
            <Text size="xs" c="dimmed">
              更新: {formatDateTime(SO.updatedAt)}
            </Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
