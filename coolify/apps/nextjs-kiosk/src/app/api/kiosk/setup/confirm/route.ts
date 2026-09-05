/**
 * POST /api/kiosk/setup/confirm — 有効化待ちポーリング（3秒間隔）。
 *
 * 管理者が SY09 で有効化（status: ACTIVE）済みなら、30日デバイストークンを
 * 発行して kiosk_device Cookie を設定する。トークンは端末側のこの経路で
 * しか発行されない（管理 UI は status を変えるだけ）。
 *
 * ■ deviceId だけでは発行しない
 * reactivate（Cookie 消失からの復帰）が先に直した穴と同じものが、こちらにも
 * 残っていた。**deviceId は秘密ではない** — link-status の応答・localStorage・
 * SY09 の URL・audit_logs に出る。有効化の直後に「最初に叩いた者」へ 30 日
 * トークンを渡していたので、UUID を知る誰か（例えばリンク作業を見ていた人）が
 * 本物のタブレットより先に叩けば、その端末になりすませた。
 *
 * そこで**リンクコードの提示**を求める。コードはその画面が自分で出したもので
 * （begin → 画面に QR + 文字で表示）、`kiosk_link_requests` にあり、管理者が
 * SY09 で読み取った時点で device_id が入る。つまり「そのコードを知っている」
 * ＝「そのプロファイルに結ばれた画面を見ている」で、行と 1 対 1 に結びつく。
 * タブレットは link-status のポーリングで既にこのコードを持っているので、
 * 新しい秘密を作らずに済む（link_request に確認用の秘密列を足す案もあったが、
 * 画面に出ている 12 桁と同じ強さのものを 2 本持つ理由が無い）。
 *
 * ⚠️ **端末側と一緒に出すこと。** 古い画面（コードを送らない JS）は
 * PROOF_REQUIRED で止まる。止まった画面はリンクコードの発行からやり直せば
 * 通る（/setup を再読み込み）。
 *
 * トークン発行 = 「この端末が信頼済みになった」瞬間なので認証イベント
 * （app.login_attempts）に残す。PENDING のポーリング（3 秒間隔）は記録しない
 * — 有効化待ちの間じゅう行が増えても意味が無い。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import { setDeviceCookie } from "@/lib/kiosk-auth";
import { REGISTRATION_CODE_LENGTH } from "@/lib/kiosk-auth-core";
import {
  attemptContext,
  deny,
  recordKioskSuccess,
} from "@/lib/kiosk-login-log";
import { clientIpOf, userAgentOf } from "@/lib/request-ip";
import { wsBridge } from "@/lib/ws-bridge";

const bodySchema = z.object({
  deviceId: z.uuid(),
  /** この画面が表示したリンクコード（所持の証明）。 */
  code: z.string(),
});

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
  // 有効化直後の 1 回だけトークンを発行（既発行なら reactivate 経路のみ）。
  // **所持の証明より先に見る** — 証明の成否でトークンの有無が判るのは
  // 望ましくないが、ここは「もう発行済み」を返すだけで何も渡さない。
  if (device.deviceTokenHash) {
    return NextResponse.json({ status: "ALREADY_CONFIRMED" });
  }

  // 所持の証明: この画面が表示したリンクコードで、かつそのリンクが
  // このプロファイルに結ばれていること。
  const code = normalizeCode(parsed.data.code);
  const link =
    code.length === REGISTRATION_CODE_LENGTH
      ? await prisma.kioskLinkRequest.findUnique({
          where: { code },
          select: { deviceId: true },
        })
      : null;
  if (!link || link.deviceId !== device.id) {
    // 画面は `status` を見る（この経路の他の返事と揃える）。`state` は
    // deny() が付ける共通の形。
    return deny(
      attemptContext(req, { id: device.id, attested: false }),
      "PROOF_REQUIRED",
      403,
      { method: "DEVICE_LINK" },
      { status: "PROOF_REQUIRED" },
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
  recordKioskSuccess(attemptContext(req, { id: device.id, attested: false }), {
    method: "DEVICE_LINK",
  });
  wsBridge()?.notifyDeviceChanged(device.id);
  return NextResponse.json({ status: "CONFIRMED" });
}
