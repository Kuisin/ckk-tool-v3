"use server";

/**
 * Server Actions — 通知（既読化・Web Push 購読・チャネル設定）。
 * すべてログインユーザー本人のデータのみ操作する。
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function markReadAction(id: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return actionError("ログインが必要です");
  await markNotificationRead(userId, id);
  return actionOk();
}

export async function markAllReadAction(): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return actionError("ログインが必要です");
  await markAllNotificationsRead(userId);
  return actionOk();
}

// ─── Web Push 購読 ───────────────────────────────────────────────────────────

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

/** 購読を保存（同一 endpoint は本人へ付け替え — ブラウザプロファイル共用対策）。 */
export async function savePushSubscriptionAction(
  input: PushSubscriptionInput,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return actionError("ログインが必要です");
  if (!input.endpoint || !input.p256dh || !input.auth) {
    return actionError("購読情報が不正です");
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
    },
    update: { userId, p256dh: input.p256dh, auth: input.auth },
  });
  return actionOk();
}

export async function removePushSubscriptionAction(
  endpoint: string,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return actionError("ログインが必要です");
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  return actionOk();
}

// ─── チャネル設定 ────────────────────────────────────────────────────────────

export async function saveNotificationSettingAction(input: {
  emailEnabled: boolean;
  pushEnabled: boolean;
}): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return actionError("ログインが必要です");
  await prisma.userNotificationSetting.upsert({
    where: { userId },
    create: {
      userId,
      emailEnabled: input.emailEnabled,
      pushEnabled: input.pushEnabled,
    },
    update: {
      emailEnabled: input.emailEnabled,
      pushEnabled: input.pushEnabled,
    },
  });
  return actionOk();
}
