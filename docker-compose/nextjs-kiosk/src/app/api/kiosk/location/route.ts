/**
 * POST /api/kiosk/location — 端末の GPS 位置報告（5 分ごと — LocationReporter）。
 *
 * 端末 Cookie（kiosk_device）で認証し、位置ログ専用テーブル
 * app.kiosk_device_locations に 1 行追記する（履歴保持 — 保持期間は
 * pg_cron の kiosk_location_retention で 90 日）。SY09 は最新 1 件を表示。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDevice } from "@/lib/kiosk-auth";

export async function POST(req: Request) {
  const device = await getDevice();
  if (!device.ok) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const { latitude, longitude, accuracyM } = (body ?? {}) as {
    latitude?: unknown;
    longitude?: unknown;
    accuracyM?: unknown;
  };
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const accuracy =
    typeof accuracyM === "number" &&
    Number.isFinite(accuracyM) &&
    accuracyM >= 0
      ? Math.min(Math.round(accuracyM * 10) / 10, 9_999_999)
      : null;

  await prisma.kioskDeviceLocation.create({
    data: {
      deviceId: device.device.id,
      latitude: Math.round(latitude * 1e6) / 1e6,
      longitude: Math.round(longitude * 1e6) / 1e6,
      accuracyM: accuracy,
    },
  });
  return NextResponse.json({ ok: true });
}
