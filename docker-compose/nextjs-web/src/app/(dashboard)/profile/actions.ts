"use server";

/**
 * Server Actions — プロフィール（本人のみ）。
 * プロフィール写真の設定・削除、メールアドレス変更（通知メールの宛先）・
 * パスワード変更（credentials ユーザー）。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { recordAudit } from "@/lib/audit";
import { avatarUrl, removeAvatar, saveAvatar } from "@/lib/avatar";
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

/**
 * 本人のプロフィール写真を設定（差し替え）。FormData の `file` を受ける。
 * 成功時は新しい表示 URL を返す（`?v=` 付きなのでその場で差し替わる）。
 */
export async function uploadAvatarAction(
  formData: FormData,
): Promise<ActionResult<{ avatarUrl: string }>> {
  const userId = await currentUserId();
  if (!userId) return actionError("ログインが必要です");
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return actionError("画像ファイルを選択してください");
  }
  const res = await saveAvatar(userId, file);
  if (!res.ok) return res;
  revalidatePath("/", "layout"); // ヘッダー・ホームのアバターを更新
  return actionOk({ avatarUrl: avatarUrl(userId, res.data.fileId) });
}

/** 本人のプロフィール写真を削除。 */
export async function removeAvatarAction(): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return actionError("ログインが必要です");
  const res = await removeAvatar(userId);
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  return actionOk();
}

/** 本人のプッシュ購読（デバイス）を削除。 */
export async function removeDeviceAction(id: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return actionError("ログインが必要です");
  await prisma.pushSubscription.deleteMany({ where: { id, userId } });
  return actionOk();
}
