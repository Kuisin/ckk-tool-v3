import { notFound } from "next/navigation";
import { StockTakeDetail } from "@/components/production/stock-takes/StockTakeDetail";
import { appLabelForKey } from "@/lib/app-list";
import { fetchApprovalState, fetchApprovalTrail } from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { formatDocPageTitle } from "@/lib/page-title";
import { getServerLocale } from "@/lib/user-preferences";
import { fetchStockTake } from "../data";

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
      appLabelForKey("stock-takes", "棚卸", locale), // i18n-ignore — ja はそのまま使う（訳の実体は appLabelForKey 内の en/zh マップ）
      decodeURIComponent(id),
    ),
  };
}

/** 棚卸 詳細 (PD28). URL id = 表示番号 STK-YYYYMM-NNNNN. */
export default async function ProductionStockTakesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("stock-takes");
  if (denied) return denied;
  const { id } = await params;
  const stockTakeNumber = decodeURIComponent(id);

  const [stockTake, auditEntries, approval, trail] = await Promise.all([
    fetchStockTake(stockTakeNumber),
    fetchAuditEntries("stock_takes", stockTakeNumber),
    fetchApprovalState("stock_takes", stockTakeNumber),
    fetchApprovalTrail("stock_takes", stockTakeNumber),
  ]);
  if (!stockTake) notFound();

  return (
    <StockTakeDetail
      approval={approval}
      approvalTrail={trail}
      auditEntries={auditEntries}
      stockTake={stockTake}
    />
  );
}
