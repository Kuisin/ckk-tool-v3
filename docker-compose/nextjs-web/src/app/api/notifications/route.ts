/**
 * GET /api/notifications — ヘッダーベルのポーリング用。
 * ログインユーザーの未読数 + 最新通知を返す。
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const data = await fetchNotifications(userId);
  return NextResponse.json(data);
}
