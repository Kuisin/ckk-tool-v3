/**
 * PUT /api/kiosk/text-scale — ログイン中ユーザーの文字の大きさを保存する。
 *
 * 保存先は `users.text_scale` で **nextjs-web と同じ列**。どの端末で
 * ログインしても、Web で決めた大きさがそのまま付いてくる（言語と同じ考え方 —
 * /api/kiosk/locale を参照）。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/kiosk-auth";
import { TEXT_SCALES } from "@/lib/text-scale";

const bodySchema = z.object({ textScale: z.enum(TEXT_SCALES) });

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: session.userId },
    data: { textScale: parsed.data.textScale },
  });
  return NextResponse.json({ ok: true, textScale: parsed.data.textScale });
}
