/**
 * toggle-active.tsx — 工程の有効化 / 無効化ポップアップ
 *
 * Controlled modal opened from list row/bulk actions or detail menu.
 * Built on the unified ModalShell scaffold (lib/modals). Supports 1件 or 一括.
 */

import { List, Text } from '@mantine/core';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function ToggleProcessStepActiveModal({
  opened,
  onClose,
  activate,
  names,
}: ModalBaseProps & { activate: boolean; names: string[] }) {
  const count = names.length;
  const verb = activate ? '有効化' : '無効化';
  const label = count === 1 ? `工程「${names[0]}」` : `${count}件の工程`;

  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title={`工程の${verb}`}
      confirmLabel={verb}
      confirmColor={activate ? 'green' : 'gray'}
      onConfirm={onClose}
      size="sm"
    >
      <Text size="sm">{`${label}を${verb}します。`}</Text>
      {!activate && (
        <Text size="xs" c="dimmed">
          無効化した工程は新規ワークフローの依存定義で選択できなくなります。
        </Text>
      )}
      {count > 1 && (
        <List size="sm" spacing={2}>
          {names.map((n) => (
            <List.Item key={n}>{n}</List.Item>
          ))}
        </List>
      )}
    </ModalShell>
  );
}
