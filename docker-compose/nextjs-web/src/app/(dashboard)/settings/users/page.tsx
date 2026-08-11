import { IconLock } from "@tabler/icons-react";
import { UsersTable } from "@/components/settings/UsersTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { checkPermission } from "@/lib/authz";
import { listAdminUsers } from "@/lib/users-admin";

export const dynamic = "force-dynamic";

/** ユーザー管理（SY01）— app.users の一覧。system 権限（READ）。 */
export default async function UsersPage() {
  const authz = await checkPermission("system", "READ");
  if (!authz.ok) {
    return (
      <>
        <PageHeader
          breadcrumbs={["システム", "ユーザー管理"]}
          title="ユーザー管理"
        />
        <EmptyState icon={<IconLock size={28} />} message={authz.error} />
      </>
    );
  }
  const users = await listAdminUsers();
  return <UsersTable rows={users} />;
}
