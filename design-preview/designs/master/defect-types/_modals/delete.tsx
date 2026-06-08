/**
 * delete.tsx — 不良種類削除確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the list row action.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function DeleteDefectTypeModal({
  opened,
  onClose,
  name,
}: ModalBaseProps & { name: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="不良種類の削除"
      message={`不良種類「${name}」を削除します。この操作は取り消せません。`}
      confirmLabel="削除する"
      warning="不良記録で使用中の不良種類は削除できません。無効化をご検討ください。"
    />
  );
}
