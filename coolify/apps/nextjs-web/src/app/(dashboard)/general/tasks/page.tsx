import { TasksView } from "@/components/general/TasksView";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { fetchPendingApprovalRequests } from "./approvals-data";
import { fetchInboxComments } from "./comments-data";
import { fetchMyPendingPlans } from "./data";
import { fetchFormTasks } from "./forms-data";

export const dynamic = "force-dynamic";

/**
 * 承認・予定 (CM01) — 個人の「やること」: 自分の作業予定（未完了の作業計画）と
 * 承認待ちの承認依頼の横断一覧（旧 承認管理 PD03。approve 権限がある人のみ）。
 */
export default async function GeneralTasksPage() {
  const denied = await requireAppRead("my-tasks");
  if (denied) return denied;

  const approveAuthz = await checkPermission("approve", "READ");
  const [plans, approvals, forms, comments] = await Promise.all([
    fetchMyPendingPlans(),
    approveAuthz.ok ? fetchPendingApprovalRequests() : Promise.resolve(null),
    fetchFormTasks(),
    fetchInboxComments(),
  ]);

  return (
    <TasksView
      approvals={approvals}
      comments={comments}
      forms={forms}
      plans={plans}
    />
  );
}
