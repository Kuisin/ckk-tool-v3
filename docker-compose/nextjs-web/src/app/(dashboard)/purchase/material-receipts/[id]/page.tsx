import { notFound } from "next/navigation";
import { MaterialReceiptDetail } from "@/components/purchase/material-receipts/MaterialReceiptDetail";
import { listAttachments } from "@/lib/attachments";
import { fetchMaterialReceipt } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別のみ、業務データなし）。 */
export async function generateMetadata() {
  return { title: "素材入荷 詳細 | CKK 業務管理システム" };
}

/** 素材入荷 詳細 (PU21). URL id = uuid. */
export default async function PurchaseMaterialReceiptsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const receiptId = decodeURIComponent(id);
  const [receipt, attachments] = await Promise.all([
    fetchMaterialReceipt(receiptId),
    listAttachments("material_receipts", receiptId),
  ]);
  if (!receipt) notFound();

  return <MaterialReceiptDetail attachments={attachments} receipt={receipt} />;
}
