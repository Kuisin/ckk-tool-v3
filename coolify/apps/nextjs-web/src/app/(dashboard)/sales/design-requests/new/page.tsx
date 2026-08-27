import { DesignRequestForm } from "@/components/sales/design-requests/DesignRequestForm";
import { requireAppRead } from "@/lib/authz-page";
import {
  fetchEmployeeOptions,
  fetchOrderLineRef,
  fetchProductRef,
  fetchQuoteRef,
  fetchRecentQuoteOptions,
} from "../data";

export const dynamic = "force-dynamic";

/**
 * 設計依頼書 新規作成 (SA16)。
 *
 * 保存時に nextDocumentNumber("DESIGN") で依頼番号 DSG-YYYYMM-NNNNN を採番し
 * request_number に保存する。保存後は詳細ページへ遷移。
 *
 * 見積書 / 注文明細 / 製品からの起票をクエリで受ける:
 *   `?quote=QOT-YYYYMM-NNNNN` — 見積書詳細から（トリガー = 見積時）
 *   `?orderLine=<uuid>`       — 注文明細詳細から（トリガー = 受注時）
 *   `?product=<id>`           — 製品マスタ・見積明細の単価未解決から
 * **id はここで実在を確かめてラベル付きの ref に解決してから**フォームへ渡す
 * （生のクエリ文字列をクライアントへ流さない — 存在しない番号でトリガーだけ
 * 固定される事故を防ぐ）。
 */
export default async function SalesDesignRequestsNewPage({
  searchParams,
}: {
  searchParams: Promise<{
    quote?: string;
    orderLine?: string;
    product?: string;
  }>;
}) {
  const denied = await requireAppRead("design-requests");
  if (denied) return denied;
  const sp = await searchParams;

  const [quoteOptions, assigneeOptions, quoteRef, orderLineRef, productRef] =
    await Promise.all([
      // 見積書リンク用 — 直近の見積書をサーバーで読み込んで Select に渡す。
      fetchRecentQuoteOptions(),
      fetchEmployeeOptions(),
      sp.quote ? fetchQuoteRef(sp.quote) : null,
      sp.orderLine ? fetchOrderLineRef(sp.orderLine) : null,
      sp.product ? fetchProductRef(sp.product) : null,
    ]);

  return (
    <DesignRequestForm
      assigneeOptions={assigneeOptions}
      initialOrderLine={
        orderLineRef
          ? { value: orderLineRef.id, label: orderLineRef.label }
          : null
      }
      initialProduct={productRef}
      initialQuote={quoteRef}
      mode="create"
      quoteOptions={quoteOptions}
    />
  );
}
