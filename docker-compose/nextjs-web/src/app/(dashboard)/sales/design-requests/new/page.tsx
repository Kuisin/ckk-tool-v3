import { DesignRequestForm } from "@/components/sales/design-requests/DesignRequestForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchRecentQuoteOptions } from "../data";

export const dynamic = "force-dynamic";

/**
 * 設計依頼書 新規作成 (SA15)。
 *
 * 保存時に nextDocumentNumber("DESIGN") で依頼番号 DSG-YYYYMM-NNNNN を採番し
 * request_number に保存する。保存後は詳細ページへ遷移。
 */
export default async function SalesDesignRequestsNewPage() {
  const denied = await requireAppRead("design-requests");
  if (denied) return denied;
  // 見積書リンク用 — 直近の見積書をサーバーで読み込んで Select に渡す。
  const quoteOptions = await fetchRecentQuoteOptions();
  return <DesignRequestForm mode="create" quoteOptions={quoteOptions} />;
}
