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
import {
  machineHint,
  machineHintUpdate,
  normalizeScreenIndex,
} from "@/lib/display-core";
import { clientIpOf, userAgentOf } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 窓ごとに別の Cookie。screen は下で読む body にも入っているが、
  // 認証の前に要るので URL から取る（クライアントは両方に載せる）。
  const screen = normalizeScreenIndex(
    new URL(req.url).searchParams.get("screen"),
  );
  const auth = await getDisplay(screen);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: auth.reason },
      { status: 401 },
    );
  }

  // 手掛かりは**読めたときだけ**上書きする（config と同じ）。以前は無いとき
  // null を書いていたので、config が書いた値を heartbeat が消していた。
  // 差し替え・並び替えは新しい値が来るので、それで上書きされる。
  const body = (await req.json().catch(() => null)) as {
    machineId?: unknown;
    screenIndex?: unknown;
  } | null;
  const hint = machineHint(body?.machineId, body?.screenIndex);

  await touchDisplay(auth.display.id, {
    ipAddress: clientIpOf(req),
    userAgent: userAgentOf(req),
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    ...machineHintUpdate(hint),
  });

  return NextResponse.json({ ok: true });
}
