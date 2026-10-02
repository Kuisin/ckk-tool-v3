/**
 * accounting-export.tsx — 締日処理 会計連携 CSV エクスポート確認ポップアップ
 *
 * Controlled modal opened from the closing detail action.
 * Shows a re-export warning when already exported (`accounting_exported_at`)
 * to prevent duplicate journal posting.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function AccountingExportClosingModal({
  opened,
  onClose,
  customerName,
  closingDate,
  alreadyExportedAt,
}: ModalBaseProps & {
  customerName: string;
  closingDate: string;
  alreadyExportedAt?: string | null;
}) {
  const exported = Boolean(alreadyExportedAt);
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="会計連携CSVエクスポート"
      message={`締日処理「${customerName} — ${closingDate} 締」を会計ソフト向けの仕訳 CSV でエクスポートします。`}
      confirmLabel="エクスポート"
      confirmColor={exported ? 'red' : 'blue'}
      warning={
        exported
          ? `この締日処理は ${alreadyExportedAt} にエクスポート済みです。再エクスポートは仕訳の二重計上につながる恐れがあります。`
          : undefined
      }
    />
  );
}
