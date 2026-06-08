/**
 * delete.tsx — 支店削除確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the branch list (customer detail) or branch
 * detail action menu. Built on the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../../lib/modals';

export function DeleteBranchModal({
  opened,
  onClose,
  branchName,
}: ModalBaseProps & { branchName?: string }) {
  const target = branchName ? `支店「${branchName}」` : 'この支店';

  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="支店の削除"
      message={`${target}を削除します。この操作は取り消せません。`}
      confirmLabel="削除する"
      warning="この支店に紐づく担当者情報も参照できなくなります。納品先として指定された支店は無効化を推奨します。"
    />
  );
}
