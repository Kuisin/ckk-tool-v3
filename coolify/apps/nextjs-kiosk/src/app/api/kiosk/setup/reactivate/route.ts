/**
 * /api/kiosk/setup/reactivate — Cookie 消失時の端末トークン再発行。
 *
 * ■ deviceId だけでは再発行しない（監査 H2）
 * 以前は `{ deviceId }` の POST 1 本で 30 日トークンを発行し、既存のハッシュを
 * 上書きしていた。deviceId は秘密ではない — link-status の応答・localStorage・
 * SY09 の URL・audit_logs に出る — ので、UUID を知る誰でも端末の信頼を作れ、
 * 本物のタブレットは Cookie を失効させられていた。
 *
 * いまは「その端末である証明」を 2 通りのどちらかで要求する:
 *
 *   A. 端末鍵の署名（専用アプリ）
 *      GET  ?deviceId=… → nonce（REACTIVATE チケット・2 分・単回）
 *      POST { deviceId, nonce, signature } → 行に束縛済みの公開鍵で検証
 *      （/api/kiosk/attest と同じ SHA256withECDSA）。鍵は Keystore の非
 *      エクスポート鍵なので、Cookie が消えても端末を離れない。
 *
 *   B. 端末設定コード（ブラウザ利用 / 鍵未束縛の端末）
 *      POST { deviceId, settingsCode } → kiosk_devices.settings_code と照合。
 *      管理者が SY09 で読んで現場に伝える 6 桁で、/api/kiosk/device-settings/
 *      verify と同じロック（5 回失敗 → 15 分）。形式不正も 1 失敗と数える。
 *
 * どちらも無ければ 403 PROOF_REQUIRED（画面は設定コードの入力を求める）。
 * 発行・失敗は login_attempts に残す（method DEVICE_LINK）。
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyDeviceSignature } from "@/lib/attest-core";
import { prisma } from "@/lib/db";
import { setDeviceCookie } from "@/lib/kiosk-auth";
import {
  attemptContext,
  deny,
  recordKioskSuccess,
} from "@/lib/kiosk-login-log";
import { clientIpOf, userAgentOf } from "@/lib/request-ip";
import {
  clearGate,
  gateLockedUntil,
  recordGateFailure,
} from "@/lib/settings-gate";
import { consumeTicket, issueTicket } from "@/lib/tickets";
import { wsBridge } from "@/lib/ws-bridge";

const METHOD = "DEVICE_LINK" as const;

/** 設定コードのロックは device-settings/verify と別に数える（用途が違う）。 */
const gateKey = (deviceId: string) => `reactivate:${deviceId}`;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function findActive(deviceId: string) {
  return prisma.kioskDevice.findUnique({
    where: { id: deviceId },
    select: {
      id: true,
      status: true,
      devicePublicKey: true,
      settingsCode: true,
    },
  });
}

/** A の第 1 段: 端末鍵に署名させる nonce を出す。鍵が束縛されていなければ 404。 */
export async function GET(req: Request) {
  const deviceId = new URL(req.url).searchParams.get("deviceId") ?? "";
  if (!z.uuid().safeParse(deviceId).success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const device = await findActive(deviceId);
  if (!device || device.status !== "ACTIVE" || !device.devicePublicKey) {
    // 鍵の有無を UUID 総当たりのオラクルにしない — 無い/止まっている/鍵なし
    // はすべて同じ返事にする
    return NextResponse.json({ status: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({
    nonce: issueTicket("", device.id, "REACTIVATE"),
  });
}

const bodySchema = z.object({
  deviceId: z.uuid(),
  nonce: z.string().min(1).max(200).optional(),
  signature: z.string().min(1).max(400).optional(),
  settingsCode: z.string().max(20).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const { deviceId, nonce, signature, settingsCode } = parsed.data;

  const device = await findActive(deviceId);
  if (!device || device.status !== "ACTIVE") {
    return NextResponse.json(
      { status: device?.status ?? "NOT_FOUND" },
      { status: 403 },
    );
  }
  const ctx = attemptContext(req, { id: device.id, attested: false });

  if (nonce !== undefined || signature !== undefined) {
    // A. 端末鍵の署名
    if (
      !nonce ||
      !signature ||
      !consumeTicket(nonce, "REACTIVATE", device.id)
    ) {
      return deny(ctx, "TICKET_EXPIRED", 410, { method: METHOD });
    }
    if (
      !device.devicePublicKey ||
      !verifyDeviceSignature(device.devicePublicKey, nonce, signature)
    ) {
      return deny(ctx, "REACTIVATE_BAD_SIGNATURE", 403, { method: METHOD });
    }
  } else if (settingsCode !== undefined) {
    // B. 端末設定コード（形式不正も 1 失敗）
    const lockedUntil = gateLockedUntil(gateKey(device.id));
    if (lockedUntil) {
      return deny(
        ctx,
        "REACTIVATE_LOCKED",
        429,
        { method: METHOD },
        {
          until: lockedUntil,
        },
      );
    }
    if (
      !/^[0-9]{6}$/.test(settingsCode) ||
      !safeEqual(settingsCode, device.settingsCode)
    ) {
      const until = recordGateFailure(gateKey(device.id));
      if (until) {
        return deny(
          ctx,
          "REACTIVATE_LOCKED",
          429,
          { method: METHOD },
          {
            until,
          },
        );
      }
      return deny(ctx, "REACTIVATE_CODE_INVALID", 401, { method: METHOD });
    }
    clearGate(gateKey(device.id));
  } else {
    return deny(
      ctx,
      "PROOF_REQUIRED",
      403,
      { method: METHOD },
      {
        // 画面が「設定コードで復帰」を出すか判断する材料（鍵が無い端末では
        // 署名の道は無い）。鍵の有無はここに来た時点で既に UUID を知っている
        // 相手にしか見えない。
        canSign: Boolean(device.devicePublicKey),
      },
    );
  }

  const { hash, expiresAt } = await setDeviceCookie();
  await prisma.kioskDevice.update({
    where: { id: device.id },
    data: {
      deviceTokenHash: hash,
      deviceTokenExpiresAt: expiresAt,
      lastActivityAt: new Date(),
      lastIpAddress: clientIpOf(req),
      userAgent: userAgentOf(req),
    },
  });
  recordKioskSuccess(ctx, { method: METHOD });
  wsBridge()?.notifyDeviceChanged(device.id);
  return NextResponse.json({ status: "CONFIRMED" });
}
