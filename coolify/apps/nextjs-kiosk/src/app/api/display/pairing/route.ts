/**
 * POST /api/display/pairing — ペアリングの開始（ディスプレイ側でコード発行）。
 *
 * display_pairing_sessions（12桁コード・10分）を作り、/display が QR と
 * 文字で表示する。管理者はそれを読んで SY0I で名前・設置場所・表示内容を
 * 決める。成立はディスプレイが status をポーリングして検知する。
 *
 * 認証は無い（新品の Pi には何も無い）。コード自体はアクセス権を持たず、
 * ペアリングを完了できるのは認証済みの管理者だけ。
 *
 * 期限切れ行の掃除もここで行う（pg_cron を増やさないための場所 —
 * キオスクの setup/begin と同じやり方）。
 */

import { NextResponse } from "next/server";
import { generateCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import { getDisplay } from "@/lib/display-auth";
import { PAIRING_CODE_LENGTH, PAIRING_TTL_MS } from "@/lib/display-core";
import { clientIpOf, userAgentOf } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const existing = await getDisplay();
  if (existing.ok) {
    return NextResponse.json({
      status: "ALREADY_PAIRED",
      displayId: existing.display.id,
    });
  }

  const now = new Date();
  // 期限切れ・未成立のセッションを掃除。成立済み（display_device_id あり）は
  // ディスプレイのポーリングが読むまで残す — 初回の受け取りは TTL を過ぎても
  // 通す約束（status ルート参照）なので、消すのは十分に古くなってから。
  await prisma.displayPairingSession.deleteMany({
    where: {
      OR: [
        { displayDeviceId: null, expiresAt: { lt: now } },
        {
          displayDeviceId: { not: null },
          expiresAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      ],
    },
  });

  const session = await prisma.displayPairingSession.create({
    data: {
      code: generateCode(PAIRING_CODE_LENGTH),
      expiresAt: new Date(now.getTime() + PAIRING_TTL_MS),
      // 左端（クライアント自称）ではなく信頼できるプロキシが観測した値
      userAgent: userAgentOf(req),
      lastIpAddress: clientIpOf(req),
    },
    select: { code: true, expiresAt: true },
  });

  return NextResponse.json({
    status: "WAITING",
    code: session.code,
    expiresAt: session.expiresAt,
  });
}
