/**
 * notifications.ts — 通知の作成・配信・照会。server-only.
 *
 * `notify()` が単一の入口: アプリ内通知（notifications 行 → ヘッダーベル）を
 * 必ず作成し、ユーザー別設定（user_notification_settings — 行が無ければ全
 * チャネル有効）に従ってメール（lib/mailer）と Web Push（lib/push）へ
 * ファンアウトする。外部チャネルはベストエフォート（失敗しても業務処理を
 * 止めない・応答をブロックしない）。
 */

import type { ApprovalGroupType } from "../../generated/client/client";
import { SYSTEM_USER_ID } from "./audit";
import { prisma } from "./db";
import { sendNotificationMail } from "./mailer";
import { sendPushToUser } from "./push";

export type NotificationType =
  | "APPROVAL_REQUEST" // 承認依頼 → 承認者へ
  | "APPROVAL_RESULT" // 承認/差し戻し → 依頼者へ
  | "INTAKE" // 受注請書 自動取込の結果
  | "PURCHASE" // 素材発注の状態遷移
  | "SHARE" // ページ共有（layout/share-actions）
  | "SYSTEM";

export interface NotifyInput {
  userIds: string[];
  type: NotificationType;
  title: string;
  message?: string;
  /** アプリ内パス（/production/approvals など）。ベル・メール・プッシュ共通。 */
  linkPath?: string;
}

/**
 * 通知を作成して配信する。アプリ内行は同期作成、メール/プッシュは
 * 非同期ファンアウト（待たない）。
 */
export async function notify(input: NotifyInput): Promise<void> {
  const userIds = [...new Set(input.userIds)].filter(
    (id) => id && id !== SYSTEM_USER_ID,
  );
  if (userIds.length === 0) return;

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      linkPath: input.linkPath,
    })),
  });

  // 外部チャネルは fire-and-forget（standalone Node ランタイム前提）
  void dispatchExternal(userIds, input).catch((e) =>
    console.error("[notify] 外部チャネル配信エラー:", e),
  );
}

async function dispatchExternal(
  userIds: string[],
  input: NotifyInput,
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: {
      id: true,
      email: true,
      notificationSetting: {
        select: { emailEnabled: true, pushEnabled: true },
      },
    },
  });

  await Promise.allSettled(
    users.flatMap((u) => {
      const jobs: Promise<unknown>[] = [];
      const emailOn = u.notificationSetting?.emailEnabled ?? true;
      const pushOn = u.notificationSetting?.pushEnabled ?? true;
      if (emailOn && u.email) {
        jobs.push(
          sendNotificationMail({
            to: u.email,
            title: input.title,
            message: input.message,
            linkPath: input.linkPath,
          }),
        );
      }
      if (pushOn) {
        jobs.push(
          sendPushToUser(u.id, {
            title: input.title,
            body: input.message,
            link: input.linkPath,
          }),
        );
      }
      return jobs;
    }),
  );
}

/**
 * 承認グループ（有効メンバー + 期間内の代理人）へ通知。
 * 承認依頼の宛先解決に使う。
 */
export async function notifyGroup(
  groupType: ApprovalGroupType,
  input: Omit<NotifyInput, "userIds">,
): Promise<void> {
  const now = new Date();
  const [members, delegates] = await Promise.all([
    prisma.approvalGroupMember.findMany({
      where: { isActive: true, group: { type: groupType, isActive: true } },
      select: { userId: true },
    }),
    prisma.approvalDelegate.findMany({
      where: {
        validFrom: { lte: now },
        validUntil: { gte: now },
        group: { type: groupType, isActive: true },
      },
      select: { delegateId: true },
    }),
  ]);
  await notify({
    ...input,
    userIds: [
      ...members.map((m) => m.userId),
      ...delegates.map((d) => d.delegateId),
    ],
  });
}

// ─── 照会・既読管理（ヘッダーベル用） ───────────────────────────────────────

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string | null;
  linkPath: string | null;
  isRead: boolean;
  createdAt: string; // ISO
}

/** 最新の通知 + 未読数（ベルの初期表示・ポーリング両用）。 */
export async function fetchNotifications(
  userId: string,
  limit = 20,
): Promise<{ unreadCount: number; items: NotificationItem[] }> {
  const [unreadCount, rows] = await Promise.all([
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);
  return {
    unreadCount,
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      linkPath: r.linkPath,
      isRead: r.isRead,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/** 1 件既読化（本人の行のみ）。 */
export async function markNotificationRead(
  userId: string,
  id: string,
): Promise<void> {
  await prisma.notification.updateMany({
    where: { id, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

/** 全件既読化。 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}
