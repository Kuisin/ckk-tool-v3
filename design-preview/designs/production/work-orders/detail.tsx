import {
  Badge,
  Button,
  Divider,
  Group,
  Menu,
  Paper,
  SimpleGrid,
  Stack,
  Stepper,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Timeline,
  Title,
} from '@mantine/core';
import {
  IconCheck,
  IconChevronRight,
  IconClock,
  IconDotsVertical,
  IconEdit,
  IconFileTypePdf,
  IconLoader,
  IconX,
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
const WO = {
  workOrderNumber: 1042,
  status: 'IN_PROGRESS',
  approvalStatus: 'APPROVED',
  type: 'MANUFACTURE',
  plannedQuantity: 50,
  material: 'A01A0001-A001-001（SUS303 φ20×3000・研磨）',
  salesOrderNumber: 'ORD-202601-00001-01',
  customerName: '株式会社ABC製作所',
  productName: '精密軸 PRD-2601-0001',
  createdBy: '鈴木 一郎',
  createdAt: '2026-05-20 09:15',
  updatedAt: '2026-05-28 14:30',
};

interface Step {
  id: string;
  name: string;
  status: string;
  location: 'INTERNAL' | 'OUTSOURCE';
  supplier?: string;
  requestedAt?: string;
  expectedAt?: string;
  completedAt?: string;
  completedBy?: string;
}

const STEPS: Step[] = [
  { id: 's1', name: '素材出し（在庫）', status: 'COMPLETED', location: 'INTERNAL', completedAt: '2026-05-21 10:00', completedBy: '田中 太郎' },
  { id: 's2', name: '円筒加工', status: 'COMPLETED', location: 'INTERNAL', completedAt: '2026-05-24 16:00', completedBy: '中村 花子' },
  { id: 's3', name: '円筒加工検査', status: 'COMPLETED', location: 'INTERNAL', completedAt: '2026-05-25 09:30', completedBy: '中村 花子' },
  { id: 's4', name: '円筒加工検査承認', status: 'COMPLETED', location: 'INTERNAL', completedAt: '2026-05-25 11:00', completedBy: '伊藤 係長' },
  { id: 's5', name: 'センタレス', status: 'IN_PROGRESS', location: 'OUTSOURCE', supplier: '外注研磨株式会社', requestedAt: '2026-05-26', expectedAt: '2026-06-02' },
  { id: 's6', name: '出荷前検査', status: 'PENDING', location: 'INTERNAL' },
];

const APPROVAL_RECORDS = [
  { id: 1, approver: '佐藤 工場長', step: '第一承認', action: 'APPROVED', at: '2026-05-22 09:00', comment: '設備・日程とも問題なし。製造可。' },
  { id: 2, approver: '山田 部長', step: '第二承認', action: 'APPROVED', at: '2026-05-22 15:30', comment: 'コスト承認。優先度高。' },
];

const AUDIT = [
  { id: 1, action: 'UPDATE', user: '中村 花子', at: '2026-05-26 13:00', detail: 'センタレス: 外注依頼' },
  { id: 2, action: 'UPDATE', user: '山田 部長', at: '2026-05-22 15:30', detail: '第二承認: 承認' },
  { id: 3, action: 'UPDATE', user: '佐藤 工場長', at: '2026-05-22 09:00', detail: '第一承認: 承認' },
  { id: 4, action: 'CREATE', user: '鈴木 一郎', at: '2026-05-20 09:15', detail: '指示書を作成' },
];

// ── Step status ThemeIcon (design.md §12.2) ─────────────────────────────────
function StepStatusIcon({ status }: { status: string }) {
  const config: Record<string, { icon: React.ReactNode; color: string }> = {
    PENDING: { icon: <IconClock size={14} />, color: 'gray' },
    IN_PROGRESS: { icon: <IconLoader size={14} />, color: 'blue' },
    COMPLETED: { icon: <IconCheck size={14} />, color: 'green' },
    CANCELLED: { icon: <IconX size={14} />, color: 'red' },
  };
  const c = config[status] ?? config.PENDING;
  return (
    <ThemeIcon variant="light" color={c.color} size="sm" radius="xl">
      {c.icon}
    </ThemeIcon>
  );
}

export default function WorkOrderDetailPage() {
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
      <Button variant="default" leftSection={<IconEdit size={14} />}>
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

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '生産', '指示書', `#${WO.workOrderNumber}`]}
        title={`指示書 #${WO.workOrderNumber}`}
        status={
          <Group gap="xs">
            <StatusBadge entity="WorkOrder" status={WO.status} />
            <StatusBadge entity="WorkOrderApproval" status={WO.approvalStatus} variant="light" />
          </Group>
        }
        actions={actions}
        align="flex-start"
      />

      {/* Summary */}
      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="受注番号" value={<DocNumber>{WO.salesOrderNumber}</DocNumber>} />
          <FieldValue label="顧客" value={WO.customerName} />
          <FieldValue label="製品" value={WO.productName} />
          <FieldValue label="種別" value={WO.type === 'MANUFACTURE' ? '製造分' : '在庫分'} />
          <FieldValue label="予定数量" value={`${WO.plannedQuantity} 本`} />
          <FieldValue label="素材" value={WO.material} />
        </SimpleGrid>
        {isMobile && (
          <Group gap="xl" mt="sm">
            <Text size="xs" c="dimmed">
              作成: {formatDateTime(WO.createdAt)}
            </Text>
            <Text size="xs" c="dimmed">
              更新: {formatDateTime(WO.updatedAt)}
            </Text>
          </Group>
        )}
      </Paper>

      {/* ── ApprovalStatusPanel (design.md §12.4) ───────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="md">
          承認状況
        </Title>
        <Stepper active={2} size="sm" orientation={isMobile ? 'vertical' : 'horizontal'}>
          <Stepper.Step label="第一承認" description="工場長・部長クラス" />
          <Stepper.Step label="第二承認" description="部長クラス" />
        </Stepper>

        <Divider my="md" />
        <Stack gap="sm">
          {APPROVAL_RECORDS.map((r) => (
            <Group key={r.id} justify="space-between" wrap="nowrap" align="flex-start">
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <ThemeIcon variant="light" color="green" size="sm" radius="xl">
                  <IconCheck size={14} />
                </ThemeIcon>
                <Stack gap={2}>
                  <Group gap="xs">
                    <Text size="sm" fw={600}>
                      {r.approver}
                    </Text>
                    <Badge size="xs" variant="light" color="gray">
                      {r.step}
                    </Badge>
                    <Badge size="xs" color="green">
                      承認
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {r.comment}
                  </Text>
                </Stack>
              </Group>
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {formatDateTime(r.at)}
              </Text>
            </Group>
          ))}
        </Stack>
      </Paper>

      {/* ── WorkOrderStepsPanel (design.md §12.2) ───────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb="sm">
          <Title order={5}>工程ワークフロー</Title>
          {!isMobile && (
            <Button variant="subtle" size="xs">
              変更承認依頼
            </Button>
          )}
        </Group>
        <Stack gap="xs">
          {STEPS.map((step) => (
            <Paper key={step.id} withBorder p="sm" radius="sm">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm">
                  <StepStatusIcon status={step.status} />
                  <Text size="sm" fw={600}>
                    {step.name}
                  </Text>
                  <Badge variant="outline" size="xs" color={step.location === 'OUTSOURCE' ? 'orange' : 'gray'}>
                    {step.location === 'OUTSOURCE' ? '外注' : '社内'}
                  </Badge>
                  <StatusBadge entity="Step" status={step.status} size="xs" variant="light" />
                </Group>
                <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
                  {!isMobile && step.location === 'OUTSOURCE' && step.supplier && (
                    <Text size="xs" c="dimmed">
                      {step.supplier}
                    </Text>
                  )}
                  {(step.status === 'PENDING' || step.status === 'IN_PROGRESS') && (
                    <Button variant="subtle" size="xs" rightSection={<IconChevronRight size={12} />}>
                      工程実行
                    </Button>
                  )}
                </Group>
              </Group>

              {isMobile && step.location === 'OUTSOURCE' && step.supplier && (
                <Text size="xs" c="dimmed" mt={4} pl={28}>
                  {step.supplier}
                </Text>
              )}
              {step.location === 'OUTSOURCE' && (
                <Group gap="xl" mt="xs" pl={28}>
                  <Text size="xs" c="dimmed">
                    依頼: {formatDate(step.requestedAt)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    入荷予定: {formatDate(step.expectedAt)}
                  </Text>
                </Group>
              )}
              {step.status === 'COMPLETED' && step.completedAt && (
                <Group gap="xl" mt="xs" pl={28}>
                  <Text size="xs" c="dimmed">
                    完了: {formatDateTime(step.completedAt)}（{step.completedBy}）
                  </Text>
                </Group>
              )}
            </Paper>
          ))}
        </Stack>
        {isMobile && (
          <Button variant="subtle" size="xs" mt="sm" fullWidth>
            変更承認依頼
          </Button>
        )}
      </Paper>

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
                <Table.Th ta="right">予定数量</Table.Th>
                <Table.Th>素材</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>{WO.productName}</Table.Td>
                <Table.Td ta="right">{WO.plannedQuantity} 本</Table.Td>
                <Table.Td>{WO.material}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="sm">
            <Group>
              <Text size="sm" c="dimmed" w={120}>
                受注書
              </Text>
              <DocNumber c="blue">{WO.salesOrderNumber}</DocNumber>
            </Group>
            <Divider />
            <Group>
              <Text size="sm" c="dimmed" w={120}>
                検査表
              </Text>
              <Stack gap={2}>
                <Text size="sm" c="blue">
                  円筒加工検査表
                </Text>
                <Text size="sm" c="blue">
                  出荷前検査表
                </Text>
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
              作成: {formatDateTime(WO.createdAt)}（{WO.createdBy}）
            </Text>
            <Text size="xs" c="dimmed">
              更新: {formatDateTime(WO.updatedAt)}
            </Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
