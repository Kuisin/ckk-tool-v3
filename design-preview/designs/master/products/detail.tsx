import {
  Anchor,
  Badge,
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
  Tooltip,
} from '@mantine/core';
import {
  IconDotsVertical,
  IconEdit,
  IconFileTypePdf,
} from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  FieldValue,
  formatDateTime,
  localized,
  PageHeader,
  type LocalizedText,
} from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data ───────────────────────────────────────────────────────────────
const MOCK = {
  id: 'PRD-2601-0001',
  name: { ja: '精密軸', en: 'Precision shaft' } as LocalizedText,
  materialId: 'A01A0001-A001-001',
  materialName: 'SUS303 φ20×3000',
  unit: '本',
  isActive: true,
  notes: '主力製品。公差厳しめ。',
  designFile: { name: '精密軸_設計図_v3.pdf', version: 3 },
  spec: [
    { key: '外径', value: 'φ20 ±0.01' },
    { key: '全長', value: '300mm ±0.1' },
    { key: '表面粗さ', value: 'Ra 0.4' },
    { key: '材質', value: 'SUS303' },
    { key: '熱処理', value: 'なし' },
  ],
  available: 80,
  reserved: 20,
  createdBy: '田中 太郎',
  createdAt: '2026-01-15 13:40',
  updatedAt: '2026-05-22 09:05',
};

const RELATED_ORDERS: {
  id: string;
  customer: string;
  quantity: number;
  status: string;
}[] = [
  { id: 'ORD-202601-00001-01', customer: '株式会社ABC製作所', quantity: 50, status: 'IN_PRODUCTION' },
  { id: 'ORD-202605-00012-02', customer: '東邦精密株式会社', quantity: 30, status: 'CONFIRMED' },
];

const AUDIT_LOG = [
  { id: 1, action: 'UPDATE', user: '田中 太郎', at: '2026-05-22 09:05', detail: '仕様（表面粗さ）を更新' },
  { id: 2, action: 'UPDATE', user: '鈴木 一郎', at: '2026-03-10 15:20', detail: '設計図 v3 を登録' },
  { id: 3, action: 'CREATE', user: '田中 太郎', at: '2026-01-15 13:40', detail: '製品を作成' },
];

export default function ProductDetailPage() {
  const isMobile = useIsMobile();
  const p = MOCK;

  const actions = isMobile ? (
    <Menu shadow="sm" position="bottom-end">
      <Menu.Target>
        <Button variant="default" px="xs" size="sm">
          <IconDotsVertical size={16} />
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconEdit size={14} />}>編集</Menu.Item>
        <Menu.Item leftSection={<IconFileTypePdf size={14} />}>設計図を開く</Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red">無効化</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ) : (
    <Group gap="xs" style={{ flexShrink: 0 }}>
      <Button variant="default" leftSection={<IconEdit size={14} />}>編集</Button>
      <Button variant="default" leftSection={<IconFileTypePdf size={14} />}>設計図</Button>
      <Menu shadow="sm">
        <Menu.Target>
          <Button variant="default" px="xs">
            <IconDotsVertical size={16} />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item color="red">無効化</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '製品', p.id]}
        title={localized(p.name)}
        status={<ActiveBadge active={p.isActive} />}
        actions={actions}
        align="flex-start"
      />

      {/* ── Summary ──────────────────────────────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="製品コード" value={<DocNumber>{p.id}</DocNumber>} />
          <FieldValue label="名称（日本語）" value={p.name.ja} />
          <FieldValue label="名称（英語）" value={p.name.en} />
          <FieldValue
            label="素材"
            value={<DocNumber c="blue">{p.materialId}（{p.materialName}）</DocNumber>}
          />
          <FieldValue label="単位" value={p.unit} />
          <FieldValue
            label="設計図"
            value={
              <Group gap={6} wrap="nowrap">
                <ThemeIcon variant="light" color="red" size="sm" radius="sm">
                  <IconFileTypePdf size={14} />
                </ThemeIcon>
                <Anchor size="sm">{p.designFile.name}</Anchor>
                <Badge size="xs" variant="light" color="gray">v{p.designFile.version}</Badge>
              </Group>
            }
          />
        </SimpleGrid>
      </Paper>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        {/* 概要: spec rendered as key-value table */}
        <Tabs.Panel value="overview" pt="md">
          <Stack gap="md">
            <Stack gap="xs">
              <Text size="sm" fw={600}>仕様</Text>
              <Table striped withTableBorder>
                <Table.Tbody>
                  {p.spec.map((s) => (
                    <Table.Tr key={s.key}>
                      <Table.Th w={isMobile ? 120 : 200}>{s.key}</Table.Th>
                      <Table.Td>{s.value}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
            <FieldValue label="備考" value={p.notes} />
          </Stack>
        </Tabs.Panel>

        {/* 関連: 受注 + 在庫 */}
        <Tabs.Panel value="related" pt="md">
          <Stack gap="lg">
            <Stack gap="xs">
              <Text size="sm" fw={600}>在庫</Text>
              <Group gap="xs">
                <Text size="sm">{p.available} {p.unit}</Text>
                {p.reserved > 0 && (
                  <Tooltip label={`予約中: ${p.reserved} ${p.unit}`}>
                    <Badge color="orange" variant="light">予約 {p.reserved}</Badge>
                  </Tooltip>
                )}
              </Group>
            </Stack>

            <Stack gap="xs">
              <Text size="sm" fw={600}>受注</Text>
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>受注番号</Table.Th>
                    {!isMobile && <Table.Th>顧客</Table.Th>}
                    <Table.Th>数量</Table.Th>
                    <Table.Th>状態</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {RELATED_ORDERS.map((o) => (
                    <Table.Tr key={o.id} style={{ cursor: 'pointer' }}>
                      <Table.Td><DocNumber c="blue">{o.id}</DocNumber></Table.Td>
                      {!isMobile && <Table.Td>{o.customer}</Table.Td>}
                      <Table.Td>{o.quantity} {p.unit}</Table.Td>
                      <Table.Td><StatusBadge entity="SalesOrder" status={o.status} /></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Stack>
        </Tabs.Panel>

        {/* 履歴: AuditTimeline */}
        <Tabs.Panel value="history" pt="md">
          <Timeline active={-1} bulletSize={28} lineWidth={2}>
            {AUDIT_LOG.map((log) => (
              <Timeline.Item
                key={log.id}
                bullet={<Text size="xs" fw={700}>{log.user[0]}</Text>}
                title={log.action}
              >
                <Text size="xs" c="dimmed">{formatDateTime(log.at)} · {log.user}</Text>
                <Text size="sm" mt={4}>{log.detail}</Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Tabs.Panel>
      </Tabs>

      {/* ── Footer timestamps ─────────────────────────────────────────── */}
      {!isMobile && (
        <>
          <Divider />
          <Group gap="xl">
            <Text size="xs" c="dimmed">作成: {formatDateTime(p.createdAt)}（{p.createdBy}）</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(p.updatedAt)}</Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
