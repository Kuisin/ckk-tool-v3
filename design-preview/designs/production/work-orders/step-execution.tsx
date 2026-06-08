'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconClipboardCheck,
  IconListCheck,
} from '@tabler/icons-react';
import { DocNumber } from '../../lib/ui';
import { FormSection } from '../../lib/shells';
import { StatusBadge } from '../../lib/status';
import { CompleteStepModal } from './_modals/complete-step';
import { RecordDefectModal } from './_modals/record-defect';
import { RecordInspectionModal, type InspectionItem } from './_modals/record-inspection';
import { RollbackStepModal } from './_modals/rollback-step';
import { SessionLockModal } from './_modals/session-lock';
import { StartStepModal } from './_modals/start-step';

// ── Mock state (toggle these consts to preview different states) ─────────────
const SESSION_LOCKED = false; // true → 別ユーザーがセッション中
const STEP = {
  workOrderNumber: 1042,
  name: '円筒加工検査',
  status: 'IN_PROGRESS' as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
  canStart: true,
  plannedQuantity: 50,
  templateName: '円筒加工検査表',
};

const INSPECTION_ITEMS: InspectionItem[] = [
  { id: 'i1', name: '外径 φ', tolerance: '19.98 〜 20.00 mm' },
  { id: 'i2', name: '真円度', tolerance: '0 〜 0.005 mm' },
  { id: 'i3', name: '表面粗さ Ra', tolerance: '0 〜 0.40 μm' },
  { id: 'i4', name: '全長', tolerance: '2998 〜 3000 mm' },
];

export default function StepExecutionPage() {
  const [startOpen, setStartOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [defectOpen, setDefectOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);

  // When session locked, action attempts open the session-lock warning modal.
  const guarded = (action: () => void) => () => (SESSION_LOCKED ? setLockOpen(true) : action());

  return (
    <Stack gap="md" p="md">
      {/* ── Step identity ────────────────────────────────────────────── */}
      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">
          <Group justify="space-between" wrap="wrap" align="flex-start">
            <Title order={3}>{STEP.name}</Title>
            <Group gap="sm">
              <DocNumber>指示書 #{STEP.workOrderNumber}</DocNumber>
              <StatusBadge entity="Step" status={STEP.status} size="lg" />
            </Group>
          </Group>

          {SESSION_LOCKED && (
            <Alert color="red" icon={<IconAlertTriangle size={18} />} title="セッションロック">
              別のユーザーがこの工程のセッション中です。完了または解除されるまで操作できません。
            </Alert>
          )}
        </Stack>
      </Paper>

      {/* ── 検査記録 (design.md §12.5) — opens the inspection modal ────── */}
      {STEP.status === 'IN_PROGRESS' && (
        <FormSection title={STEP.templateName} description="検査表に沿って実測値・合否を記録します">
          <Group justify="space-between" align="center" wrap="wrap">
            <Group gap="sm">
              <ThemeIcon variant="light" color="teal" size="lg" radius="md">
                <IconListCheck size={20} />
              </ThemeIcon>
              <Text size="md">検査項目 {INSPECTION_ITEMS.length} 件</Text>
            </Group>
            <Button size="lg" leftSection={<IconClipboardCheck size={18} />} onClick={guarded(() => setInspectionOpen(true))}>
              検査記録を入力
            </Button>
          </Group>
        </FormSection>
      )}

      {/* ── 不良記録 (design.md §12.6) — opens the defect modal ────────── */}
      <FormSection title="不良記録（任意）" description="工程中に発生した不良を記録します">
        <Group justify="space-between" align="center" wrap="wrap">
          <Group gap="sm">
            <ThemeIcon variant="light" color="orange" size="lg" radius="md">
              <IconAlertTriangle size={20} />
            </ThemeIcon>
            <Text size="md">不良があれば記録してください</Text>
          </Group>
          <Button size="lg" variant="default" leftSection={<IconAlertTriangle size={18} />} onClick={guarded(() => setDefectOpen(true))}>
            不良記録を追加
          </Button>
        </Group>
      </FormSection>

      <Divider />

      {/* ── Action buttons ───────────────────────────────────────────── */}
      <Group justify="center" mt="xl" gap="lg">
        {STEP.status === 'PENDING' && STEP.canStart && (
          <Button size="lg" color="blue" onClick={guarded(() => setStartOpen(true))}>
            工程開始
          </Button>
        )}
        {STEP.status === 'IN_PROGRESS' && (
          <>
            <Button size="lg" color="green" onClick={guarded(() => setCompleteOpen(true))}>
              工程完了
            </Button>
            <Button size="lg" color="red" variant="outline" onClick={guarded(() => setRollbackOpen(true))}>
              キャンセル（巻き戻し）
            </Button>
          </>
        )}
      </Group>

      {/* ── Modals ───────────────────────────────────────────────────── */}
      <StartStepModal opened={startOpen} onClose={() => setStartOpen(false)} stepName={STEP.name} />
      <CompleteStepModal opened={completeOpen} onClose={() => setCompleteOpen(false)} stepName={STEP.name} plannedQuantity={STEP.plannedQuantity} />
      <RollbackStepModal opened={rollbackOpen} onClose={() => setRollbackOpen(false)} stepName={STEP.name} />
      <RecordInspectionModal opened={inspectionOpen} onClose={() => setInspectionOpen(false)} templateName={STEP.templateName} items={INSPECTION_ITEMS} />
      <RecordDefectModal opened={defectOpen} onClose={() => setDefectOpen(false)} stepName={STEP.name} />
      <SessionLockModal opened={lockOpen} onClose={() => setLockOpen(false)} />
    </Stack>
  );
}
