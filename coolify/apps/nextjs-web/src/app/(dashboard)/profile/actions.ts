"use server";

/**
 * Server Actions — プロフィール（本人のみ）。
 * メールアドレス変更（通知メールの宛先）・パスワード変更（credentials ユーザー）。
 *
 * プロフィール写真は Server Action ではなく /api/avatars（Route Handler）—
 * Server Action のボディは既定 1MB 上限で、写真が 413 になるため。
 */

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { auth } from "@/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

function emailSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.email(tr("common.invalidEmailFormat"));
}

export async function updateEmailAction(email: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const userId = await currentUserId();
  if (!userId) return actionError(tr("common.loginRequired"));
  const trimmed = email.trim();
  if (trimmed) {
    const parsed = emailSchema(tr).safeParse(trimmed);
    if (!parsed.success) {
      return actionError(
        parsed.error.issues[0]?.message ?? tr("common.inputError"),
      );
    }
  }
  const before = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true, email: true },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { email: trimmed || null },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "users",
    recordId: before.username,
    before: { email: before.email },
    after: { email: trimmed || null },
  });
  return actionOk();
}

export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult> {
  const tr = await getTranslations();
  const userId = await currentUserId();
  if (!userId) return actionError(tr("common.loginRequired"));
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true, passwordHash: true },
  });
  if (!user.passwordHash) {
    return actionError(tr("profile.profileActions.ssoPasswordCannotBeChanged"));
  }
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    return actionError(
      tr("profile.profileActions.currentPasswordDoesNotMatch"),
    );
  }
  if (input.newPassword.length < 8) {
    return actionError(tr("profile.profileActions.newPasswordTooShort"));
  }
  await prisma.user.update({
    where: { id: userId },
    // 変更が済んだので強制フラグを下ろす(初期管理者のブートストラップ用)。
    data: {
      passwordHash: await hashPassword(input.newPassword),
      passwordChangeRequired: false,
    },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "users",
    recordId: user.username,
    after: { note: tr("profile.profileView.changePassword") },
  });
  return actionOk();
}

/** 本人のプッシュ購読(デバイス)を削除。 */
export async function removeDeviceAction(id: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const userId = await currentUserId();
  if (!userId) return actionError(tr("common.loginRequired"));
  await prisma.pushSubscription.deleteMany({ where: { id, userId } });
  return actionOk();
}
