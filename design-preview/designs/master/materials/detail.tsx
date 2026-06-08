import {
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
  Timeline,
  Tooltip,
} from '@mantine/core';
import { IconDotsVertical, IconEdit } from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  FieldValue,
  formatDateTime,
  localized,
  PageHeader,
  type LocalizedText,
} from '../../lib/ui';
import { useIsMobile } from '../../lib/viewport-context';

const FORM_LABEL: Record<string, string> = {
  POLISHED: '研磨',
  STANDARD_LENGTH: '定尺',
  SEMI_FINISHED: '半製品',
  OTHER: 'その他',
};

// ── Mock data ───────────────────────────────────────────────────────────────
const MOCK = {
  id: 'A01A0001-A001-001',
  materialTypeId: 'A01A0001',
  materialTypeName: 'SUS303',
  name: { ja: 'SUS303 φ20×3000', en: 'SUS303 φ20×3000' } as LocalizedText,
  form: 'POLISHED',
  unit: '本',
  isActive: true,
  notes: '快削ステンレス。研磨済み丸棒。',
  // inventory
  available: 120,
  reserved: 30,
  createdBy: '田中 太郎',
  createdAt: '2025-09-03 11:20',
  updatedAt: '2026-05-10 08:45',
};

const USED_PRODUCTS: { id: string; name: LocalizedText }[] = [
  { id: 'PRD-2601-0001', name: { ja: '精密軸', en: 'Precision shaft' } },
  { id: 'PRD-2603-0012', name: { ja: '特殊加工品', en: 'Custom part' } },
];

const AUDIT_LOG = [
  { id: 1, action: 'UPDATE', user: '田中 太郎', at: '2026-05-10 08:45', detail: '備考を更新' },
  { id: 2, action: 'CREATE', user: '田中 太郎', at: '2025-09-03 11:20', detail: '素材を作成' },
];

export default function MaterialDetailPage() {
  const isMobile = useIsMobile();
  const m = MOCK;

  const actions = isMobile ? (
    <Menu shadow="sm" position="bottom-end">
      <Menu.Target>
        <Button variant="default" px="xs" size="sm">
          <IconDotsVertical size={16} />
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconEdit size={14} />}>編集</Menu.Item>
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
          <Menu.Item color="red">無効化</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '素材', m.id]}
        title={localized(m.name)}
        status={<ActiveBadge active={m.isActive} />}
        actions={actions}
        align="flex-start"
      />

      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="素材コード" value={<DocNumber>{m.id}</DocNumber>} />
          <FieldValue
            label="材種"
            value={<DocNumber c="blue">{m.materialTypeId}（{m.materialTypeName}）</DocNumber>}
          />
          <FieldValue label="形態" value={FORM_LABEL[m.form]} />
          <FieldValue label="名称（日本語）" value={m.name.ja} />
          <FieldValue label="名称（英語）" value={m.name.en} />
          <FieldValue label="単位" value={m.unit} />
        </SimpleGrid>
      </Paper>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <FieldValue label="備考" value={m.notes} />
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="lg">
            <Stack gap="xs">
              <Text size="sm" fw={600}>在庫</Text>
              <Group gap="xs">
                <Text size="sm">{m.available} {m.unit}</Text>
                {m.reserved > 0 && (
                  <Tooltip label={`予約中: ${m.reserved} ${m.unit}`}>
                    <Badge color="orange" variant="light">予約 {m.reserved}</Badge>
                  </Tooltip>
                )}
              </Group>
            </Stack>

            <Stack gap="xs">
              <Text size="sm" fw={600}>使用製品</Text>
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>製品コード</Table.Th>
                    <Table.Th>名称</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {USED_PRODUCTS.map((p) => (
                    <Table.Tr key={p.id} style={{ cursor: 'pointer' }}>
                      <Table.Td><DocNumber c="blue">{p.id}</DocNumber></Table.Td>
                      <Table.Td>{localized(p.name)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Stack>
        </Tabs.Panel>

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

      {!isMobile && (
        <>
          <Divider />
          <Group gap="xl">
            <Text size="xs" c="dimmed">作成: {formatDateTime(m.createdAt)}（{m.createdBy}）</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(m.updatedAt)}</Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
