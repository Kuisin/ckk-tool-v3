import { notFound, redirect } from "next/navigation";
import { DeliveryOrderDetail } from "@/components/shipping/delivery-orders/DeliveryOrderDetail";
import { appLabelForKey } from "@/lib/app-list";
import { fetchApprovalState, fetchApprovalTrail } from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { loadChargeItemOptions } from "@/lib/charge-items";
import { prisma } from "@/lib/db";
import { docNo } from "@/lib/doc-number";
import { docKeyFromParam } from "@/lib/doc-param";
import { listMemos } from "@/lib/document-memos";
import { type LocalizedText, localized } from "@/lib/format";
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
      docNo(decodeURIComponent(id)),
    ),
  };
}

/** 出荷書 詳細 (SH21). URL id = 法人コード + 番号（`CKK~DOR-2026-00001`）。 */
export default async function ShippingDeliveryOrdersDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await requireAppRead("delivery-orders");
  if (denied) return denied;
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  // 旧接頭辞 SHP-…（改称前のメモ内リンク・通知など）は新番号へ読み替える。
  const legacy = /^SHP-(\d{6}-\d{1,6})$/.exec(decoded);
  if (legacy) redirect(`/shipping/delivery-orders/DOR-${legacy[1]}`);
  // 番号だけ・旧番号（DOR-YYYYMM-NNNNN）の URL は正規の URL へ転送される。
  const key = await docKeyFromParam(
    "delivery_orders",
    "DOR",
    id,
    "/shipping/delivery-orders",
    "",
    searchParams,
  );

  // 多態参照（監査・メモ・承認）は参照（doc_ref）で引く。
  const number = key.docRef;
  const [order, auditEntries, memos, approval, approvalTrail] =
    await Promise.all([
      fetchDeliveryOrder(key),
      fetchAuditEntries("delivery_orders", number),
      listMemos("delivery_orders", number),
      // 出荷書に承認が付くのは過不足納品のときだけ（§8）。依頼が無ければ
      // phase = NONE が返るので、通常の出荷では何も表示されない。
      fetchApprovalState("delivery_orders", number),
      fetchApprovalTrail("delivery_orders", number),
    ]);
  if (!order) notFound();

  // 追加料金（送料など）— **請求される実体はこちら**。指示書側の予定は
  // 出荷書を作るときに複写済みで、以後は出荷書だけを直す。
  const locale = await getServerLocale();
  const [chargeRows, chargeItems, chargeAuthz] = await Promise.all([
    prisma.deliveryOrderCharge.findMany({
      where: { deliveryOrder: { docRef: key.docRef } },
      orderBy: { sortOrder: "asc" },
      include: {
        chargeItem: { select: { name: true } },
        sourceWorkOrder: { select: { workOrderNumber: true } },
      },
    }),
    loadChargeItemOptions(locale),
    checkPermission("delivery_order", "UPDATE"),
  ]);

  return (
    <DeliveryOrderDetail
      approval={approval}
      approvalTrail={approvalTrail}
      auditEntries={auditEntries}
      canEditCharges={chargeAuthz.ok && order.status === "DRAFT"}
      chargeItems={chargeItems}
      charges={chargeRows.map((c) => ({
        id: c.id,
        chargeItemId: c.chargeItemId,
        chargeItemLabel: localized(
          c.chargeItem.name as LocalizedText | null,
          locale,
        ),
        description: c.description ?? "",
        quantity: c.quantity,
        unitPrice: Number(c.unitPrice),
        amount: Number(c.amount),
        sourceWorkOrderNumber: c.sourceWorkOrder?.workOrderNumber ?? null,
      }))}
      memos={memos}
      order={order}
    />
  );
}
