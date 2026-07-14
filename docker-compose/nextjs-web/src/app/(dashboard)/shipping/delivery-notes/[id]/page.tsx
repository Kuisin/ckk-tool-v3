import { notFound } from "next/navigation";
import { DeliveryNoteDetail } from "@/components/shipping/delivery-notes/DeliveryNoteDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { formatDocNumber, parseDocKey } from "@/lib/doc-number";
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
  const { id } = await params;
  const key = parseDocKey(decodeURIComponent(id), "DRN");
  if (!key) notFound();

  const [note, auditEntries] = await Promise.all([
    fetchDeliveryNote(key),
    fetchAuditEntries("delivery_notes", formatDocNumber("DRN", key)),
  ]);
  if (!note) notFound();

  return <DeliveryNoteDetail auditEntries={auditEntries} note={note} />;
}
