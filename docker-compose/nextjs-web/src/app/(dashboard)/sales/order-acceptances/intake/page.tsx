import { redirect } from "next/navigation";

/** 旧 intake デモルート — 取込状況一覧（SA03 本体）へ統合済み。 */
export default function SalesOrderAcceptanceIntakePage() {
  redirect("/sales/order-acceptances");
}
