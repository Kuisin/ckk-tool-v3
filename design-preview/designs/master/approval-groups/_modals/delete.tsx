/**
 * delete.tsx — 承認グループ削除確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the list row action / detail action menu.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function DeleteApprovalGroupModal({
  opened,
  onClose,
  name,
}: ModalBaseProps & { name: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="承認グループの削除"
      message={`承認グループ「${name}」を削除します。この操作は取り消せません。`}
      confirmLabel="削除する"
      warning="承認フローで使用中のグループは削除できません。無効化をご検討ください。"
    />
  );
}
