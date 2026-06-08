/**
 * delete.tsx — 工程削除確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the list row/bulk actions or detail menu.
 * Uses the unified ConfirmModal scaffold (lib/modals). Supports 1件 or 一括削除.
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function DeleteProcessStepModal({
  opened,
  onClose,
  names,
}: ModalBaseProps & { names: string[] }) {
  const count = names.length;
  const label = count === 1 ? `工程「${names[0]}」` : `${count}件の工程`;

  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="工程の削除"
      message={`${label}を削除します。この操作は取り消せません。`}
      confirmLabel="削除する"
      warning="他工程の依存先になっている工程を削除すると、ワークフロー定義に影響します。無効化を推奨します。"
    />
  );
}
