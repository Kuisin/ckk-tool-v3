import { TasksView } from "@/components/general/TasksView";
import { checkPermission, sessionUserId } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { sanitizeHiddenTabs, TASK_TABS_SETTING_KEY } from "@/lib/tasks-tabs";
import { readViewSetting } from "@/lib/view-settings";
import { fetchPendingApprovalRequests } from "./approvals-data";
import { fetchInboxComments } from "./comments-data";
import { fetchCompletedRequests } from "./completions-data";
import { fetchMyPendingPlans } from "./data";
import { fetchFormTasks } from "./forms-data";

export const dynamic = "force-dynamic";

/**
 * 承認・予定 (CM01) — 個人の「やること」: 自分の作業予定（未完了の作業計画）と
 * 承認依頼中の承認依頼の横断一覧（旧 承認管理 PD03。approve 権限がある人のみ）。
 */
export default async function GeneralTasksPage() {
  const denied = await requireAppRead("my-tasks");
  if (denied) return denied;

  const approveAuthz = await checkPermission("approve", "READ");
  const userId = await sessionUserId();
  const [plans, approvals, forms, comments, completions, tabSetting] =
    await Promise.all([
      fetchMyPendingPlans(),
      approveAuthz.ok ? fetchPendingApprovalRequests() : Promise.resolve(null),
      fetchFormTasks(),
      fetchInboxComments(),
      fetchCompletedRequests(),
      readViewSetting(userId, TASK_TABS_SETTING_KEY),
    ]);

  return (
    <TasksView
      approvals={approvals}
      comments={comments}
      completions={completions}
      forms={forms}
      hiddenTabs={sanitizeHiddenTabs(tabSetting)}
      plans={plans}
    />
  );
}
