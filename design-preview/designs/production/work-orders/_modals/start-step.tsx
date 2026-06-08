/**
 * start-step.tsx — 工程開始確認ポップアップ
 *
 * Opened from the step execution page. Confirms starting a step and acquires
 * the session lock. Built on the unified ModalShell scaffold (lib/modals).
 */

import { Alert, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function StartStepModal({
  opened,
  onClose,
  stepName,
}: ModalBaseProps & { stepName: string }) {
  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="工程開始"
      confirmLabel="開始する"
      confirmColor="blue"
      onConfirm={onClose}
      size="sm"
    >
      <Text size="sm">「{stepName}」を開始します。</Text>
      <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />}>
        開始するとこの工程のセッションロックを取得します。他のユーザーは操作できなくなります。
      </Alert>
    </ModalShell>
  );
}
