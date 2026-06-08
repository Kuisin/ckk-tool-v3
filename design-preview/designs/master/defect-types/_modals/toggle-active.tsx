/**
 * toggle-active.tsx — 不良種類有効/無効切替ポップアップ
 *
 * Controlled modal: confirm activating / deactivating a defect type.
 * Built on the unified ModalShell scaffold (lib/modals).
 */

import { Text } from '@mantine/core';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function ToggleActiveDefectTypeModal({
  opened,
  onClose,
  name,
  isActive,
}: ModalBaseProps & { name: string; isActive: boolean }) {
  const next = !isActive;
  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title={next ? '不良種類の有効化' : '不良種類の無効化'}
      confirmLabel={next ? '有効化' : '無効化'}
      confirmColor={next ? 'green' : 'gray'}
      onConfirm={onClose}
      size="sm"
    >
      <Text size="sm">
        不良種類「{name}」を{next ? '有効化' : '無効化'}します。
        {next
          ? '有効化すると不良記録で選択できるようになります。'
          : '無効化すると新規の不良記録では選択できなくなります。'}
      </Text>
    </ModalShell>
  );
}
