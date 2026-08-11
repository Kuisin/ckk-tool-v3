/**
 * PUT /api/kiosk/locale — ログイン中ユーザーの UI 言語を保存する。
 * users.locale に永続化するため、どの端末でログインしても本人の言語が付いてくる。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { LOCALES } from "@/lib/i18n";
import { getSession } from "@/lib/kiosk-auth";

const bodySchema = z.object({ locale: z.enum(LOCALES) });

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
    data: { locale: parsed.data.locale },
  });
  return NextResponse.json({ ok: true, locale: parsed.data.locale });
}
