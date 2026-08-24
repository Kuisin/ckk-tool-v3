/**
 * POST /api/kiosk/setup/confirm — 有効化待ちポーリング（3秒間隔）。
 *
 * 管理者が SY09 で有効化（status: ACTIVE）済みなら、30日デバイストークンを
 * 発行して kiosk_device Cookie を設定する。トークンは端末側のこの経路で
 * しか発行されない（管理 UI は status を変えるだけ）。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setDeviceCookie } from "@/lib/kiosk-auth";
import { wsBridge } from "@/lib/ws-bridge";

const bodySchema = z.object({ deviceId: z.uuid() });

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const device = await prisma.kioskDevice.findUnique({
    where: { id: parsed.data.deviceId },
    select: { id: true, status: true, deviceTokenHash: true },
  });
  if (!device) {
    return NextResponse.json({ status: "NOT_FOUND" }, { status: 404 });
  }
  if (device.status === "PENDING") {
    return NextResponse.json({ status: "PENDING" });
  }
  if (device.status !== "ACTIVE") {
    return NextResponse.json({ status: device.status });
  }
  // 有効化直後の 1 回だけトークンを発行（既発行なら reactivate 経路のみ）
  if (device.deviceTokenHash) {
    return NextResponse.json({ status: "ALREADY_CONFIRMED" });
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
  wsBridge()?.notifyDeviceChanged(device.id);
  return NextResponse.json({ status: "CONFIRMED" });
}
