/**
 * POST /api/display/setup/reactivate — Cookie 消失時の再発行。
 *
 * ■ 生きているトークンがある画面には出さない（監査 H2）
 * ディスプレイには端末鍵も設定コードも無いので、「その画面である証明」を
 * 立てる材料が deviceId しかない。deviceId は秘密ではない（link-status の
 * 応答・localStorage・SY09 の URL に出る）ので、以前の「deviceId だけで
 * 365 日トークンを発行して上書きする」形は、UUID を知る誰でも壁の画面を
 * 乗っ取れ（署名済み Metabase 埋め込み URL まで受け取れ）、本物の Pi を
 * 締め出せるものだった。
 *
 * いまは **トークンが無い / 期限切れ** の行にだけ再発行する。それは
 * 「発行済みの信頼を奪う」のではなく「切れた信頼を更新する」だけで、
 * 攻撃者が得るものは、放置された画面の枠だけ（内容は行が決める）。
 * Chromium のプロファイルが飛んだが行のトークンはまだ生きている、という
 * 場合は 409 TOKEN_LIVE を返し、画面はリンクコードからやり直す（DisplaySetup
 * はこの応答で begin() に落ちる）。管理者が SY09 で「リンク解除 → 再リンク」
 * するか、期限切れを待つかのどちらか。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setDisplayCookie } from "@/lib/display-auth";
import { isDisplayTokenAlive, normalizeScreenIndex } from "@/lib/display-core";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ deviceId: z.uuid() });

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const device = await prisma.displayDevice.findUnique({
    where: { id: parsed.data.deviceId },
    select: {
      id: true,
      status: true,
      deviceTokenHash: true,
      deviceTokenExpiresAt: true,
    },
  });
  if (!device || device.status !== "ACTIVE") {
    return NextResponse.json(
      { status: device?.status ?? "NOT_FOUND" },
      { status: 403 },
    );
  }
  if (
    device.deviceTokenHash &&
    isDisplayTokenAlive(new Date(), device.deviceTokenExpiresAt)
  ) {
    return NextResponse.json({ status: "TOKEN_LIVE" }, { status: 409 });
  }

  // この窓（画面）専用の Cookie に入れる
  const screen = normalizeScreenIndex(
    new URL(req.url).searchParams.get("screen"),
  );
  const { hash, expiresAt } = await setDisplayCookie(screen);
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
