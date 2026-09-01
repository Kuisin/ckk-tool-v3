import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MaterialReceiptDetail } from "@/components/purchase/material-receipts/MaterialReceiptDetail";
import { listAttachments } from "@/lib/attachments";
import { requireAppRead } from "@/lib/authz-page";
import { fetchMaterialReceipt } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別のみ、業務データなし）。 */
export async function generateMetadata() {
  const tr = await getTranslations();
  return {
    title: tr(
      "purchase.materialReceipts.materialReceiptDetailsCkkBusinessManagement",
    ),
  };
}

/** 素材入荷 詳細 (PU23). URL id = uuid. */
export default async function PurchaseMaterialReceiptsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("material-receipts");
  if (denied) return denied;
  const { id } = await params;
  const receiptId = decodeURIComponent(id);
  const [receipt, attachments] = await Promise.all([
    fetchMaterialReceipt(receiptId),
    listAttachments("material_receipts", receiptId),
  ]);
  if (!receipt) notFound();

  return <MaterialReceiptDetail attachments={attachments} receipt={receipt} />;
}
