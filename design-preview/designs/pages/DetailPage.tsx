import type { ReactNode } from 'react';
import {
  Badge,
  Box,
  Breadcrumbs,
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
  IconClock,
  IconDotsVertical,
  IconEdit,
  IconFileTypePdf,
  IconLoader,
  IconX,
} from '@tabler/icons-react';
// ── FieldValue helper ────────────────────────────────────────────────────────
// [Custom] In production: import { FieldValue } from '@/components/ui/FieldValue'
// Props: label (string), value (ReactNode), span (optional — for SimpleGrid colSpan)
function FieldValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack gap={2}>
      {/* [Mantine] Text size="xs" c="dimmed" for the label */}
      <Text size="xs" c="dimmed">{label}</Text>
      {/* [Mantine] Text size="sm" fw={500} for the value */}
      <Text size="sm" fw={500}>{value ?? '—'}</Text>
    </Stack>
  );
}

// ── StatusBadge helpers ──────────────────────────────────────────────────────
// [Custom] In production: import { StatusBadge } from '@/components/ui/StatusBadge'
type WorkOrderStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

const WO_STATUS: Record<WorkOrderStatus, { label: string; color: string }> = {
  DRAFT:            { label: '下書き',   color: 'gray'   },
  PENDING_APPROVAL: { label: '承認待ち', color: 'yellow' },
  APPROVED:         { label: '承認済',   color: 'blue'   },
  IN_PROGRESS:      { label: '進行中',   color: 'violet' },
  COMPLETED:        { label: '完了',     color: 'green'  },
  CANCELLED:        { label: 'キャンセル', color: 'red'  },
};

// ── Mock data ────────────────────────────────────────────────────────────────
const MOCK_WORK_ORDER = {
  id: 'wo-001',
  workOrderNumber: 1042,
  status: 'IN_PROGRESS' as WorkOrderStatus,
  approvalStatus: 'APPROVED_1ST',
  type: 'MANUFACTURE',
  plannedQuantity: 50,
  material: 'A01A0001-A001-001（SUS303 φ20×3000）',
  salesOrderNumber: 'ORD-202601-00001-01',
  customerName: '株式会社ABC',
  productName: '精密軸 PRD-202601-0001',
  createdBy: '鈴木 一郎',
  createdAt: '2026-05-20 09:15',
  updatedAt: '2026-05-28 14:30',
};

const MOCK_STEPS = [
  { id: 's1', name: '材料準備', status: 'COMPLETED' as StepStatus, location: 'INTERNAL', completedAt: '2026-05-21 10:00', completedBy: '田中' },
  { id: 's2', name: '円筒加工', status: 'COMPLETED' as StepStatus, location: 'INTERNAL', completedAt: '2026-05-24 16:00', completedBy: '中村' },
  { id: 's3', name: 'センタレス研磨', status: 'IN_PROGRESS' as StepStatus, location: 'OUTSOURCE', supplier: '外注研磨（株）', startedAt: '2026-05-25', expectedAt: '2026-06-02' },
  { id: 's4', name: '検査', status: 'PENDING' as StepStatus, location: 'INTERNAL' },
  { id: 's5', name: '検査承認', status: 'PENDING' as StepStatus, location: 'INTERNAL' },
];

const MOCK_AUDIT_LOG = [
  { id: 1, action: 'UPDATE', user: '鈴木', at: '2026-05-28 14:30', detail: 'ステータス: IN_PROGRESS' },
  { id: 2, action: 'UPDATE', user: '山田', at: '2026-05-22 09:00', detail: '第一承認: 承認' },
  { id: 3, action: 'CREATE', user: '鈴木', at: '2026-05-20 09:15', detail: '指示書を作成' },
];

