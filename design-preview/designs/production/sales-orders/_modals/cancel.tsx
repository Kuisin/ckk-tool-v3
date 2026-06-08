/**
 * cancel.tsx — 受注書キャンセル確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the sales-order detail action menu.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function CancelSalesOrderModal({
  opened,
  onClose,
  salesOrderNumber,
}: ModalBaseProps & { salesOrderNumber: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="受注書のキャンセル"
      message={`受注書「${salesOrderNumber}」をキャンセルします。この操作は取り消せません。`}
      confirmLabel="キャンセルする"
      warning="関連する指示書が作成済みの場合、先に指示書をキャンセルしてください。"
    />
  );
}
