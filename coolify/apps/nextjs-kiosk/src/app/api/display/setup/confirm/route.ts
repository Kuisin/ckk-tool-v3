/**
 * POST /api/display/setup/confirm — 有効化待ちポーリング（3秒間隔）。
 *
 * 管理者が SY09 で有効化（status: ACTIVE）済みなら、365日トークンを発行して
 * ckk_display Cookie を設定する。**トークンは画面側のこの経路でしか発行
 * されない**（管理 UI は status を変えるだけ）— 管理画面が発行すると、その値を
 * どう安全に Pi へ渡すかという問題が生まれる。
 *
 * キオスクの confirm と同じ形。違うのは認証イベントを残さない点で、
 * ディスプレイには利用者が居らず、login_attempts の actor に当たるものが
 * 無いため（あれは「誰が入ったか」の台帳）。
 *
 * ■ deviceId だけでは発行しない（キオスクの confirm と同じ理由）
 * **deviceId は秘密ではない** — link-status の応答・localStorage・SY09 の URL に
 * 出る。有効化の直後に「最初に叩いた者」へ 365 日トークンを渡していたので、
 * UUID を知る誰かが本物の画面より先に叩けば、その掲示板になりすませた。
 * しかもディスプレイのトークンは 1 年もつので、気づく機会がほとんど無い。
 *
 * そこで**リンクコードの提示**を求める。コードはその画面が自分で出したもので
 * （begin → 画面に QR + 文字で表示）、`display_link_requests` にあり、管理者が
 * SY09 で読み取った時点で device_id が入る。画面は link-status のポーリングで
 * 既に持っているので、新しい秘密を作らずに済む。
 *
 * ⚠️ **画面側と一緒に出すこと。** 古い JS は PROOF_REQUIRED で止まる。
 * 止まった画面はリンクからやり直せば通る（/display を再読み込み）。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import { setDisplayCookie } from "@/lib/display-auth";
import { machineHint } from "@/lib/display-core";
import { displayWsBridge } from "@/lib/display-ws-bridge";
import { REGISTRATION_CODE_LENGTH } from "@/lib/kiosk-auth-core";
import { clientIpOf, userAgentOf } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  deviceId: z.uuid(),
  /** この画面が表示したリンクコード（所持の証明）。 */
  code: z.string(),
  // どの機械の何枚目か（自己申告の手掛かり。認証には使わない）
  machineId: z.string().optional(),
  screenIndex: z.union([z.number(), z.string()]).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const device = await prisma.displayDevice.findUnique({
    where: { id: parsed.data.deviceId },
    select: { id: true, status: true, deviceTokenHash: true },
  });
  if (!device) {
    return NextResponse.json({ status: "NOT_FOUND" }, { status: 404 });
  }
  if (device.status === "PENDING") {
    // リンク解除された（プロファイルがオープンに戻った）→ 画面は最初から
    return NextResponse.json({ status: "PENDING" });
  }
  if (device.status !== "ACTIVE") {
    return NextResponse.json({ status: device.status });
  }
  if (device.deviceTokenHash) {
    return NextResponse.json({ status: "ALREADY_CONFIRMED" });
  }

  // 所持の証明: この画面が表示したリンクコードで、かつそのリンクが
  // このプロファイルに結ばれていること。
  const code = normalizeCode(parsed.data.code);
  const link =
    code.length === REGISTRATION_CODE_LENGTH
      ? await prisma.displayLinkRequest.findUnique({
          where: { code },
          select: { deviceId: true },
        })
      : null;
  if (!link || link.deviceId !== device.id) {
    return NextResponse.json({ status: "PROOF_REQUIRED" }, { status: 403 });
  }

  const hint = machineHint(parsed.data.machineId, parsed.data.screenIndex);
  // この窓（画面）専用の Cookie に入れる
  const { hash, expiresAt } = await setDisplayCookie(hint.screenIndex);
  await prisma.displayDevice.update({
    where: { id: device.id },
    data: {
      deviceTokenHash: hash,
      deviceTokenExpiresAt: expiresAt,
      lastSeenAt: new Date(),
      lastIpAddress: clientIpOf(req),
      userAgent: userAgentOf(req),
      machineId: hint.machineId,
      screenIndex: hint.screenIndex,
    },
  });
  displayWsBridge()?.notifyDisplayChanged(device.id);
  return NextResponse.json({ status: "CONFIRMED" });
}
