/**
 * session-lock.tsx — セッションロック警告ポップアップ（情報）
 *
 * Shown when another user holds the step session lock. Informational only.
 * Built on the unified ModalShell scaffold (lib/modals).
 */

import { Alert, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function SessionLockModal({
  opened,
  onClose,
  lockedBy,
}: ModalBaseProps & { lockedBy?: string }) {
  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="セッションロック"
      confirmLabel="確認しました"
      confirmColor="red"
      onConfirm={onClose}
      cancelLabel="閉じる"
      size="sm"
    >
      <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
        別のユーザー{lockedBy ? `（${lockedBy}）` : ''}がこの工程のセッション中です。
      </Alert>
      <Text size="sm">
        完了または解除されるまで操作できません。緊急の場合は管理者にロック解除を依頼してください。
      </Text>
    </ModalShell>
  );
}
