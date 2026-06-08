/**
 * cancel.tsx — 見積書キャンセル確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the quote detail action menu.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function CancelQuoteModal({
  opened,
  onClose,
  quoteNumber,
}: ModalBaseProps & { quoteNumber: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="見積書のキャンセル"
      message={`見積書「${quoteNumber}」をキャンセルします。この操作は取り消せません。`}
      confirmLabel="キャンセルする"
      warning="発行済みの見積書をキャンセルすると、顧客への再発行が必要になります。"
    />
  );
}
