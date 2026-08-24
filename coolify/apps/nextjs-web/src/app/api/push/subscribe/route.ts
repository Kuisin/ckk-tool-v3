/**
 * POST /api/push/subscribe — Service Worker からの購読保存。
 *
 * `pushsubscriptionchange`（ブラウザ都合の購読差し替え）は SW 内で発火し
 * Server Action を呼べないため、この Route Handler が受け皿になる。
 * 認証は同一オリジンの Cookie セッション（SW の fetch は Cookie を含む）。
 * ボディは PushSubscription.toJSON() 形（{ endpoint, keys: { p256dh, auth } }）。
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { upsertPushSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const sub = body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  const endpoint = sub.endpoint ?? "";
  const p256dh = sub.keys?.p256dh ?? "";
  const authKey = sub.keys?.auth ?? "";
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json(
      { error: "invalid subscription" },
      { status: 400 },
    );
  }
  await upsertPushSubscription(userId, {
    endpoint,
    p256dh,
    auth: authKey,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
  return NextResponse.json({ ok: true });
}
