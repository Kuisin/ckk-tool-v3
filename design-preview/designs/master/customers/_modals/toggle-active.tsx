/**
 * toggle-active.tsx — 顧客 有効/無効 切替確認ポップアップ
 *
 * Controlled modal opened from the customer list row / bulk actions and the
 * detail action menu. Built on the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function ToggleActiveModal({
  opened,
  onClose,
  count,
  next,
  customerName,
}: ModalBaseProps & {
  /** Number of customers affected (bulk). Ignored when customerName is set. */
  count?: number;
  /** Target state: true = 有効化, false = 無効化. */
  next: boolean;
  /** Single-target display name (detail page). */
  customerName?: string;
}) {
  const verb = next ? '有効化' : '無効化';
  const target = customerName
    ? `顧客「${customerName}」`
    : `選択した ${count ?? 0} 件の顧客`;

  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title={`顧客の${verb}`}
      message={`${target}を${verb}します。`}
      confirmLabel={verb}
      confirmColor={next ? 'green' : 'gray'}
      warning={
        next
          ? undefined
          : '無効化すると、新規の見積書・受注書でこの顧客を選択できなくなります。'
      }
    />
  );
}
