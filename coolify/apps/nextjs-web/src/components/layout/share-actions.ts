"use server";

/**
 * Server Actions — ページ共有（tools/demo-system の share-page を v3 流に移植）。
 *
 * 共有 = 「現在のページ URL（path + search params — X6 で画面状態を完全内包）
 * をリンクに持つ SHARE 通知」。専用テーブルは持たず通知基盤に載せる（demo
 * と同じ設計）。宛先はユーザー複数 / 承認グループ / 全員。
 */

import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { SYSTEM_USER_ID } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { notify, sanitizeLinkPath } from "@/lib/notifications";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

export interface SharePageInput {
  /** アプリ内パス（"/sales/quotes?status=ISSUED" 等） */
  path: string;
  /** ページ表示名（クライアントが appList から解決。無ければ path 表示） */
  pageLabel?: string;
  userIds: string[];
  groupIds: number[];
  everyone: boolean;
  comment?: string;
}

export async function sharePageAction(
  input: SharePageInput,
): Promise<ActionResult<{ recipientCount: number }>> {
  const tr = await getTranslations();
  const session = await auth();
  const su = session?.user as { id?: string; name?: string | null } | undefined;
  if (!su?.id) return actionError(tr("common.loginRequired"));

  // アプリ内パスのみ許可（外部 URL・プロトコル相対・バックスラッシュ等は
  // sanitizeLinkPath で正規化検証 — 監査 P1-6）
  const safePath = sanitizeLinkPath(input.path);
  if (!safePath) {
    return actionError(tr("layout.shareActions.onlyInternalPages"));
  }
  if (
    !input.everyone &&
    input.userIds.length === 0 &&
    input.groupIds.length === 0
  ) {
    return actionError(tr("layout.shareActions.selectAtLeastOneRecipient"));
  }

  // 宛先解決（全員 = 有効ユーザー全員。グループ = 有効メンバー）
  const recipientIds = new Set<string>(input.userIds);
  if (input.everyone) {
    const all = await prisma.user.findMany({
      where: { isActive: true, id: { not: SYSTEM_USER_ID } },
      select: { id: true },
    });
    for (const u of all) recipientIds.add(u.id);
  } else if (input.groupIds.length > 0) {
    const members = await prisma.approvalGroupMember.findMany({
      where: {
        groupId: { in: input.groupIds },
        isActive: true,
        group: { isActive: true },
      },
      select: { userId: true },
    });
    for (const m of members) recipientIds.add(m.userId);
  }
  recipientIds.delete(su.id); // 自分自身には送らない

  if (recipientIds.size === 0) {
    return actionError(tr("layout.shareActions.noRecipients"));
  }

  const label = input.pageLabel?.trim() || input.path;
  await notify({
    userIds: [...recipientIds],
    type: "SHARE",
    title: tr("layout.shareActions.sharedNotificationTitle", {
      name: su.name ?? tr("common.user"),
      label,
    }),
    message: input.comment?.trim() || undefined,
    linkPath: safePath,
  });
  return actionOk({ recipientCount: recipientIds.size });
}

/** 共有モーダルの宛先候補（有効ユーザー + 有効承認グループ）。 */
export async function fetchShareOptionsAction(): Promise<
  ActionResult<{
    users: { value: string; label: string }[];
    groups: { value: string; label: string }[];
  }>
> {
  const tr = await getTranslations();
  const session = await auth();
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) return actionError(tr("common.loginRequired"));
  const [users, groups] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, id: { not: SYSTEM_USER_ID } },
      orderBy: { username: "asc" },
      select: { id: true, username: true, displayName: true },
    }),
    prisma.approvalGroup.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return actionOk({
    users: users
      .filter((u) => u.id !== me)
      .map((u) => ({
        value: u.id,
        label: `${u.displayName}（${u.username}）`,
      })),
    groups: groups.map((g) => ({
      value: String(g.id),
      label:
        typeof g.name === "object" && g.name !== null && "ja" in g.name
          ? String(
              (g.name as { ja?: string }).ja ||
                tr("layout.shareActions.groupFallbackLabel", { id: g.id }),
            )
          : tr("layout.shareActions.groupFallbackLabel", { id: g.id }),
    })),
  });
}
