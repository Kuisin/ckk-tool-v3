import { AppFlagsTable } from "@/components/admin/AppFlagsTable";
import { listAppFlags } from "@/lib/app-flags";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/** アプリ管理（環境別 ON/OFF, feature_flags）。 */
export default async function AdminAppsPage() {
  const denied = await requireAppRead("app-management");
  if (denied) return denied;
  const rows = await listAppFlags();
  return <AppFlagsTable rows={rows} />;
}
