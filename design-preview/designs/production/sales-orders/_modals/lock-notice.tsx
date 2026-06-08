/**
 * lock-notice.tsx — 承認依頼中ロックの通知ポップアップ（情報）
 *
 * Shown when the user attempts to edit a sales order that is locked because
 * a production-judgement approval request is in progress. Informational only —
 * no destructive confirm, just an acknowledge button (ModalShell, hideFooter cancel).
 */

import { Alert, Text } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function LockNoticeModal({
  opened,
  onClose,
  salesOrderNumber,
}: ModalBaseProps & { salesOrderNumber: string }) {
  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="承認依頼中のためロック中"
      confirmLabel="確認しました"
      confirmColor="blue"
      onConfirm={onClose}
      cancelLabel="閉じる"
      size="sm"
    >
      <Alert color="orange" variant="light" icon={<IconLock size={16} />}>
        受注書「{salesOrderNumber}」は生産判断の承認依頼中です。
      </Alert>
      <Text size="sm">
        承認が完了するまで、受注数量・製品品目は変更できません。変更が必要な場合は承認を取り下げてください。
      </Text>
    </ModalShell>
  );
}
