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
import { prisma } from "@/lib/db";
import { deviceName, type LocalizedText, localized } from "@/lib/format";
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

  // 既定の作業場所 — 現在値 + 選択肢（端末の拠点 or 拠点未指定グループ）。
  // この画面はログイン前 = ja 固定なのでラベルは日本語で解決する。
  const [current, locations] = await Promise.all([
    device.defaultWorkLocationId != null
      ? prisma.workLocation.findUnique({
          where: { id: device.defaultWorkLocationId },
          select: { id: true, name: true, group: { select: { name: true } } },
        })
      : null,
    prisma.workLocation.findMany({
      where: {
        isActive: true,
        group: {
          isActive: true,
          OR: [{ plantId: device.plantId }, { plantId: null }],
        },
      },
      include: { group: { select: { name: true } } },
      orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    }),
  ]);
  const locationLabel = (l: {
    name: unknown;
    group: { name: unknown };
  }): string =>
    `${localized(l.group.name as LocalizedText | null, "ja")} / ${localized(l.name as LocalizedText | null, "ja")}`;

  return NextResponse.json({
    state: "OK",
    ticket,
    device: {
      id: device.id,
      name: deviceName(device.name),
      status: device.status,
      linkedAt: device.linkedAt,
      deviceTokenExpiresAt: device.deviceTokenExpiresAt,
      fingerprint: device.fingerprint,
      defaultWorkLocationId: device.defaultWorkLocationId,
      defaultWorkLocationLabel: current ? locationLabel(current) : null,
      enforceWorkLocation: device.enforceWorkLocation,
    },
    workLocationOptions: locations.map((l) => ({
      value: String(l.id),
      label: locationLabel(l),
    })),
  });
}
