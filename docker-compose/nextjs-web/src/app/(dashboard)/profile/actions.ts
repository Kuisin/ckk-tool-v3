"use server";

/**
 * Server Actions — プロフィール（本人のみ）。
 * メールアドレス変更（通知メールの宛先）・パスワード変更（credentials ユーザー）。
 */

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

const emailSchema = z.email("メールアドレスの形式が正しくありません");

export async function updateEmailAction(email: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return actionError("ログインが必要です");
  const trimmed = email.trim();
  if (trimmed) {
    const parsed = emailSchema.safeParse(trimmed);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "入力エラー");
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
  const userId = await currentUserId();
  if (!userId) return actionError("ログインが必要です");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true, passwordHash: true },
  });
  if (!user.passwordHash) {
    return actionError("SSO ユーザーのパスワードはここでは変更できません");
  }
  if (!verifyPassword(input.currentPassword, user.passwordHash)) {
    return actionError("現在のパスワードが一致しません");
  }
  if (input.newPassword.length < 8) {
    return actionError("新しいパスワードは 8 文字以上にしてください");
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(input.newPassword) },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "users",
    recordId: user.username,
    after: { note: "パスワード変更" },
  });
  return actionOk();
}

/** 本人のプッシュ購読（デバイス）を削除。 */
export async function removeDeviceAction(id: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return actionError("ログインが必要です");
  await prisma.pushSubscription.deleteMany({ where: { id, userId } });
  return actionOk();
}
