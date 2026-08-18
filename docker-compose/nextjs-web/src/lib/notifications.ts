/**
 * notifications.ts — 通知の作成・配信・照会。server-only.
 *
 * `notify()` が単一の入口: アプリ内通知（notifications 行 → ヘッダーベル）を
 * 必ず作成し、ユーザー別設定（user_notification_settings — 行が無ければ全
 * チャネル有効）に従ってメール（lib/mailer）と Web Push（lib/push）へ
 * ファンアウトする。外部チャネルはベストエフォート（失敗しても業務処理を
 * 止めない・応答をブロックしない）。
 */

import { effectiveMemberWhere } from "./approval-membership";
import { SYSTEM_USER_ID } from "./audit";
import { prisma } from "./db";
import { sendNotificationMail } from "./mailer";
import { sendPushToUser } from "./push";
import { publishNotificationEvent } from "./realtime";

export type NotificationType =
  | "APPROVAL_REQUEST" // 承認依頼 → 承認者へ
  | "APPROVAL_RESULT" // 承認/差し戻し → 依頼者へ
  | "INTAKE" // 注文請書 自動取込の結果
  | "PURCHASE" // 素材発注の状態遷移
  | "SHARE" // ページ共有（layout/share-actions）
  | "SYSTEM";

/**
 * アプリ内パスの検証（監査 P1-6: `/\\evil.com` や二重エンコードの
 * オープンリダイレクトを遮断）。正規化して pathname+search が元と一致する
 * 相対パスのみ許可。不正はプレーンな "/" に落とす。
 */
export function sanitizeLinkPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (!path.startsWith("/") || path.includes("\\")) return undefined;
  try {
    const u = new URL(path, "http://x");
    if (u.origin !== "http://x") return undefined;
    const normalized = u.pathname + u.search;
    // バックスラッシュ・プロトコル相対（//）を弾く
    if (u.pathname.startsWith("//")) return undefined;
    return normalized;
  } catch {
    return undefined;
  }
}

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

  const linkPath = sanitizeLinkPath(input.linkPath);
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      linkPath,
    })),
  });

  // 開いているタブのベルを即時更新（SSE — lib/realtime.ts）。
  // 失敗しても通知行は残るので、次のフォールバック取得で追いつく。
  void publishNotificationEvent(userIds);

  // 外部チャネルは fire-and-forget（standalone Node ランタイム前提）
  void dispatchExternal(userIds, { ...input, linkPath }).catch((e) =>
    console.error("[notify] 外部チャネル配信エラー:", e),
  );
}

async function dispatchExternal(
  userIds: string[],
  input: NotifyInput,
): Promise<void> {
  // dev/main が DB を共有しているため、検証環境からの実ユーザーへの
  // メール・プッシュを止めるキルスイッチ（監査 P1-4）。アプリ内通知は残る。
  if (process.env.NOTIFY_EXTERNAL_DISABLED === "1") return;
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
            // 対象ページが無い通知はアプリ内通知センターを開く
            link: input.linkPath ?? "/notifications",
          }),
        );
      }
      return jobs;
    }),
  );
}

/**
 * 承認グループ（実効メンバー + 期間内の代理人）へ通知。承認依頼の宛先解決。
 *
 * 代理人の条件は resolveApprover と同じ — 原承認者（delegator）が今も実効
 * メンバーであること。以前はここだけ所属を確認しておらず、「通知は届くのに
 * 承認ボタンでは弾かれる」という食い違いがあった。
 *
 * userIds を渡すとその集合にだけ送る（ALL 段で、まだ押していない対象者
 * だけに催促する用途）。
 */
export async function notifyApprovalGroup(
  groupId: number,
  input: Omit<NotifyInput, "userIds"> & { userIds?: string[] },
): Promise<void> {
  if (input.userIds) {
    const { userIds, ...rest } = input;
    await notify({ ...rest, userIds });
    return;
  }
  const now = new Date();
  const effective = effectiveMemberWhere(now);
  const [members, delegates] = await Promise.all([
    prisma.approvalGroupMember.findMany({
      where: { groupId, group: { isActive: true }, ...effective },
      select: { userId: true },
    }),
    prisma.approvalDelegate.findMany({
      where: {
        groupId,
        validFrom: { lte: now },
        validUntil: { gte: now },
        group: { isActive: true },
        delegator: {
          approvalGroupMembers: {
            some: { groupId, group: { isActive: true }, ...effective },
          },
        },
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

/** 通知一覧ページ用: フィルタ + ページング付き全件照会。 */
export async function fetchNotificationsPage(
  userId: string,
  opts: {
    page: number; // 1-origin
    pageSize: number;
    unreadOnly?: boolean;
    type?: string | null;
  },
): Promise<{ total: number; unreadCount: number; items: NotificationItem[] }> {
  const where = {
    userId,
    ...(opts.unreadOnly ? { isRead: false } : {}),
    ...(opts.type ? { type: opts.type } : {}),
  };
  const [total, unreadCount, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
  ]);
  return {
    total,
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

/**
 * 1 件既読化（本人の行のみ）。
 * 既読にできたときだけ配信する（同じ通知を 2 回押しても鳴らさない）。
 */
export async function markNotificationRead(
  userId: string,
  id: string,
): Promise<void> {
  const { count } = await prisma.notification.updateMany({
    where: { id, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  // 同じ人の他のタブ・端末のバッジも減らす。
  if (count > 0) void publishNotificationEvent([userId]);
}

/** 全件既読化。 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { count } = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  if (count > 0) void publishNotificationEvent([userId]);
}