// ── Step status icon ─────────────────────────────────────────────────────────
// [Custom] Color-coded ThemeIcon per STEP_STATUS (see _specs/design.md §7.2)
function StepStatusIcon({ status }: { status: StepStatus }) {
  const config = {
    PENDING:     { icon: <IconClock size={14} />,  color: 'gray'   },
    IN_PROGRESS: { icon: <IconLoader size={14} />, color: 'blue'   },
    COMPLETED:   { icon: <IconCheck size={14} />,  color: 'green'  },
    CANCELLED:   { icon: <IconX size={14} />,      color: 'red'    },
  }[status];
  return (
    <ThemeIcon variant="light" color={config.color} size="sm" radius="xl">
      {config.icon}
    </ThemeIcon>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function WorkOrderDetailPage() {
  const wo = MOCK_WORK_ORDER;
  const { label: statusLabel, color: statusColor } = WO_STATUS[wo.status];

  return (
    <Stack gap="md">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          {/* [Mantine] Breadcrumbs */}
          <Breadcrumbs>
            <Text size="sm">ホーム</Text>
            <Text size="sm">生産</Text>
            <Text size="sm">指示書</Text>
            <Text size="sm">#{wo.workOrderNumber}</Text>
          </Breadcrumbs>
          {/* [Custom] Title + StatusBadge inline — standard detail page pattern */}
          <Group gap="sm" align="center">
            <Title order={2}>指示書 #{wo.workOrderNumber}</Title>
            {/* [Mantine] Badge — size/radius come from global theme */}
            <Badge color={statusColor} size="lg">{statusLabel}</Badge>
          </Group>
        </Stack>

        {/* Action buttons */}
        <Group>
          {/* [Mantine] Button variant="default" for secondary actions */}
          <Button
            variant="default"
            leftSection={<IconEdit size={14} />}
          >
            編集
          </Button>
          {/* [Custom] PdfButton — in production links to /api/pdf/work-order */}
          {/* In production: import { PdfButton } from '@/components/ui/PdfButton' */}
          <Button
            variant="default"
            leftSection={<IconFileTypePdf size={14} />}
          >
            PDF
          </Button>
          {/* [Mantine] Menu for overflow actions */}
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
      </Group>

      {/* ── Summary card (FieldValue grid) ────────────────────────────── */}
      {/*
       * [Mantine] SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}
       * [Custom] FieldValue renders label+value pairs (see above).
       *          Each FieldValue is one cell in the grid.
       */}
      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          <FieldValue label="受注番号" value={<Text size="sm" ff="mono">{wo.salesOrderNumber}</Text>} />
          <FieldValue label="顧客" value={wo.customerName} />
          <FieldValue label="製品" value={wo.productName} />
          <FieldValue label="種別" value={wo.type === 'MANUFACTURE' ? '製造分' : '在庫分'} />
          <FieldValue label="予定数量" value={`${wo.plannedQuantity} 本`} />
          <FieldValue label="素材" value={wo.material} />
          <FieldValue label="作成者" value={wo.createdBy} />
          <FieldValue label="作成日時" value={wo.createdAt} />
          <FieldValue label="更新日時" value={wo.updatedAt} />
        </SimpleGrid>
      </Paper>

      {/* ── Approval Status Panel ─────────────────────────────────────── */}
      {/*
       * [Custom] ApprovalStatusPanel — shown when approval_status != NONE.
       * In production: import { ApprovalStatusPanel } from '@/components/production/ApprovalStatusPanel'
       * Uses Mantine Stepper to show 2-step approval flow.
       */}
      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="md">承認状況</Title>
        {/*
         * [Mantine] Stepper — active index based on approval_status:
         *   PENDING_1ST → 0 (step 0 in progress)
         *   APPROVED_1ST / PENDING_2ND → 1 (step 1 in progress)
         *   APPROVED → 2 (completed)
         * [Custom] active={1} here = "第一承認済、第二承認待ち"
         */}
        <Stepper active={1} size="sm">
          <Stepper.Step
            label="第一承認"
            description="工場長・部長クラス"
            // [Mantine] completedIcon = check (default) when step is done
          />
          <Stepper.Step
            label="第二承認"
            description="部長クラス"
            // [Mantine] loading=true shows spinner for the current step
            loading={false}
          />
        </Stepper>
      </Paper>

      {/* ── Work Order Steps (Process Workflow) ───────────────────────── */}
      {/*
       * [Custom] WorkOrderStepsPanel with StepCard per step.
       * In production: import { WorkOrderStepsPanel } from '@/components/production/WorkOrderStepsPanel'
       */}
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb="sm">
          <Title order={5}>工程ワークフロー</Title>
          <Button variant="subtle" size="xs">変更承認依頼</Button>
        </Group>
        <Stack gap="xs">
          {MOCK_STEPS.map((step) => (
            /*
             * [Custom] StepCard: Paper withBorder p="sm"
             * Color-coded ThemeIcon by step status (see StepStatusIcon above).
             * OUTSOURCE steps show supplier info + outsource dates.
             */
            <Paper key={step.id} withBorder p="sm" radius="sm">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm">
                  <StepStatusIcon status={step.status} />
                  <Text size="sm" fw={600}>{step.name}</Text>
                  {/* [Mantine] Badge for execution location */}
                  {/* [Custom] 'light' variant distinguishes it from status badges */}
                  <Badge
                    variant="outline"
                    size="xs"
                    color={step.location === 'OUTSOURCE' ? 'orange' : 'gray'}
                  >
                    {step.location === 'OUTSOURCE' ? '外注' : '社内'}
                  </Badge>
                </Group>
                {step.location === 'OUTSOURCE' && step.supplier && (
                  <Text size="xs" c="dimmed">{step.supplier}</Text>
                )}
              </Group>
              {/* Outsource dates */}
              {step.location === 'OUTSOURCE' && (
                <Group gap="xl" mt="xs" pl={28}>
                  <Text size="xs" c="dimmed">依頼: {step.startedAt ?? '—'}</Text>
                  <Text size="xs" c="dimmed">入荷予定: {step.expectedAt ?? '—'}</Text>
                </Group>
              )}
              {/* Completion info */}
              {step.status === 'COMPLETED' && step.completedAt && (
                <Group gap="xl" mt="xs" pl={28}>
                  <Text size="xs" c="dimmed">完了: {step.completedAt}（{step.completedBy}）</Text>
                </Group>
              )}
            </Paper>
          ))}
        </Stack>
      </Paper>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      {/*
       * [Mantine] Tabs — three panels: 明細 / 関連 / 履歴
       * [Custom] defaultValue="items" shows the line items tab first.
       */}
      <Tabs defaultValue="items">
        <Tabs.List>
          <Tabs.Tab value="items">明細</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        {/* 明細 tab — line items */}
        <Tabs.Panel value="items" pt="md">
          {/* [Mantine] Table — striped + highlightOnHover set in global theme */}
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>項目</Table.Th>
                <Table.Th>数量</Table.Th>
                <Table.Th>備考</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>{wo.productName}</Table.Td>
                <Table.Td>{wo.plannedQuantity} 本</Table.Td>
                <Table.Td>—</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        {/* 関連 tab — related documents */}
        <Tabs.Panel value="related" pt="md">
          <Stack gap="xs">
            <Group>
              <Text size="sm" c="dimmed" w={120}>受注書</Text>
              <Text size="sm" ff="mono" c="blue">
                {wo.salesOrderNumber}
              </Text>
            </Group>
          </Stack>
        </Tabs.Panel>

        {/* 履歴 tab — audit timeline */}
        {/*
         * [Custom] AuditTimeline renders audit_logs in reverse-chronological order.
         * In production: import { AuditTimeline } from '@/components/production/AuditTimeline'
         * Uses Mantine Timeline. Each bullet shows user's first kanji character.
         */}
        <Tabs.Panel value="history" pt="md">
          <Timeline active={-1} bulletSize={28} lineWidth={2}>
            {MOCK_AUDIT_LOG.map((log) => (
              <Timeline.Item
                key={log.id}
                // [Mantine] bullet renders the user's initial character as Avatar
                bullet={
                  <Text size="xs" fw={700}>{log.user[0]}</Text>
                }
                title={log.action}
              >
                <Text size="xs" c="dimmed">{log.at} · {log.user}</Text>
                <Text size="sm" mt={4}>{log.detail}</Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Tabs.Panel>
      </Tabs>

      {/* ── Footer timestamps ─────────────────────────────────────────── */}
      <Divider />
      <Group gap="xl">
        <Text size="xs" c="dimmed">作成: {wo.createdAt}</Text>
        <Text size="xs" c="dimmed">更新: {wo.updatedAt}</Text>
      </Group>

    </Stack>
  );
}
