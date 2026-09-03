/**
 * GET /api/display/setup/link-status?code=… — リンク成立のポーリング（3秒間隔）。
 *
 *   WAITING — 管理者の操作待ち
 *   LINKED  — プロファイルにリンク済み（deviceId/deviceName を返す →
 *             画面は confirm ポーリングへ移行）
 *   EXPIRED / NOT_FOUND — コード再発行（begin）が必要
 *
 * ★ 判定順序の不変条件: **request.device の有無を expiresAt より先に見る。**
 *   期限ぎりぎりに成立したリンクを「期限切れ」で取りこぼさないため
 *   （キオスクの link-status と同じ約束）。
 */

import { NextResponse } from "next/server";
import { normalizeCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import { LINK_CODE_LENGTH } from "@/lib/display-core";
import { deviceName } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = normalizeCode(url.searchParams.get("code") ?? "");
  if (code.length !== LINK_CODE_LENGTH) {
    return NextResponse.json({ status: "NOT_FOUND" }, { status: 404 });
  }

  const request = await prisma.displayLinkRequest.findUnique({
    where: { code },
    include: { device: { select: { id: true, name: true } } },
  });
  if (!request) {
    return NextResponse.json({ status: "NOT_FOUND" }, { status: 404 });
  }
  if (request.device) {
    return NextResponse.json({
      status: "LINKED",
      deviceId: request.device.id,
      deviceName: deviceName(request.device.name),
    });
  }
  if (request.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ status: "EXPIRED" }, { status: 410 });
  }
  return NextResponse.json({ status: "WAITING" });
}
