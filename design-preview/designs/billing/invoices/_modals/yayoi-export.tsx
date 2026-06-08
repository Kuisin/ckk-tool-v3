/**
 * yayoi-export.tsx — 請求書 弥生会計 Next CSV エクスポート確認ポップアップ
 *
 * Controlled modal opened from the invoice detail action menu.
 * Shows a re-export warning when the invoice was already exported
 * (`yayoi_exported_at`) to prevent duplicate journal posting.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function YayoiExportInvoiceModal({
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
      title="弥生CSVエクスポート"
      message={`請求書「${invoiceNumber}」を弥生会計 Next 形式の CSV でエクスポートします。`}
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
