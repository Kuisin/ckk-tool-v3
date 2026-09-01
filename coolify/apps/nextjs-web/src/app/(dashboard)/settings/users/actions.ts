"use server";

/**
 * Server Actions — ユーザー管理（SY01）。
 *
 * 利用停止 / 復帰 / 所属拠点の変更は **特権操作**（権限コード user_admin）で、
 * 方式 B「変更依頼」を通る:
 *   管理者（system:ADMIN）… 従来どおり直接適用する（利用者の決定）
 *   それ以外               … 変更依頼を 1 件出し、**承認がその変更を適用する**
 *
 * 時限昇格（方式 A）を使わないのは、これらが「これから何かをする権利」ではなく
 * それ自体が 1 つの具体的な変更だから。対象を事前に名指しできるのだから、
 * 名指しした形で承認を受けるほうが正確で、承認者も「誰が止まるのか」を見て
 * 判断できる。変更の本体と適用時の再検証は lib/user-change-requests.ts。
 *
 * user_plants は PLANT/REGION スコープ解決の基盤（@ckk/authz-core
 * loadScopeContext）。差分適用（追加行は assignedBy = 操作者、削除行は物理削除）。
 */

import { isSuperuser } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission, getPermissionSet, sessionUserId } from "@/lib/authz";
import {
  BOOTSTRAP_ADMIN_USERNAME,
  bootstrapAdminState,
} from "@/lib/bootstrap-admin-core";
import { prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import type { UserChangeKind } from "@/lib/user-change-core";
import {
  applyUserChange,
  createUserChangeRequest,
  USER_ADMIN_CODE,
} from "@/lib/user-change-requests";
import { getBootstrapAdminSnapshot } from "@/lib/users-admin";

const BASE_PATH = "/settings/users";

/** この操作の結果。requested = 直接は実行せず、承認を依頼した。 */
export type UserChangeOutcome = { requested: boolean };

/** 管理者は素通し（利用者の決定）。ここが唯一の締め出し回避路でもある。 */
async function isAdminBypass(): Promise<boolean> {
  const set = await getPermissionSet();
  return set ? isSuperuser(set) : false;
}

/**
 * 変更 1 件を「管理者なら適用 / それ以外は依頼」へ振り分ける。
 * 3 つのアクションが同じ分岐を書かないようにまとめてある。
 */
async function applyOrRequest(
  tr: Awaited<ReturnType<typeof getTranslations>>,
  kind: UserChangeKind,
  targetUserId: string,
  payload: unknown,
  reason: string | undefined,
  failure: string,
): Promise<ActionResult<UserChangeOutcome>> {
  const authz = await checkPermission(USER_ADMIN_CODE, "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const actorId = await sessionUserId();
  if (!actorId) return actionError(tr("settings.usersActions.actorNotFound"));

  if (await isAdminBypass()) {
    const applied = await applyUserChange(kind, actorId, targetUserId, payload);
    if (!applied.ok) return actionError(applied.error ?? failure);
    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/${targetUserId}`);
    return actionOk({ requested: false });
  }

  // 依頼には理由が要る（DB の CHECK でも空文字を拒否している）。
  if (!reason?.trim()) {
    return actionError(tr("settings.usersActions.reasonRequiredForRequest"));
  }
  const res = await createUserChangeRequest({
    kind,
    targetUserId,
    payload,
    reason,
  });
  if (!res.ok) return actionError(res.error);
  return actionOk({ requested: true });
}

function userIdInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    userId: z.string().uuid(tr("settings.usersActions.invalidUserId")),
    plantIds: z.array(z.number().int().positive()),
  });
}

export async function updateUserPlants(
  userId: string,
  plantIds: number[],
  reason?: string,
): Promise<ActionResult<UserChangeOutcome>> {
  const tr = await getTranslations();
  const parsed = userIdInputSchema(tr).safeParse({ userId, plantIds });
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    return await applyOrRequest(
      tr,
      "UPDATE_PLANTS",
      v.userId,
      { plantIds: v.plantIds },
      reason,
      tr("settings.usersActions.updatePlantsFailed"),
    );
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.usersActions.updatePlantsFailed"), tr),
    );
  }
}

/**
 * 初期管理者（ローカル `admin`）を無効化する。
 *
 * 立ち上げ用の踏み台なので、実運用の管理者ができたら畳むのが正しい終わり方。
 * ただし **最後の管理者を消させない** — ロールを付与する画面が無いので、
 * 管理者が居ない DB は psql でしか復旧できない。
 *
 * 可否の判定は bootstrapAdminState（純関数）に集約してあり、画面のボタンの活性も
 * 同じ関数の結果を見る。ここで読み直して再判定するのは画面を信用しないため —
 * Server Action を直接叩かれても同じ結論になるようにしておく。
 */
export async function disableBootstrapAdmin(): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "ADMIN");
  if (!authz.ok) return actionError(authz.error);

  try {
    const snap = await getBootstrapAdminSnapshot();
    if (!snap)
      return actionError(tr("settings.usersActions.bootstrapAdminNotFound"));

    const state = bootstrapAdminState({
      username: BOOTSTRAP_ADMIN_USERNAME,
      isActive: snap.isActive,
      passwordChangeRequired: snap.passwordChangeRequired,
      otherActiveAdminCount: snap.otherActiveAdminCount,
    });
    if (!state.canDisable) {
      return actionError(
        state.message ?? tr("settings.usersActions.cannotPerformNow"),
      );
    }

    await prisma.user.update({
      where: { id: snap.id },
      data: { isActive: false },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "users",
      recordId: snap.id,
      before: { username: BOOTSTRAP_ADMIN_USERNAME, isActive: true },
      after: { username: BOOTSTRAP_ADMIN_USERNAME, isActive: false },
    });
    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/${snap.id}`);
    return actionOk(undefined);
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.usersActions.disableFailed"), tr),
    );
  }
}

function suspendInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    userId: z.string().uuid(tr("settings.usersActions.invalidUserId")),
    kind: z.enum(["temporary", "permanent"]),
    /** 一時停止の解除予定（ISO）。恒久なら null。 */
    until: z.string().datetime({ offset: true }).nullable(),
    reason: z
      .string()
      .trim()
      .max(500, tr("settings.usersActions.reasonTooLong"))
      .optional(),
  });
}

/**
 * ユーザーを利用停止にする（一時 / 恒久）。
 *
 * 停止の実体は `is_active = false` — 権限ビューも認証も既にこれを見ているので、
 * ゲートを増やさない。`disabled_until` は「いつ戻すか」だけを持ち、期限が来たら
 * pg_cron（sql/user-suspension-cron.sql）が戻す。
 *
 * ガードは user-suspension-core の純関数に集約（画面のボタン活性と同じ関数）。
 * ここで DB から読み直して再判定するのは、画面を信用しないため。
 */
export async function suspendUser(input: {
  userId: string;
  kind: "temporary" | "permanent";
  until: string | null;
  reason?: string;
}): Promise<ActionResult<UserChangeOutcome>> {
  const tr = await getTranslations();
  const parsed = suspendInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    // 停止理由と依頼理由は同じ文を使う — 「なぜ止めるのか」は承認者が読みたい
    // ものであり、停止記録に残したいものでもあるため、二重に書かせない。
    return await applyOrRequest(
      tr,
      "SUSPEND",
      v.userId,
      {
        kind: v.kind,
        until: v.kind === "temporary" ? v.until : null,
        disabledReason: v.reason,
      },
      v.reason,
      tr("settings.usersActions.suspendFailed"),
    );
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.usersActions.suspendFailed"), tr),
    );
  }
}

/** 停止中のユーザーを手動で復帰させる（期限を待たずに戻す場合も含む）。 */
export async function restoreUser(
  userId: string,
  reason?: string,
): Promise<ActionResult<UserChangeOutcome>> {
  const tr = await getTranslations();
  const parsed = z.string().uuid().safeParse(userId);
  if (!parsed.success)
    return actionError(tr("settings.usersActions.invalidUserId"));
  try {
    return await applyOrRequest(
      tr,
      "RESTORE",
      parsed.data,
      {},
      reason,
      tr("settings.usersActions.restoreFailed"),
    );
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.usersActions.restoreFailed"), tr),
    );
  }
}
