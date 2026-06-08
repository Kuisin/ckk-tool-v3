/**
 * release.tsx — 製品在庫 予約解除ポップアップ（inventory_reservations: RELEASED）
 *
 * Controlled ConfirmModal: 予約中の在庫を解除する破壊的操作。
 * Built on the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../../lib/modals';

export function ReleaseProductReservationModal({
  opened,
  onClose,
  label,
  reserved,
  unit,
}: ModalBaseProps & { label: string; reserved: number; unit: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="予約解除"
      message={`${label} の予約 ${reserved} ${unit} を解除します。この操作は取り消せません。`}
      confirmLabel="解除する"
      warning="解除すると引当が外れ、他の受注書へ再引当が必要になります。"
    />
  );
}
