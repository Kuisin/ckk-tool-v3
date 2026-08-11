/**
 * POST /api/kiosk/device-settings/verify — 端末設定コード（6桁）の検証。
 *
 * 成功で端末情報 + 単回チケット（2分）を返す。設定画面の内容は検証成功まで
 * 一切返さない（「コードなしでは閲覧も不可」の要件）。
 * 試行制限: 5回失敗で 15分ロック（settings-gate.ts — PIN と同ポリシー）。
 * コードは管理者が SY09 で確認してフロア担当者に伝える便宜ゲート —
 * 端末の認証そのものはデバイストークン Cookie が担う。
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDeviceForSettings } from "@/lib/kiosk-auth";
import {
  clearGate,
  gateLockedUntil,
  recordGateFailure,
} from "@/lib/settings-gate";
import { issueTicket } from "@/lib/tickets";

const bodySchema = z.object({ code: z.string().regex(/^[0-9]{6}$/) });

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function POST(req: Request) {
  const device = await getDeviceForSettings();
  if (!device) {
    return NextResponse.json({ state: "NO_DEVICE" }, { status: 403 });
  }

  const lockedUntil = gateLockedUntil(device.id);
  if (lockedUntil) {
    return NextResponse.json(
      { state: "LOCKED", until: lockedUntil },
      { status: 429 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  // 形式不正も 1 失敗として数える（形式で当たりを探れないように）
  if (!parsed.success || !safeEqual(parsed.data.code, device.settingsCode)) {
    const until = recordGateFailure(device.id);
    if (until) {
      return NextResponse.json({ state: "LOCKED", until }, { status: 429 });
    }
    return NextResponse.json({ state: "INVALID" }, { status: 401 });
  }

  clearGate(device.id);
  const ticket = issueTicket("", device.id, "DEVICE_SETTINGS");
  return NextResponse.json({
    state: "OK",
    ticket,
    device: {
      id: device.id,
      name: device.name,
      status: device.status,
      linkedAt: device.linkedAt,
      deviceTokenExpiresAt: device.deviceTokenExpiresAt,
      fingerprint: device.fingerprint,
    },
  });
}
