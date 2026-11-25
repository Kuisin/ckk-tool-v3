import { notFound } from "next/navigation";
import { DeliveryNoteDetail } from "@/components/shipping/delivery-notes/DeliveryNoteDetail";
import { appLabelForKey } from "@/lib/app-list";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { docNo } from "@/lib/doc-number";
import { docKeyFromParam } from "@/lib/doc-param";
import { isIssued, pdfStorageKey, storedPdfMeta } from "@/lib/document-pdf";
import { formatDocPageTitle } from "@/lib/page-title";
import { getServerLocale } from "@/lib/user-preferences";
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
  const locale = await getServerLocale();
  return {
    title: formatDocPageTitle(
      appLabelForKey("delivery-notes", "納品書", locale), // i18n-ignore — ja はそのまま使う（訳の実体は appLabelForKey 内の en/zh マップ）
      docNo(decodeURIComponent(id)),
    ),
  };
}

/** 納品書 詳細 (SH22). URL id = 法人コード + 番号（`CKK~DRN-2026-00001`）。 */
export default async function ShippingDeliveryNotesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await requireAppRead("delivery-notes");
  if (denied) return denied;
  const { id } = await params;
  // 番号だけ・旧番号（DRN-YYYYMM-NNNNN）の URL は正規の URL へ転送される。
  const key = await docKeyFromParam(
    "delivery_notes",
    "DRN",
    id,
    "/shipping/delivery-notes",
    "",
    searchParams,
  );

  const [note, auditEntries, invoices] = await Promise.all([
    fetchDeliveryNote(key),
    fetchAuditEntries("delivery_notes", key.docRef),
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
