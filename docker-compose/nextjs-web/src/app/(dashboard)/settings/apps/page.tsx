import { AppFlagsTable } from "@/components/admin/AppFlagsTable";
import { listAppFlags } from "@/lib/app-flags";

export const dynamic = "force-dynamic";

/** アプリ管理（環境別 ON/OFF, feature_flags）。 */
export default async function AdminAppsPage() {
  const rows = await listAppFlags();
  return <AppFlagsTable rows={rows} />;
}
