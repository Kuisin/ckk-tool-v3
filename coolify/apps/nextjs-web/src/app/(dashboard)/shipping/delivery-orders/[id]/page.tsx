import { notFound, redirect } from "next/navigation";
import { DeliveryOrderDetail } from "@/components/shipping/delivery-orders/DeliveryOrderDetail";
import { appLabelForKey } from "@/lib/app-list";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { formatDocNumber, parseDocKey } from "@/lib/doc-number";
import { listMemos } from "@/lib/document-memos";
import { formatDocPageTitle } from "@/lib/page-title";
import { getServerLocale } from "@/lib/user-preferences";
import { fetchDeliveryOrder } from "../data";

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
      appLabelForKey("delivery-orders", "出荷書", locale), // i18n-ignore — ja はそのまま使う（訳の実体は appLabelForKey 内の en/zh マップ）
      decodeURIComponent(id),
    ),
  };
}

/** 出荷書 詳細 (SH21). URL id = 導出文書番号 DOR-YYYYMM-NNNNN. */
export default async function ShippingDeliveryOrdersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("delivery-orders");
  if (denied) return denied;
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  // 旧接頭辞 SHP-…（改称前のメモ内リンク・通知など）は新番号へ読み替える。
  const legacy = /^SHP-(\d{6}-\d{1,6})$/.exec(decoded);
  if (legacy) redirect(`/shipping/delivery-orders/DOR-${legacy[1]}`);
  const key = parseDocKey(decoded, "DOR");
  if (!key) notFound();

  const [order, auditEntries, memos] = await Promise.all([
    fetchDeliveryOrder(key),
    fetchAuditEntries("delivery_orders", formatDocNumber("DOR", key)),
    listMemos("delivery_orders", formatDocNumber("DOR", key)),
  ]);
  if (!order) notFound();

  return (
    <DeliveryOrderDetail
      auditEntries={auditEntries}
      memos={memos}
      order={order}
    />
  );
}
