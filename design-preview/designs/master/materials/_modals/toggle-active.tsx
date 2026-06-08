/**
 * toggle-active.tsx — 素材の有効/無効切替ポップアップ
 *
 * Controlled modal opened from the material detail action menu / list row action.
 * Built on the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function ToggleMaterialActiveModal({
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
      title={isActive ? '素材の無効化' : '素材の有効化'}
      message={
        isActive
          ? `素材「${label}」を無効化します。新規の製品登録・素材入荷で選択できなくなります。`
          : `素材「${label}」を有効化します。再び製品登録・素材入荷で選択できるようになります。`
      }
      confirmLabel={isActive ? '無効化する' : '有効化する'}
      confirmColor={isActive ? 'red' : 'blue'}
      warning={isActive ? '在庫が残っている素材を無効化しても在庫数は保持されます。' : undefined}
    />
  );
}
