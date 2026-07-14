import { DesignRequestTable } from "@/components/sales/design-requests/DesignRequestTable";
import { fetchDesignRequests } from "./data";

export const dynamic = "force-dynamic";

/** 設計依頼書 一覧 (SA04). */
export default async function SalesDesignRequestsPage() {
  const rows = await fetchDesignRequests();
  return <DesignRequestTable rows={rows} />;
}
