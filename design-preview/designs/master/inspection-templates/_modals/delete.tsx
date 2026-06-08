/**
 * delete.tsx — 検査表テンプレート削除確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the list row action / detail action menu.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function DeleteTemplateModal({
  opened,
  onClose,
  code,
}: ModalBaseProps & { code: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="検査表テンプレートの削除"
      message={`検査表テンプレート「${code}」を削除します。この操作は取り消せません。`}
      confirmLabel="削除する"
      warning="指示書で使用中のテンプレートは削除できません。無効化をご検討ください。"
    />
  );
}
