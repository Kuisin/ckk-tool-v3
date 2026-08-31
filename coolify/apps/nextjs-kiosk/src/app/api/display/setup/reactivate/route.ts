/**
 * POST /api/display/setup/reactivate — Cookie 消失時の再発行。
 *
 * 画面の行が ACTIVE のままなら（localStorage に保持した deviceId で照合し）
 * 新しい 365日トークンを再発行する。キオスクの reactivate と同じ形で、
 * IP 一致のフォールバックは持たない — deviceId 不明なら再リンクに倒す。
 *
 * これがあるので、Chromium のプロファイルが飛んだ Pi でも、現地で
 * リンクからやり直さずに戻せる。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setDisplayCookie } from "@/lib/display-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ deviceId: z.uuid() });

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const device = await prisma.displayDevice.findUnique({
    where: { id: parsed.data.deviceId },
    select: { id: true, status: true },
  });
  if (!device || device.status !== "ACTIVE") {
    return NextResponse.json(
      { status: device?.status ?? "NOT_FOUND" },
      { status: 403 },
    );
  }

  const { hash, expiresAt } = await setDisplayCookie();
  await prisma.displayDevice.update({
    where: { id: device.id },
    data: {
      deviceTokenHash: hash,
      deviceTokenExpiresAt: expiresAt,
      lastSeenAt: new Date(),
    },
  });
  return NextResponse.json({ status: "CONFIRMED" });
}
