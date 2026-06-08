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

// ── Mock data ───────────────────────────────────────────────────────────────
const MOCK = {
  id: 'A01A0001',
  name: { ja: 'SUS303', en: 'SUS303' } as LocalizedText,
  description: {
    ja: 'オーステナイト系ステンレス鋼（快削）。耐食性に優れ、切削加工性が高い。',
    en: 'Free-machining austenitic stainless steel.',
  } as LocalizedText,
  isActive: true,
  createdBy: '田中 太郎',
  createdAt: '2025-09-01 09:00',
  updatedAt: '2026-05-12 10:30',
};

const RELATED_MATERIALS: {
  id: string;
  name: LocalizedText;
  form: string;
  unit: string;
  isActive: boolean;
}[] = [
  { id: 'A01A0001-A001-001', name: { ja: 'SUS303 φ20×3000', en: '' }, form: '研磨', unit: '本', isActive: true },
  { id: 'A01A0001-A002-001', name: { ja: 'SUS303 φ25×3000', en: '' }, form: '研磨', unit: '本', isActive: true },
  { id: 'A01A0001-B001-003', name: { ja: 'SUS303 φ16×4000', en: '' }, form: '定尺', unit: '本', isActive: false },
];

const AUDIT_LOG = [
  { id: 1, action: 'UPDATE', user: '田中 太郎', at: '2026-05-12 10:30', detail: '名称を更新' },
  { id: 2, action: 'CREATE', user: '田中 太郎', at: '2025-09-01 09:00', detail: '材種を作成' },
];

export default function MaterialTypeDetailPage() {
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
        breadcrumbs={['ホーム', 'マスタ', '材種', m.id]}
        title={localized(m.name)}
        status={<ActiveBadge active={m.isActive} />}
        actions={actions}
        align="flex-start"
      />

      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="材種コード" value={<DocNumber>{m.id}</DocNumber>} />
          <FieldValue label="名称（日本語）" value={m.name.ja} />
          <FieldValue label="名称（英語）" value={m.name.en} />
        </SimpleGrid>
      </Paper>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <Stack gap="md">
            <FieldValue label="説明（日本語）" value={m.description.ja} />
            <FieldValue label="説明（英語）" value={m.description.en} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="xs">
            <Text size="sm" fw={600}>この材種の素材</Text>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>素材コード</Table.Th>
                  <Table.Th>名称</Table.Th>
                  {!isMobile && <Table.Th>形態</Table.Th>}
                  {!isMobile && <Table.Th>単位</Table.Th>}
                  <Table.Th>状態</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {RELATED_MATERIALS.map((r) => (
                  <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                    <Table.Td><DocNumber c="blue">{r.id}</DocNumber></Table.Td>
                    <Table.Td>{localized(r.name)}</Table.Td>
                    {!isMobile && <Table.Td>{r.form}</Table.Td>}
                    {!isMobile && <Table.Td>{r.unit}</Table.Td>}
                    <Table.Td><ActiveBadge active={r.isActive} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
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
