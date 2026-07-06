import { ActivityLog } from "@/components/admin/ActivityLog";
import { listAuditEntries } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** 操作履歴 一覧（管理者向け・全レコード横断）。 */
export default async function AdminActivityPage() {
  const entries = await listAuditEntries({ take: 300 });
  return <ActivityLog entries={entries} />;
}
