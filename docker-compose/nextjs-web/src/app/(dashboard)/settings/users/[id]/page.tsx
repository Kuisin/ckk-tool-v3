import { notFound } from "next/navigation";
import { UserDetail } from "@/components/settings/UserDetail";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { getAdminUser, listActivePlantOptions } from "@/lib/users-admin";

export const dynamic = "force-dynamic";

/** ユーザー管理（SY01）— ユーザー詳細（ロール割当・実効権限・所属拠点）。system 権限（READ）。 */
export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("user-management");
  if (denied) return denied;
  const { id } = await params;
  const [user, plantOptions, adminAuthz] = await Promise.all([
    getAdminUser(id),
    listActivePlantOptions(),
    checkPermission("system", "ADMIN"),
  ]);
  if (!user) notFound();
  return (
    <UserDetail
      canEditPlants={adminAuthz.ok}
      plantOptions={plantOptions}
      user={user}
    />
  );
}
