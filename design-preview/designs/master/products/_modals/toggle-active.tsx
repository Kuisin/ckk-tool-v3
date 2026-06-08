/**
 * toggle-active.tsx — 製品の有効/無効切替ポップアップ
 *
 * Controlled modal opened from the product detail action menu / list row action.
 * Built on the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function ToggleProductActiveModal({
  opened,
  onClose,
  productCode,
  productName,
  isActive,
}: ModalBaseProps & { productCode: string; productName?: string; isActive: boolean }) {
  const label = productName ? `${productName}（${productCode}）` : productCode;
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title={isActive ? '製品の無効化' : '製品の有効化'}
      message={
        isActive
          ? `製品「${label}」を無効化します。新規の見積・受注で選択できなくなります。`
          : `製品「${label}」を有効化します。再び見積・受注で選択できるようになります。`
      }
      confirmLabel={isActive ? '無効化する' : '有効化する'}
      confirmColor={isActive ? 'red' : 'blue'}
      warning={isActive ? '在庫が残っている製品を無効化しても在庫数は保持されます。' : undefined}
    />
  );
}
