import { ClosingTable } from "@/components/billing/closings/ClosingTable";
import { fetchClosings } from "./data";

export const dynamic = "force-dynamic";

/** 締日処理 一覧 (BL02). */
export default async function BillingClosingsPage() {
  const rows = await fetchClosings();
  return <ClosingTable rows={rows} />;
}
