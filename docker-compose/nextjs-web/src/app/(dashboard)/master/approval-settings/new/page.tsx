import { ApprovalGroupForm } from "@/components/master/approval-settings/ApprovalGroupForm";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/** 承認グループ 新規作成 (MS1B). */
export default async function MasterApprovalGroupsNewPage() {
  const denied = await requireAppRead("master-approval-groups");
  if (denied) return denied;
  return <ApprovalGroupForm />;
}
