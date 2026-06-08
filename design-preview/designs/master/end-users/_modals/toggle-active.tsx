/**
 * toggle-active.tsx — 最終需要家 有効/無効 切替確認ポップアップ
 *
 * Controlled modal opened from the end-user list row / bulk actions and the
 * detail action menu. Built on the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function ToggleActiveModal({
  opened,
  onClose,
  count,
  next,
  endUserName,
}: ModalBaseProps & {
  /** Number of end-users affected (bulk). Ignored when endUserName is set. */
  count?: number;
  /** Target state: true = 有効化, false = 無効化. */
  next: boolean;
  /** Single-target display name (detail page). */
  endUserName?: string;
}) {
  const verb = next ? '有効化' : '無効化';
  const target = endUserName
    ? `最終需要家「${endUserName}」`
    : `選択した ${count ?? 0} 件の最終需要家`;

  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title={`最終需要家の${verb}`}
      message={`${target}を${verb}します。`}
      confirmLabel={verb}
      confirmColor={next ? 'green' : 'gray'}
      warning={
        next
          ? undefined
          : '無効化すると、新規の納品書・直送指定でこの最終需要家を選択できなくなります。'
      }
    />
  );
}
