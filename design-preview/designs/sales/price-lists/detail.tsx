import {
  Button,
  Divider,
  Group,
  Menu,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Timeline,
} from '@mantine/core';
import {
  IconDotsVertical,
  IconEdit,
} from '@tabler/icons-react';
import {
  ActiveBadge,
  FieldValue,
  formatDate,
  formatDateTime,
  MoneyText,
  PageHeader,
} from '../../lib/ui';
import { ORDER_TYPE_LABEL } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

const MOCK = {
  customerName: '株式会社ABC製作所',
  productName: '精密軸 PRD-2601-0001',
  orderType: 'PRODUCTION',
  minQuantity: 1,
  maxQuantity: 99,
  unitPrice: 5000,
  currency: 'JPY',
  validFrom: '2026-01-01',
  validUntil: null as string | null,
  isActive: true,
  createdBy: '鈴木 一郎',
  createdAt: '2025-12-20 09:15',
  updatedAt: '2026-01-05 14:30',
};

const MOCK_AUDIT_LOG = [
  { id: 1, action: 'UPDATE', user: '鈴木', at: '2026-01-05 14:30', detail: '単価: ¥5,200 → ¥5,000' },
  { id: 2, action: 'CREATE', user: '鈴木', at: '2025-12-20 09:15', detail: '価格表を作成' },
];

export default function PriceListDetailPage() {
  const isMobile = useIsMobile();
  const r = MOCK;

  const actions = isMobile ? (
    <Menu shadow="sm" position="bottom-end">
      <Menu.Target>
        <Button variant="default" px="xs" size="sm">
          <IconDotsVertical size={16} />
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconEdit size={14} />}>編集</Menu.Item>
        <Menu.Item>コピーして新規作成</Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red">無効化</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ) : (
    <Group gap="xs" style={{ flexShrink: 0 }}>
      <Button variant="default" leftSection={<IconEdit size={14} />}>編集</Button>
      <Menu shadow="sm">
        <Menu.Target>
          <Button variant="default" px="xs">
            <IconDotsVertical size={16} />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item>コピーして新規作成</Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red">無効化</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '販売', '価格表', '詳細']}
        title="価格表 詳細"
        status={<ActiveBadge active={r.isActive} />}
        align="flex-start"
        actions={actions}
      />

      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="顧客" value={r.customerName} />
          <FieldValue label="製品" value={r.productName} />
          <FieldValue label="注文種別" value={ORDER_TYPE_LABEL[r.orderType]} />
          <FieldValue
            label="数量範囲"
            value={r.maxQuantity == null ? `${r.minQuantity}本〜` : `${r.minQuantity}〜${r.maxQuantity}本`}
          />
          <FieldValue label="単価" value={<MoneyText value={r.unitPrice} currency={r.currency} ta="left" />} />
          <FieldValue label="通貨" value={r.currency} />
          <FieldValue label="有効開始日" value={formatDate(r.validFrom)} />
          <FieldValue label="有効終了日" value={r.validUntil ? formatDate(r.validUntil) : '無期限'} />
          <FieldValue label="作成者" value={r.createdBy} />
        </SimpleGrid>
        {isMobile && (
          <Group gap="xl" mt="sm">
            <Text size="xs" c="dimmed">作成: {formatDateTime(r.createdAt)}</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(r.updatedAt)}</Text>
          </Group>
        )}
      </Paper>

      <Tabs defaultValue="history">
        <Tabs.List>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>
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
            <Text size="xs" c="dimmed">作成: {formatDateTime(r.createdAt)}</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(r.updatedAt)}</Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
