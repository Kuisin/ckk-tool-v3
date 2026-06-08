/**
 * remove-member.tsx — 承認グループ メンバー削除確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the メンバー tab on the group detail page.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function RemoveMemberModal({
  opened,
  onClose,
  memberName,
}: ModalBaseProps & { memberName: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="メンバーの削除"
      message={`「${memberName}」をこの承認グループから削除します。`}
      confirmLabel="削除する"
    />
  );
}
