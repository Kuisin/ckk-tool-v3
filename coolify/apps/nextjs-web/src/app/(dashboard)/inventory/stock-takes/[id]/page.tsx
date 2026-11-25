import { notFound } from "next/navigation";
import { StockTakeDetail } from "@/components/inventory/stock-takes/StockTakeDetail";
import { appLabelForKey } from "@/lib/app-list";
import { fetchApprovalState, fetchApprovalTrail } from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { docIdOf, docNo } from "@/lib/doc-number";
import { docKeyFromParam } from "@/lib/doc-param";
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
      docNo(decodeURIComponent(id)),
    ),
  };
}

/** 棚卸 詳細 (PD28). URL id = 法人コード付きの棚卸番号（CKK~STK-2026-00001）. */
export default async function ProductionStockTakesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await requireAppRead("stock-takes");
  if (denied) return denied;
  const { id } = await params;
  // 番号だけ・旧番号で来た URL は正規の URL へ転送される。
  const stockTakeNumber = docIdOf(
    await docKeyFromParam(
      "stock_takes",
      "STK",
      id,
      "/inventory/stock-takes",
      "",
      searchParams,
    ),
  );

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
