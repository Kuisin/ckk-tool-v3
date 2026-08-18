import { redirect } from "next/navigation";
import { requireAppRead } from "@/lib/authz-page";

/** 旧 intake デモルート — 取込状況一覧（SA04 本体）へ統合済み。 */
export default async function OrderLineAcceptanceIntakePage() {
  const denied = await requireAppRead("order-acceptances");
  if (denied) return denied;
  redirect("/sales/order-acceptances");
}
