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
} from '@mantine/core';
import {
  IconDotsVertical,
  IconDownload,
  IconEdit,
} from '@tabler/icons-react';
import {
  DocNumber,
  FieldValue,
  formatDateTime,
  PageHeader,
} from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import { useIsMobile } from '../../lib/viewport-context';

const TRIGGER_LABEL: Record<string, string> = {
  QUOTE: '見積時',
  SALES_ORDER: '受注時',
};

const MOCK = {
  requestNumber: 'DSR-202606-0001',
  status: 'IN_PROGRESS',
  trigger: 'QUOTE',
  productName: '精密軸 PRD-2601-0001',
  quoteNumber: 'QOT-202606-00001',
  description: '先端形状をφ12に変更。図面差し替え。',
  createdBy: '中村 花子',
  createdAt: '2026-06-03 11:00',
  updatedAt: '2026-06-05 15:20',
};

const MOCK_FILES = [
  { id: '1', version: 2, isLatest: true, filename: 'design-PRD-2601-0001-v2.pdf', createdBy: '中村 花子', createdAt: '2026-06-05 15:20' },
  { id: '2', version: 1, isLatest: false, filename: 'design-PRD-2601-0001-v1.pdf', createdBy: '中村 花子', createdAt: '2026-06-03 11:05' },
];

const MOCK_AUDIT_LOG = [
  { id: 1, action: 'UPDATE', user: '中村', at: '2026-06-05 15:20', detail: '設計図 v2 をアップロード' },
  { id: 2, action: 'CREATE', user: '中村', at: '2026-06-03 11:00', detail: '設計依頼書を作成' },
];

export default function DesignRequestDetailPage() {
  const isMobile = useIsMobile();
  const d = MOCK;

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
        <Menu.Item color="red">キャンセル</Menu.Item>
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
          <Menu.Item color="red">キャンセル</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '販売', '設計依頼書', d.requestNumber]}
        title={d.requestNumber}
        status={<StatusBadge entity="DesignRequest" status={d.status} />}
        align="flex-start"
        actions={actions}
      />

      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="依頼番号" value={<DocNumber>{d.requestNumber}</DocNumber>} />
          <FieldValue label="トリガー" value={TRIGGER_LABEL[d.trigger]} />
          <FieldValue label="製品" value={d.productName} />
          <FieldValue label="見積書" value={<DocNumber c="blue">{d.quoteNumber}</DocNumber>} />
          <FieldValue label="作成者" value={d.createdBy} />
          <FieldValue label="説明" value={d.description} />
        </SimpleGrid>
        {isMobile && (
          <Group gap="xl" mt="sm">
            <Text size="xs" c="dimmed">作成: {formatDateTime(d.createdAt)}</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(d.updatedAt)}</Text>
          </Group>
        )}
      </Paper>

      <Tabs defaultValue="files">
        <Tabs.List>
          <Tabs.Tab value="files">設計図</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="files" pt="md">
          {isMobile ? (
            <Stack gap="xs">
              {MOCK_FILES.map((f) => (
                <Paper key={f.id} withBorder p="sm" radius="sm">
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Stack gap={3} style={{ minWidth: 0 }}>
                      <Group gap="xs">
                        <Text size="sm" fw={600}>v{f.version}</Text>
                        {f.isLatest && <Badge color="green" variant="light" size="xs">最新</Badge>}
                      </Group>
                      <Text size="xs" ff="mono" c="dimmed" truncate>{f.filename}</Text>
                      <Text size="xs" c="dimmed">{f.createdBy} · {formatDateTime(f.createdAt)}</Text>
                    </Stack>
                    <Button variant="subtle" size="xs" px="xs" aria-label="ダウンロード">
                      <IconDownload size={16} />
                    </Button>
                  </Group>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>バージョン</Table.Th>
                  <Table.Th>状態</Table.Th>
                  <Table.Th>ファイル名</Table.Th>
                  <Table.Th>作成者</Table.Th>
                  <Table.Th>日時</Table.Th>
                  <Table.Th ta="right">操作</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {MOCK_FILES.map((f) => (
                  <Table.Tr key={f.id}>
                    <Table.Td>v{f.version}</Table.Td>
                    <Table.Td>
                      {f.isLatest ? (
                        <Badge color="green" variant="light" size="sm">最新</Badge>
                      ) : (
                        <Badge color="gray" variant="light" size="sm">旧版</Badge>
                      )}
                    </Table.Td>
                    <Table.Td><DocNumber>{f.filename}</DocNumber></Table.Td>
                    <Table.Td>{f.createdBy}</Table.Td>
                    <Table.Td>{formatDateTime(f.createdAt)}</Table.Td>
                    <Table.Td ta="right">
                      <Button variant="subtle" size="xs" leftSection={<IconDownload size={14} />}>
                        ダウンロード
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="xs">
            <Group>
              <Text size="sm" c="dimmed" w={120}>見積書</Text>
              <DocNumber c="blue">{d.quoteNumber}</DocNumber>
            </Group>
            <Group>
              <Text size="sm" c="dimmed" w={120}>製品</Text>
              <Text size="sm" c="blue">{d.productName}</Text>
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
            <Text size="xs" c="dimmed">作成: {formatDateTime(d.createdAt)}</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(d.updatedAt)}</Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
