/**
 * GET /notifications/[id]/open — 端末通知（Web Push）のリンク先。
 *
 * 既読にしてから対象ページへ 303 で送る中継。端末の通知は対象ページを直接
 * 開いていたので、タップして用が済んでもアプリ内のベルは未読のまま残って
 * いた（既読にできるのは画面の中で押したときだけだった）。リンク先をこの
 * 1 本に寄せて、どこから開いても既読の記録が同じ経路を通るようにする。
 *
 * - 本人の行だけ既読にする（他人の id を渡しても何も起きない）
 * - 行が無い / 消えている場合は通知一覧へ — 「その id が在るか」を
 *   応答の違いで教えない
 * - 遷移先は保存時に検証済みだが、ここでも sanitizeLinkPath を通す
 *   （オープンリダイレクトの入口を 1 箇所にしない）
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  isNotificationId,
  markNotificationRead,
  notificationOpenPath,
  sanitizeLinkPath,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";

const NOTIFICATION_CENTER = "/notifications";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const target = await resolveTarget(id);
  const response = NextResponse.redirect(new URL(target, request.url), 303);
  // 遷移先は人・通知ごとに違う。中間キャッシュに残さない。
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** 既読にして、送り先のアプリ内パスを返す。 */
async function resolveTarget(id: string): Promise<string> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  // 通常は proxy.ts が未ログインを /login へ送るので、ここは保険。
  // 戻り先を持たせて、ログイン後に同じ中継をもう一度通す。
  if (!userId) {
    return `/login?callbackUrl=${encodeURIComponent(notificationOpenPath(id))}`;
  }
  if (!isNotificationId(id)) return NOTIFICATION_CENTER;

  const notification = await prisma.notification.findFirst({
    where: { id, userId },
    select: { linkPath: true },
  });
  if (!notification) return NOTIFICATION_CENTER;

  await markNotificationRead(userId, id);
  return (
    sanitizeLinkPath(notification.linkPath ?? undefined) ?? NOTIFICATION_CENTER
  );
}
