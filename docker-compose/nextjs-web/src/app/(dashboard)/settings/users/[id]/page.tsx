import { IconLock } from "@tabler/icons-react";
import { notFound } from "next/navigation";
import { UserDetail } from "@/components/settings/UserDetail";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { checkPermission } from "@/lib/authz";
import { getAdminUser } from "@/lib/users-admin";

export const dynamic = "force-dynamic";

/** ユーザー管理（SY01）— ユーザー詳細（ロール割当・実効権限）。system 権限（READ）。 */
export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const authz = await checkPermission("system", "READ");
  if (!authz.ok) {
    return (
      <>
        <PageHeader
          breadcrumbs={[
            "システム",
            { label: "ユーザー管理", href: "/settings/users" },
          ]}
          title="ユーザー詳細"
        />
        <EmptyState icon={<IconLock size={28} />} message={authz.error} />
      </>
    );
  }
  const { id } = await params;
  const user = await getAdminUser(id);
  if (!user) notFound();
  return <UserDetail user={user} />;
}
