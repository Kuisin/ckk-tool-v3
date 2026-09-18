import { notFound } from "next/navigation";
import { MovementDetail } from "@/components/production/inventory/movements/MovementDetail";
import { appLabelForKey } from "@/lib/app-list";
import { requireAppRead } from "@/lib/authz-page";
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
      decodeURIComponent(id),
    ),
  };
}

/** 入出庫伝票 詳細 (PD27). URL id = 導出文書番号 MOV-YYYYMM-NNNNN. */
export default async function InventoryMovementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("inventory-movements");
  if (denied) return denied;
  const { id } = await params;
  const movement = await fetchInventoryMovement(decodeURIComponent(id));
  if (!movement) notFound();

  return <MovementDetail movement={movement} />;
}
