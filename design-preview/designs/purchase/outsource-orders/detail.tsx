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
  IconPackageImport,
} from '@tabler/icons-react';
import {
  DocNumber,
  FieldValue,
  formatDate,
  formatDateTime,
  PageHeader,
} from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data ────────────────────────────────────────────────────────────────
const ORDER = {
  supplierName: '外注研磨株式会社',
  stepName: 'センタレス',
  workOrderNumber: 1042,
  productName: '精密軸 PRD-2601-0001',
  status: 'IN_PROGRESS',
  requestedAt: '2026-05-26',
  expectedAt: '2026-06-02',
  receivedAt: null as string | null,
  notes: 'φ20 → φ19.98 仕上げ。RA0.4 以下。',
  createdBy: '中村 花子',
  createdAt: '2026-05-26 13:00',
  updatedAt: '2026-05-26 13:00',
};

const AUDIT = [
  { id: 1, action: 'UPDATE', user: '中村 花子', at: '2026-05-26 13:00', detail: 'センタレス: 外注依頼（外注研磨株式会社）' },
  { id: 2, action: 'CREATE', user: '鈴木 一郎', at: '2026-05-20 09:15', detail: '指示書 #1042 の工程として生成' },
];

export default function OutsourceOrderDetailPage() {
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
        <Menu.Item leftSection={<IconPackageImport size={14} />}>入荷を記録</Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red">キャンセル</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ) : (
    <Group gap="xs" style={{ flexShrink: 0 }}>
      <Button variant="default" leftSection={<IconEdit size={14} />}>
        編集
      </Button>
      <Button color="blue" leftSection={<IconPackageImport size={14} />}>
        入荷を記録
      </Button>
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
        breadcrumbs={['ホーム', '購買', '外注依頼', `指示書 #${ORDER.workOrderNumber}`]}
        title={`外注依頼 — ${ORDER.stepName}`}
        status={<StatusBadge entity="Step" status={ORDER.status} />}
        actions={actions}
        align="flex-start"
      />

      {/* Summary */}
      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="外注先" value={ORDER.supplierName} />
          <FieldValue label="工程" value={ORDER.stepName} />
          <FieldValue
            label="指示書"
            value={<DocNumber c="blue">#{ORDER.workOrderNumber}</DocNumber>}
          />
          <FieldValue label="依頼日" value={formatDate(ORDER.requestedAt)} />
          <FieldValue label="入荷予定日" value={formatDate(ORDER.expectedAt)} />
          <FieldValue
            label="入荷日"
            value={ORDER.receivedAt ? formatDate(ORDER.receivedAt) : '未入荷'}
          />
          <FieldValue label="備考" value={ORDER.notes} />
        </SimpleGrid>
        {isMobile && (
          <Group gap="xl" mt="sm">
            <Text size="xs" c="dimmed">
              依頼: {formatDateTime(ORDER.createdAt)}（{ORDER.createdBy}）
            </Text>
          </Group>
        )}
      </Paper>

      {/* Tabs */}
      <Tabs defaultValue="related">
        <Tabs.List>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="sm">
            <Group>
              <Text size="sm" c="dimmed" w={120}>
                指示書
              </Text>
              <DocNumber c="blue">#{ORDER.workOrderNumber}</DocNumber>
            </Group>
            <Divider />
            <Group>
              <Text size="sm" c="dimmed" w={120}>
                製品
              </Text>
              <Text size="sm">{ORDER.productName}</Text>
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
              依頼: {formatDateTime(ORDER.createdAt)}（{ORDER.createdBy}）
            </Text>
            <Text size="xs" c="dimmed">
              更新: {formatDateTime(ORDER.updatedAt)}
            </Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
