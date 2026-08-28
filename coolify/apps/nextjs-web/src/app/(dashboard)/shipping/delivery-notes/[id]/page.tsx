import { notFound } from "next/navigation";
import { DeliveryNoteDetail } from "@/components/shipping/delivery-notes/DeliveryNoteDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { formatDocNumber, parseDocKey } from "@/lib/doc-number";
import { isIssued, pdfStorageKey, storedPdfMeta } from "@/lib/document-pdf";
import { fetchInvoicesForDeliveryNote } from "../../../billing/invoices/data";
import { fetchDeliveryNote } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `納品書 ${decodeURIComponent(id)} | CKK 業務管理システム` };
}

/** 納品書 詳細 (SH22). URL id = 導出文書番号 DRN-YYYYMM-NNNNN. */
export default async function ShippingDeliveryNotesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("delivery-notes");
  if (denied) return denied;
  const { id } = await params;
  const key = parseDocKey(decodeURIComponent(id), "DRN");
  if (!key) notFound();

  const [note, auditEntries, invoices] = await Promise.all([
    fetchDeliveryNote(key),
    fetchAuditEntries("delivery_notes", formatDocNumber("DRN", key)),
    // 手続き状況の「次の書類へ」— この納品書を請求した請求書。
    fetchInvoicesForDeliveryNote(key),
  ]);
  if (!note) notFound();

  // 保管済み PDF のメタ（発行済みのみ。未生成なら null → 初回表示時に生成）。
  const pdfMeta = isIssued(note.status)
    ? await storedPdfMeta(pdfStorageKey.deliveryNote(note.deliveryNumber))
    : null;

  return (
    <DeliveryNoteDetail
      auditEntries={auditEntries}
      invoices={invoices}
      note={note}
      pdfMeta={pdfMeta}
    />
  );
}
