import { UsersTable } from "@/components/settings/UsersTable";
import { requireAppRead } from "@/lib/authz-page";
import { listAdminUsers } from "@/lib/users-admin";

export const dynamic = "force-dynamic";

/** ユーザー管理（SY01）— app.users の一覧。system 権限（READ）。 */
export default async function UsersPage() {
  const denied = await requireAppRead("user-management");
  if (denied) return denied;
  const users = await listAdminUsers();
  return <UsersTable rows={users} />;
}
