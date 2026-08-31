/**
 * GET /api/display/pairing/status?code=… — 成立のポーリング（3秒間隔）。
 *
 *   WAITING  — 管理者の操作待ち
 *   PAIRED   — 成立。**このリクエストでトークンを発行し Cookie に載せる**
 *   CONSUMED — 成立済みだが受け取り窓を過ぎた（コードを取り直す）
 *   EXPIRED / NOT_FOUND — コード再発行（POST /api/display/pairing）が必要
 *
 * トークンを発行するのは**ここだけ**。管理者側は端末の秘密に一切触れない
 * （管理画面が発行すると、その値をどう安全に Pi へ渡すかという問題が生まれる）。
 *
 * ★ 判定順序の不変条件: **display_device の有無を expiresAt より先に見る。**
 *   期限ぎりぎりに成立したペアリングを「期限切れ」で取りこぼさないため。
 *   キオスクの link-status と同じ約束。
 *
 * ★ 受け取りは**やり直せる**。応答が届く前に回線が切れると、サーバーは
 *   発行済み・Pi は未取得という食い違いが残り、誰も持っていないトークンを
 *   持った端末行が現場に出来てしまう。そこでセッションが生きている間は
 *   何度でも新しいトークンを出し直す（同じコードを見ているのは 1 台だけ）。
 */

import { NextResponse } from "next/server";
import { normalizeCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import { setDisplayCookie } from "@/lib/display-auth";
import { PAIRING_CODE_LENGTH } from "@/lib/display-core";
import { displayWsBridge } from "@/lib/display-ws-bridge";
import { deviceName } from "@/lib/format";
import { clientIpOf, userAgentOf } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = normalizeCode(url.searchParams.get("code") ?? "");
  if (code.length !== PAIRING_CODE_LENGTH) {
    return NextResponse.json({ status: "NOT_FOUND" }, { status: 404 });
  }

  const session = await prisma.displayPairingSession.findUnique({
    where: { code },
    include: {
      device: {
        select: { id: true, name: true, status: true, deviceTokenHash: true },
      },
    },
  });
  if (!session) {
    return NextResponse.json({ status: "NOT_FOUND" }, { status: 404 });
  }

  const device = session.device;
  const alive = session.expiresAt.getTime() > Date.now();

  if (device) {
    if (device.status !== "ACTIVE") {
      // 成立直後に管理者が停止/取り消しした。ペアリングからやり直す。
      return NextResponse.json({ status: "NOT_FOUND" }, { status: 404 });
    }
    // 初回の受け取りは期限を過ぎていても通す（回線が遅い端末を見捨てない）。
    // 2 回目以降はセッションが生きている間だけ出し直す。
    const firstClaim = device.deviceTokenHash === null;
    if (!firstClaim && !alive) {
      return NextResponse.json({ status: "CONSUMED" }, { status: 409 });
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

    return NextResponse.json({
      status: "PAIRED",
      displayId: device.id,
      displayName: deviceName(device.name),
    });
  }

  if (!alive) {
    return NextResponse.json({ status: "EXPIRED" }, { status: 410 });
  }
  return NextResponse.json({ status: "WAITING" });
}
