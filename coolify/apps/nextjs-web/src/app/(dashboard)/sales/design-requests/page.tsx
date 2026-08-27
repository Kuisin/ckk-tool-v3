import { DesignRequestTable } from "@/components/sales/design-requests/DesignRequestTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchDesignRequests } from "./data";

export const dynamic = "force-dynamic";

/** 設計依頼書 一覧 (SA06). */
export default async function SalesDesignRequestsPage() {
  const denied = await requireAppRead("design-requests");
  if (denied) return denied;
  const rows = await fetchDesignRequests();
  return <DesignRequestTable rows={rows} />;
}
