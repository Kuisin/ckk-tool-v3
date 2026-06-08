import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Stepper,
  Text,
  Textarea,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconCheck, IconLock, IconX } from '@tabler/icons-react';
import {
  DocNumber,
  FieldValue,
  formatDate,
  formatDateTime,
  PageHeader,
} from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data (toggle isApprover to preview action panel) ────────────────────
const IS_APPROVER = true; // current user is in the approval group for the pending step
const REQUEST = {
  workOrderNumber: 1044,
  salesOrderNumber: 'ORD-202601-00002-01',
  step: 'SECOND' as 'FIRST' | 'SECOND',
  status: 'PENDING',
  requestedBy: '鈴木 一郎',
  requestedAt: '2026-05-29 10:00',
  // target work order summary
  customerName: '合同会社XYZ工業',
  productName: 'ロッド PRD-2602-0008',
  type: 'MANUFACTURE',
  plannedQuantity: 30,
  material: 'A02B0014-B001-002（SKD11 φ32×2500・定尺）',
  deliveryDate: '2026-06-20',
};

const APPROVAL_RECORDS = [
  {
    id: 1,
    approver: '佐藤 工場長',
    step: '第一承認',
    action: 'APPROVED' as 'APPROVED' | 'REJECTED',
    at: '2026-05-29 09:00',
    comment: '負荷・日程に余裕あり。製造可。',
  },
];

const STEP_LABEL: Record<string, string> = { FIRST: '第一承認', SECOND: '第二承認' };

export default function ApprovalDetailPage() {
  const isMobile = useIsMobile();
  const activeStep = REQUEST.step === 'FIRST' ? 0 : 1;

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '生産', '承認管理', `指示書 #${REQUEST.workOrderNumber}`]}
        title={`承認 — 指示書 #${REQUEST.workOrderNumber}`}
        status={<StatusBadge entity="ApprovalRequest" status={REQUEST.status} />}
        align="flex-start"
      />

      {/* 承認依頼中ロック notice */}
      <Alert color="orange" icon={<IconLock size={16} />} title="承認依頼中">
        この指示書は{STEP_LABEL[REQUEST.step]}の承認待ちです。承認が完了するまで対象受注書の受注数量・製品品目は変更できません。
      </Alert>

      {/* ── ApprovalStatusPanel (design.md §12.4) ───────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="md">
          承認状況
        </Title>
        <Stepper active={activeStep} size="sm" orientation={isMobile ? 'vertical' : 'horizontal'}>
          <Stepper.Step label="第一承認" description="工場長・部長クラス" />
          <Stepper.Step
            label="第二承認"
            description="部長クラス"
            loading={REQUEST.step === 'SECOND' && REQUEST.status === 'PENDING'}
          />
        </Stepper>
      </Paper>

      {/* ── 対象指示書 summary ──────────────────────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="md">
          対象指示書
        </Title>
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="指示書番号" value={<DocNumber>#{REQUEST.workOrderNumber}</DocNumber>} />
          <FieldValue label="受注番号" value={<DocNumber>{REQUEST.salesOrderNumber}</DocNumber>} />
          <FieldValue label="顧客" value={REQUEST.customerName} />
          <FieldValue label="製品" value={REQUEST.productName} />
          <FieldValue label="種別" value={REQUEST.type === 'MANUFACTURE' ? '製造分' : '在庫分'} />
          <FieldValue label="計画本数" value={`${REQUEST.plannedQuantity} 本`} />
          <FieldValue label="素材" value={REQUEST.material} />
          <FieldValue label="納期" value={formatDate(REQUEST.deliveryDate)} />
          <FieldValue label="依頼者" value={REQUEST.requestedBy} />
          <FieldValue label="依頼日時" value={formatDateTime(REQUEST.requestedAt)} />
        </SimpleGrid>
      </Paper>

      {/* ── 承認操作 (approver + PENDING) ──────────────────────────────── */}
      {IS_APPROVER && REQUEST.status === 'PENDING' && (
        <Paper withBorder p="md" radius="md">
          <Title order={5} mb="md">
            承認操作
          </Title>
          <Textarea label="コメント" placeholder="承認・差し戻しのコメント" rows={3} mb="md" />
          {isMobile ? (
            <Stack gap="xs">
              <Button color="green" leftSection={<IconCheck size={16} />} fullWidth>
                承認
              </Button>
              <Button color="red" variant="outline" leftSection={<IconX size={16} />} fullWidth>
                差し戻し
              </Button>
            </Stack>
          ) : (
            <Group>
              <Button color="green" leftSection={<IconCheck size={16} />}>
                承認
              </Button>
              <Button color="red" variant="outline" leftSection={<IconX size={16} />}>
                差し戻し
              </Button>
            </Group>
          )}
        </Paper>
      )}

      {/* ── 承認履歴 (approval_records) ─────────────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="md">
          承認履歴
        </Title>
        <Stack gap="sm">
          {APPROVAL_RECORDS.map((r) => (
            <Group key={r.id} justify="space-between" wrap="nowrap" align="flex-start">
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <ThemeIcon
                  variant="light"
                  color={r.action === 'APPROVED' ? 'green' : 'red'}
                  size="sm"
                  radius="xl"
                >
                  {r.action === 'APPROVED' ? <IconCheck size={14} /> : <IconX size={14} />}
                </ThemeIcon>
                <Stack gap={2}>
                  <Group gap="xs">
                    <Text size="sm" fw={600}>
                      {r.approver}
                    </Text>
                    <Badge size="xs" variant="light" color="gray">
                      {r.step}
                    </Badge>
                    <Badge size="xs" color={r.action === 'APPROVED' ? 'green' : 'red'}>
                      {r.action === 'APPROVED' ? '承認' : '差し戻し'}
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

      {!isMobile && (
        <>
          <Divider />
          <Group gap="xl">
            <Text size="xs" c="dimmed">
              依頼: {formatDateTime(REQUEST.requestedAt)}（{REQUEST.requestedBy}）
            </Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
