import { ClosingTable } from "@/components/billing/closings/ClosingTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchClosings } from "./data";

export const dynamic = "force-dynamic";

/** 締日処理 一覧 (BL02). */
export default async function BillingClosingsPage() {
  const denied = await requireAppRead("billing-closings");
  if (denied) return denied;
  const rows = await fetchClosings();
  return <ClosingTable rows={rows} />;
}
