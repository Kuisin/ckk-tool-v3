/**
 * POST /api/kiosk/device-settings/work-location — 端末の既定作業場所の変更
 * （要チケット）。
 *
 * verify 成功時の単回チケット（DEVICE_SETTINGS・2分）を消費して実行する。
 * チケットは単回使用なので、続けてリセット等を実行できるよう**新しい
 * チケットを発行して返す**（ローテーション — reset は従来どおり消費のみ）。
 *
 * 既定作業場所は、この端末で工程を開始/再開したときの作業実績
 * （work_order_step_actuals.work_location_id）に自動記録される。SY09 の
 * 編集モーダルからも変更できる（同じ列を書く）。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { encodeInventoryNote } from "@/lib/inventory-note-core";
import { getDeviceForSettings } from "@/lib/kiosk-auth";
import { consumeTicket, issueTicket } from "@/lib/tickets";
import { wsBridge } from "@/lib/ws-bridge";

const bodySchema = z.object({
  ticket: z.string().min(1),
  /** null = 既定を外す */
  workLocationId: z.number().int().positive().nullable(),
  /**
   * 作業場所の制限トグル。ON のとき、許可作業場所のある工程はこの端末の
   * 既定作業場所が許可に含まれる場合のみ開始/再開できる。
   * 既定作業場所の設定自体はトグルと無関係に可能。
   */
  enforceWorkLocation: z.boolean(),
});

export async function POST(req: Request) {
  const device = await getDeviceForSettings();
  if (!device) {
    return NextResponse.json({ state: "NO_DEVICE" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  if (!consumeTicket(parsed.data.ticket, "DEVICE_SETTINGS", device.id)) {
    // チケット期限切れ（2分）・二重実行 — 再度コード入力から
    return NextResponse.json({ state: "TICKET_INVALID" }, { status: 403 });
  }

  const { workLocationId, enforceWorkLocation } = parsed.data;
  let label: string | null = null;
  if (workLocationId != null) {
    // 有効な場所・有効なグループ・端末の拠点（or 拠点未指定グループ）のみ
    const location = await prisma.workLocation.findFirst({
      where: {
        id: workLocationId,
        isActive: true,
        group: {
          isActive: true,
          OR: [{ plantId: device.plantId }, { plantId: null }],
        },
      },
      select: { name: true, group: { select: { name: true } } },
    });
    if (!location) {
      // 消費済みチケットの代わりを返す（もう一度選び直せるように）
      return NextResponse.json(
        {
          state: "LOCATION_INVALID",
          ticket: issueTicket("", device.id, "DEVICE_SETTINGS"),
        },
        { status: 200 },
      );
    }
    label = `${localized(location.group.name as LocalizedText | null, "ja")} / ${localized(location.name as LocalizedText | null, "ja")}`;
  }

  await prisma.kioskDevice.update({
    where: { id: device.id },
    data: { defaultWorkLocationId: workLocationId, enforceWorkLocation },
  });

  // 監査: 端末側操作なので actor なし（設定コード認証済みであることを注記）
  await prisma.auditLog
    .create({
      data: {
        userId: null,
        action: "UPDATE",
        tableName: "kiosk_devices",
        recordId: device.id,
        beforeData: {
          defaultWorkLocationId: device.defaultWorkLocationId,
          enforceWorkLocation: device.enforceWorkLocation,
        },
        afterData: {
          defaultWorkLocationId: workLocationId,
          enforceWorkLocation,
          note: encodeInventoryNote("deviceWorkLocationChangedFromDevice"),
        },
      },
    })
    .catch(() => undefined);
  wsBridge()?.notifyDeviceChanged(device.id);

  return NextResponse.json({
    state: "OK",
    // 続けて他の操作ができるよう新チケットを返す（単回使用のため）
    ticket: issueTicket("", device.id, "DEVICE_SETTINGS"),
    defaultWorkLocationId: workLocationId,
    defaultWorkLocationLabel: label,
    enforceWorkLocation,
  });
}
