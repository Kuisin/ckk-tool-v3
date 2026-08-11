/**
 * POST /api/kiosk/setup/reactivate — Cookie 消失時の再発行。
 *
 * 端末行が ACTIVE のままなら（localStorage に保持した deviceId で照合し）
 * 新しい 30日トークンを再発行する。demo にあった IP 一致フォールバックは
 * 実装しない — deviceId 不明なら再登録（管理者の再有効化）に倒す。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setDeviceCookie } from "@/lib/kiosk-auth";

const bodySchema = z.object({ deviceId: z.uuid() });

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const device = await prisma.kioskDevice.findUnique({
    where: { id: parsed.data.deviceId },
    select: { id: true, status: true },
  });
  if (!device || device.status !== "ACTIVE") {
    return NextResponse.json(
      { status: device?.status ?? "NOT_FOUND" },
      { status: 403 },
    );
  }

  const { hash, expiresAt } = await setDeviceCookie();
  await prisma.kioskDevice.update({
    where: { id: device.id },
    data: {
      deviceTokenHash: hash,
      deviceTokenExpiresAt: expiresAt,
      lastActivityAt: new Date(),
    },
  });
  return NextResponse.json({ status: "CONFIRMED" });
}
