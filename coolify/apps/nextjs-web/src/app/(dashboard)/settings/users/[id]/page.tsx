import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BootstrapAdminCard } from "@/components/settings/BootstrapAdminCard";
import { UserDetail } from "@/components/settings/UserDetail";
import { UserSuspensionPanel } from "@/components/settings/UserSuspensionPanel";
import { checkPermission, sessionUserId } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { bootstrapAdminState } from "@/lib/bootstrap-admin-core";
import {
  listLoginAttempts,
  listUserDevices,
  toEmbeddedLoginAttemptRow,
} from "@/lib/login-attempts";
import {
  getAdminCoverage,
  getAdminUser,
  getBootstrapAdminSnapshot,
  listActivePlantOptions,
  listAdminRoleIds,
  listRoleOptions,
} from "@/lib/users-admin";

export const dynamic = "force-dynamic";

/**
 * ユーザー管理（SY01）— ユーザー詳細（ロール割当・実効権限・所属拠点）。
 * 閲覧は system 権限（READ）、ロール割当と所属拠点の変更は user_admin。
 */
export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("user-management");
  if (denied) return denied;
  const tr = await getTranslations();
  const { id } = await params;
  const [
    user,
    plantOptions,
    roleOptions,
    adminRoleIds,
    adminAuthz,
    userAdminAuthz,
    bootstrap,
    actorId,
    coverage,
    attempts,
    devices,
  ] = await Promise.all([
    getAdminUser(id),
    listActivePlantOptions(),
    listRoleOptions(),
    listAdminRoleIds(),
    checkPermission("system", "ADMIN"),
    checkPermission("user_admin", "UPDATE"),
    getBootstrapAdminSnapshot(),
    sessionUserId(),
    getAdminCoverage(id),
    listLoginAttempts({ userId: id, days: 30, take: 30 }),
    listUserDevices(id),
  ]);
  if (!user) notFound();

  // 利用停止 / 復帰 / 所属拠点 / ロール割当の変更は特権操作（user_admin）。管理者は素通しで
  // 直接適用でき、それ以外は変更依頼を出して承認を待つ。画面は同じボタンを出す
  // が、ラベルと理由欄の要否がここで変わる（判定はサーバー側 applyOrRequest と
  // 同じ 2 つの条件なので、押してから断られることはない）。
  const canChangeUser = userAdminAuthz.ok;
  const requiresApproval = canChangeUser && !adminAuthz.ok;

  // 初期管理者の詳細を開いたときだけカードを出す。判定は純関数に委ねる
  // （サーバー側 disableBootstrapAdmin と同じ関数）。
  const bootstrapState = bootstrapAdminState(
    {
      username: user.username,
      isActive: user.isActive,
      passwordChangeRequired: bootstrap?.passwordChangeRequired ?? false,
      otherActiveAdminCount: bootstrap?.otherActiveAdminCount ?? 0,
    },
    tr,
  );

  return (
    <>
      <BootstrapAdminCard
        canAdminister={adminAuthz.ok}
        state={bootstrapState}
      />
      <UserDetail
        canEditPlants={canChangeUser}
        // 自分のロールは自分で変えられない（canUpdateRoles と同じ条件）。
        // ここで編集ボタンごと出さないのは、押せない操作を置かないため。
        canEditRoles={canChangeUser && actorId !== user.id}
        loginAttempts={attempts.rows.map(toEmbeddedLoginAttemptRow)}
        plantOptions={plantOptions}
        requiresApproval={requiresApproval}
        roleGuard={{
          actorId: actorId ?? "",
          adminRoleIds,
          targetIsAdmin: coverage.targetIsAdmin,
          otherActiveAdminCount: coverage.otherActiveAdminCount,
        }}
        roleOptions={roleOptions}
        user={user}
        userDevices={devices}
      />
      {/* 初期管理者は専用カード（BootstrapAdminCard）が担当するので二重に出さない。 */}
      {bootstrapState.status === "not-bootstrap" && actorId && (
        <UserSuspensionPanel
          actorId={actorId}
          canAdminister={canChangeUser}
          otherActiveAdminCount={coverage.otherActiveAdminCount}
          requiresApproval={requiresApproval}
          targetIsAdmin={coverage.targetIsAdmin}
          user={user}
        />
      )}
    </>
  );
}
