/**
 * delete.tsx — 最終需要家削除確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the end-user list row / bulk actions and the
 * detail action menu. Built on the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function DeleteEndUserModal({
  opened,
  onClose,
  count,
  endUserName,
}: ModalBaseProps & {
  /** Number of end-users deleted (bulk). Ignored when endUserName is set. */
  count?: number;
  /** Single-target display name (detail page). */
  endUserName?: string;
}) {
  const target = endUserName
    ? `最終需要家「${endUserName}」`
    : `選択した ${count ?? 0} 件の最終需要家`;

  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="最終需要家の削除"
      message={`${target}を削除します。この操作は取り消せません。`}
      confirmLabel="削除する"
      warning="担当者・納品/直送履歴などの関連データも参照できなくなります。過去の納品書が紐づく場合は、削除ではなく無効化を推奨します。"
    />
  );
}
