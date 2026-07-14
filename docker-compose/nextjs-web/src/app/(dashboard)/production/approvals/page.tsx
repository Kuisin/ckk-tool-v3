import { ApprovalRequestTable } from "@/components/production/approvals/ApprovalRequestTable";
import { fetchPendingApprovalRequests } from "./data";

export const dynamic = "force-dynamic";

/**
 * 承認管理 一覧 (PD03) — PENDING の承認依頼を対象種別（指示書 / 素材発注書 /
 * 受注請書）横断で表示する。依頼行のない旧データも行ワークフロー列から補完。
 */
export default async function ProductionApprovalsPage() {
  const rows = await fetchPendingApprovalRequests();
  return <ApprovalRequestTable rows={rows} />;
}
