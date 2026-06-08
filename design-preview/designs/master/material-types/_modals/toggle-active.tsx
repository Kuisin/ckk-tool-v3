/**
 * toggle-active.tsx — 材種の有効/無効切替ポップアップ
 *
 * Controlled modal opened from the material-type detail action menu / list row action.
 * Built on the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function ToggleMaterialTypeActiveModal({
  opened,
  onClose,
  code,
  name,
  isActive,
}: ModalBaseProps & { code: string; name?: string; isActive: boolean }) {
  const label = name ? `${name}（${code}）` : code;
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title={isActive ? '材種の無効化' : '材種の有効化'}
      message={
        isActive
          ? `材種「${label}」を無効化します。新規の素材登録で選択できなくなります。`
          : `材種「${label}」を有効化します。再び素材登録で選択できるようになります。`
      }
      confirmLabel={isActive ? '無効化する' : '有効化する'}
      confirmColor={isActive ? 'red' : 'blue'}
    />
  );
}
