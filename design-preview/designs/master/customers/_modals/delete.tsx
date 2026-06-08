/**
 * delete.tsx — 顧客削除確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the customer list row / bulk actions and the
 * detail action menu. Built on the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function DeleteCustomerModal({
  opened,
  onClose,
  count,
  customerName,
}: ModalBaseProps & {
  /** Number of customers deleted (bulk). Ignored when customerName is set. */
  count?: number;
  /** Single-target display name (detail page). */
  customerName?: string;
}) {
  const target = customerName
    ? `顧客「${customerName}」`
    : `選択した ${count ?? 0} 件の顧客`;

  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="顧客の削除"
      message={`${target}を削除します。この操作は取り消せません。`}
      confirmLabel="削除する"
      warning="支店・担当者・取引履歴などの関連データも参照できなくなります。過去の見積書・受注書が紐づく顧客は、削除ではなく無効化を推奨します。"
    />
  );
}
