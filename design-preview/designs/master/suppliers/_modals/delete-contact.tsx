/**
 * delete-contact.tsx — 担当者削除確認ポップアップ（bp_contacts, 破壊的操作）
 *
 * Controlled modal opened from the supplier detail 担当者 list.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function DeleteContactModal({
  opened,
  onClose,
  name,
}: ModalBaseProps & { name: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="担当者の削除"
      message={`担当者「${name}」を削除します。この操作は取り消せません。`}
      confirmLabel="削除する"
    />
  );
}
