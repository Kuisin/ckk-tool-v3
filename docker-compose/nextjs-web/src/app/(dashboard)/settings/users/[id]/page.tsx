import { notFound } from "next/navigation";
import { UserDetail } from "@/components/settings/UserDetail";
import { requireAppRead } from "@/lib/authz-page";
import { getAdminUser } from "@/lib/users-admin";

export const dynamic = "force-dynamic";

/** ユーザー管理（SY01）— ユーザー詳細（ロール割当・実効権限）。system 権限（READ）。 */
export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("user-management");
  if (denied) return denied;
  const { id } = await params;
  const user = await getAdminUser(id);
  if (!user) notFound();
  return <UserDetail user={user} />;
}
