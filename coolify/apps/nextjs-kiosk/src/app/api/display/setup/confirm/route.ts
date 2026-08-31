/**
 * POST /api/display/setup/confirm — 有効化待ちポーリング（3秒間隔）。
 *
 * 管理者が SY09 で有効化（status: ACTIVE）済みなら、365日トークンを発行して
 * ckk_display Cookie を設定する。**トークンは画面側のこの経路でしか発行
 * されない**（管理 UI は status を変えるだけ）— 管理画面が発行すると、その値を
 * どう安全に Pi へ渡すかという問題が生まれる。
 *
 * キオスクの confirm と同じ形。違うのは認証イベントを残さない点で、
 * ディスプレイには利用者が居らず、login_attempts の actor に当たるものが
 * 無いため（あれは「誰が入ったか」の台帳）。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setDisplayCookie } from "@/lib/display-auth";
import { displayWsBridge } from "@/lib/display-ws-bridge";
import { clientIpOf, userAgentOf } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ deviceId: z.uuid() });

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const device = await prisma.displayDevice.findUnique({
    where: { id: parsed.data.deviceId },
    select: { id: true, status: true, deviceTokenHash: true },
  });
  if (!device) {
    return NextResponse.json({ status: "NOT_FOUND" }, { status: 404 });
  }
  if (device.status === "PENDING") {
    // リンク解除された（プロファイルがオープンに戻った）→ 画面は最初から
    return NextResponse.json({ status: "PENDING" });
  }
  if (device.status !== "ACTIVE") {
    return NextResponse.json({ status: device.status });
  }
  if (device.deviceTokenHash) {
    return NextResponse.json({ status: "ALREADY_CONFIRMED" });
  }

  const { hash, expiresAt } = await setDisplayCookie();
  await prisma.displayDevice.update({
    where: { id: device.id },
    data: {
      deviceTokenHash: hash,
      deviceTokenExpiresAt: expiresAt,
      lastSeenAt: new Date(),
      lastIpAddress: clientIpOf(req),
      userAgent: userAgentOf(req),
    },
  });
  displayWsBridge()?.notifyDisplayChanged(device.id);
  return NextResponse.json({ status: "CONFIRMED" });
}
