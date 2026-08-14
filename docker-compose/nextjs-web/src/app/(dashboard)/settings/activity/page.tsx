import { ActivityLog } from "@/components/admin/ActivityLog";
import { listAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/** 操作履歴 一覧（管理者向け・全レコード横断）。 */
export default async function AdminActivityPage() {
  const denied = await requireAppRead("activity-log");
  if (denied) return denied;
  const entries = await listAuditEntries({ take: 300 });
  return <ActivityLog entries={entries} />;
}
