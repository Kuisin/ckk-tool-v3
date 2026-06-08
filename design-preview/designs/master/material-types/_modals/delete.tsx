/**
 * delete.tsx — 材種削除確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the material-type detail action menu / list row action.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function DeleteMaterialTypeModal({
  opened,
  onClose,
  code,
  name,
}: ModalBaseProps & { code: string; name?: string }) {
  const label = name ? `${name}（${code}）` : code;
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="材種の削除"
      message={`材種「${label}」を削除します。この操作は取り消せません。`}
      confirmLabel="削除する"
      warning="この材種に紐づく素材が存在する場合は削除できません。無効化をご検討ください。"
    />
  );
}
