/**
 * toggle-active.tsx — 検査表テンプレート有効/無効切替ポップアップ
 *
 * Controlled modal: confirm activating / deactivating a template.
 * Built on the unified ModalShell scaffold (lib/modals).
 */

import { Text } from '@mantine/core';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function ToggleActiveTemplateModal({
  opened,
  onClose,
  code,
  isActive,
}: ModalBaseProps & { code: string; isActive: boolean }) {
  const next = !isActive;
  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title={next ? '検査表テンプレートの有効化' : '検査表テンプレートの無効化'}
      confirmLabel={next ? '有効化' : '無効化'}
      confirmColor={next ? 'green' : 'gray'}
      onConfirm={onClose}
      size="sm"
    >
      <Text size="sm">
        検査表テンプレート「{code}」を{next ? '有効化' : '無効化'}します。
        {next
          ? '有効化すると指示書で選択できるようになります。'
          : '無効化すると新規の指示書では選択できなくなります。'}
      </Text>
    </ModalShell>
  );
}
