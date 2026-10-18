/**
 * accounting-export.tsx — 請求書 会計連携 CSV エクスポート確認ポップアップ
 *
 * Controlled modal opened from the invoice detail action menu.
 * Shows a re-export warning when the invoice was already exported
 * (`accounting_exported_at`) to prevent duplicate journal posting.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function AccountingExportInvoiceModal({
  opened,
  onClose,
  invoiceNumber,
  alreadyExportedAt,
}: ModalBaseProps & { invoiceNumber: string; alreadyExportedAt?: string | null }) {
  const exported = Boolean(alreadyExportedAt);
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="会計連携CSVエクスポート"
      message={`請求書「${invoiceNumber}」を会計ソフト向けの仕訳 CSV でエクスポートします。`}
      confirmLabel="エクスポート"
      confirmColor={exported ? 'red' : 'blue'}
      warning={
        exported
          ? `この請求書は ${alreadyExportedAt} にエクスポート済みです。再エクスポートは仕訳の二重計上につながる恐れがあります。`
          : undefined
      }
    />
  );
}
