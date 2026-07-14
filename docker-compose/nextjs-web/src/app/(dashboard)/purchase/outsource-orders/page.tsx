import { OutsourceTable } from "@/components/purchase/outsource-orders/OutsourceTable";
import { fetchOutsourceSteps } from "./data";

export const dynamic = "force-dynamic";

/**
 * 外注依頼 一覧 (PU02) — 読み取り専用。
 *
 * 指示書の外注工程（work_order_steps.execution_location = OUTSOURCE）を
 * 横断的に一覧する。依頼日・入荷予定日・入荷日の編集は工程実行画面で行う
 * （行クリックで遷移）。新規作成・編集ページは持たない。
 */
export default async function PurchaseOutsourceOrdersPage() {
  const rows = await fetchOutsourceSteps();
  return <OutsourceTable rows={rows} />;
}
