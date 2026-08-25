import { notFound } from "next/navigation";
import { BootstrapAdminCard } from "@/components/settings/BootstrapAdminCard";
import { UserDetail } from "@/components/settings/UserDetail";
import { UserSuspensionPanel } from "@/components/settings/UserSuspensionPanel";
import { checkPermission, sessionUserId } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { bootstrapAdminState } from "@/lib/bootstrap-admin-core";
import { listLoginAttempts, listUserDevices } from "@/lib/login-attempts";
import {
  getAdminCoverage,
  getAdminUser,
  getBootstrapAdminSnapshot,
  listActivePlantOptions,
} from "@/lib/users-admin";

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
  const [
    user,
    plantOptions,
    adminAuthz,
    bootstrap,
    actorId,
    coverage,
    attempts,
    devices,
  ] = await Promise.all([
    getAdminUser(id),
    listActivePlantOptions(),
    checkPermission("system", "ADMIN"),
    getBootstrapAdminSnapshot(),
    sessionUserId(),
    getAdminCoverage(id),
    listLoginAttempts({ userId: id, days: 30, take: 30 }),
    listUserDevices(id),
  ]);
  if (!user) notFound();

  // 初期管理者の詳細を開いたときだけカードを出す。判定は純関数に委ねる
  // （サーバー側 disableBootstrapAdmin と同じ関数）。
  const bootstrapState = bootstrapAdminState({
    username: user.username,
    isActive: user.isActive,
    passwordChangeRequired: bootstrap?.passwordChangeRequired ?? false,
    otherActiveAdminCount: bootstrap?.otherActiveAdminCount ?? 0,
  });

  return (
    <>
      <BootstrapAdminCard
        canAdminister={adminAuthz.ok}
        state={bootstrapState}
      />
      <UserDetail
        canEditPlants={adminAuthz.ok}
        loginAttempts={attempts.rows}
        plantOptions={plantOptions}
        user={user}
        userDevices={devices}
      />
      {/* 初期管理者は専用カード（BootstrapAdminCard）が担当するので二重に出さない。 */}
      {bootstrapState.status === "not-bootstrap" && actorId && (
        <UserSuspensionPanel
          actorId={actorId}
          canAdminister={adminAuthz.ok}
          otherActiveAdminCount={coverage.otherActiveAdminCount}
          targetIsAdmin={coverage.targetIsAdmin}
          user={user}
        />
      )}
    </>
  );
}
