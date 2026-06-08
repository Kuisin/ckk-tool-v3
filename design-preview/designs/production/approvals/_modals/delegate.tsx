/**
 * delegate.tsx — 代理承認の通知ポップアップ（情報）
 *
 * Shown when the current user is acting as a delegate approver for the original
 * approver. Informational notice. Built on ModalShell (lib/modals).
 */

import { Alert, Stack, Text } from '@mantine/core';
import { IconUserShare } from '@tabler/icons-react';
import { FieldValue } from '../../../lib/ui';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function DelegateModal({
  opened,
  onClose,
  delegatorName,
  validUntil,
}: ModalBaseProps & { delegatorName: string; validUntil: string }) {
  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="代理承認"
      confirmLabel="確認しました"
      confirmColor="blue"
      onConfirm={onClose}
      cancelLabel="閉じる"
      size="sm"
    >
      <Alert color="blue" variant="light" icon={<IconUserShare size={16} />}>
        あなたは {delegatorName} の代理承認者として操作しています。
      </Alert>
      <Stack gap="xs">
        <FieldValue label="原承認者" value={delegatorName} />
        <FieldValue label="代理期間" value={`〜 ${validUntil}`} />
        <Text size="xs" c="dimmed">
          承認・差し戻しの記録には原承認者が併記されます。
        </Text>
      </Stack>
    </ModalShell>
  );
}
