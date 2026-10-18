import { ClosingTable } from "@/components/billing/closings/ClosingTable";
import { isoDateJst } from "@/components/sales/price-lists/model";
import { requireAppRead } from "@/lib/authz-page";
import { fetchClosings } from "./data";

export const dynamic = "force-dynamic";

/** 締日処理 一覧 (BL02). */
export default async function BillingClosingsPage() {
  const denied = await requireAppRead("billing-closings");
  if (denied) return denied;
  const rows = await fetchClosings();
  // 「締日を過ぎたか」はサーバーの JST 暦日で決める — クライアントの時計に
  // 委ねると、端末のタイムゾーン次第で押せる / 押せないが変わる。
  return <ClosingTable rows={rows} todayIso={isoDateJst(new Date())} />;
}
