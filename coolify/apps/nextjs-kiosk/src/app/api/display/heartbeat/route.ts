/**
 * POST /api/display/heartbeat — 生存の刻み（WS が張れないときの保険）。
 *
 * 通常は WS 接続そのものが死活の根拠で、接続中は WS サーバーが 30 秒ごとに
 * last_seen_at を更新する。ここが要るのは WS が張れない経路
 * （プロキシが upgrade を通さない等）で、一覧が「オフライン」になり続けるのを
 * 避けるため。**オンライン判定の窓は同じ**なので、どちらの経路でも結果は同じ。
 *
 * 401 は「失効した」の合図でもある — クライアントはこれを見て再読込し、
 * ペアリング画面へ戻る。
 */

import { NextResponse } from "next/server";
import { getDisplay, touchDisplay } from "@/lib/display-auth";
import { machineHint } from "@/lib/display-core";
import { clientIpOf, userAgentOf } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await getDisplay();
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: auth.reason },
      { status: 401 },
    );
  }

  // 手掛かりは毎回上書きする — 別の Pi へ差し替えたり、画面の並びを
  // 入れ替えたりしたときに、古い値が残り続けないようにするため。
  const body = (await req.json().catch(() => null)) as {
    machineId?: unknown;
    screenIndex?: unknown;
  } | null;
  const hint = machineHint(body?.machineId, body?.screenIndex);

  await touchDisplay(auth.display.id, {
    ipAddress: clientIpOf(req),
    userAgent: userAgentOf(req),
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    machineId: hint.machineId,
    screenIndex: hint.screenIndex,
  });

  return NextResponse.json({ ok: true });
}
