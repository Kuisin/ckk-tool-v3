import { notFound } from "next/navigation";
import { MovementDetail } from "@/components/inventory/movements/MovementDetail";
import { appLabelForKey } from "@/lib/app-list";
import { requireAppRead } from "@/lib/authz-page";
import { docIdOf, docNo } from "@/lib/doc-number";
import { docKeyFromParam } from "@/lib/doc-param";
import { formatDocPageTitle } from "@/lib/page-title";
import { getServerLocale } from "@/lib/user-preferences";
import { fetchInventoryMovement } from "../data";

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
      appLabelForKey("inventory-movements", "入出庫伝票", locale), // i18n-ignore — ja はそのまま使う（訳の実体は appLabelForKey 内の en/zh マップ）
      docNo(decodeURIComponent(id)),
    ),
  };
}

/** 入出庫伝票 詳細 (PD27). URL id = 法人コード付きの伝票番号（CKK~MOV-2026-00001）. */
export default async function InventoryMovementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("inventory-movements");
  if (denied) return denied;
  const { id } = await params;
  // 番号だけ・旧番号で来た URL は正規の URL へ転送される。
  const key = await docKeyFromParam(
    "inventory_movements",
    "MOV",
    id,
    "/inventory/movements",
  );
  const movement = await fetchInventoryMovement(docIdOf(key));
  if (!movement) notFound();

  return <MovementDetail movement={movement} />;
}
