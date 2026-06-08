/**
 * delete.tsx — 素材削除確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the material detail action menu / list row action.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function DeleteMaterialModal({
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
      title="素材の削除"
      message={`素材「${label}」を削除します。この操作は取り消せません。`}
      confirmLabel="削除する"
      warning="製品・在庫で参照されている素材は削除できません。無効化をご検討ください。"
    />
  );
}
