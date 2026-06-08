/**
 * copy-version-warning.tsx — 旧バージョンからコピーの警告ポップアップ
 *
 * Shown when copying a work order from an older source whose product spec /
 * process-step master may have changed since. Built on ModalShell (lib/modals).
 */

import { Alert, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function CopyVersionWarningModal({
  opened,
  onClose,
  sourceLabel,
}: ModalBaseProps & { sourceLabel: string }) {
  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="バージョン警告"
      confirmLabel="このままコピーする"
      confirmColor="yellow"
      onConfirm={onClose}
      size="md"
    >
      <Alert color="yellow" variant="light" icon={<IconInfoCircle size={16} />}>
        コピー元（{sourceLabel}）は作成後に製品仕様・工程マスタが更新されている可能性があります。
      </Alert>
      <Text size="sm">
        コピー後は工程ワークフローを必ず確認してください。最新の工程マスタを反映する場合は新規作成を推奨します。
      </Text>
    </ModalShell>
  );
}
