/**
 * GET /api/display/image/[fileId] — IMAGE プロファイルの画像を返す。
 *
 * ディスプレイの Cookie を持っているときだけ通す。画像そのものは
 * SeaweedFS の Filer に置かれていて、ここは `files` 行で実体を引いてから
 * 中継するだけ（S3 SDK は足さない — nextjs-web の lib/storage.ts と同じ判断）。
 *
 * **どの画像でも見られるわけではない**: 引けるのは、そのディスプレイに
 * 割り当てられた IMAGE プロファイルが指しているファイルだけ。fileId を
 * 差し替えても他の書類の添付は取り出せない。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDisplay } from "@/lib/display-auth";
import { imageConfigSchema } from "@/lib/display-content";
import { normalizeScreenIndex } from "@/lib/display-core";

export const dynamic = "force-dynamic";

const FILER_URL = (
  process.env.SEAWEED_FILER_URL ?? "http://localhost:8888"
).replace(/\/$/, "");

export async function GET(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  // 窓ごとに別の Cookie（描画側が ?screen= を付けて呼ぶ）
  const screen = normalizeScreenIndex(
    new URL(req.url).searchParams.get("screen"),
  );
  const auth = await getDisplay(screen);
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { fileId } = await params;

  // 「この画面に設定された画像か」を必ず確かめる
  const device = await prisma.displayDevice.findUnique({
    where: { id: auth.display.id },
    select: { contentType: true, contentConfig: true },
  });
  if (!device || device.contentType !== "IMAGE") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const parsed = imageConfigSchema.safeParse(device.contentConfig ?? {});
  if (!parsed.success || parsed.data.fileId !== fileId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { storageKey: true, mimeType: true },
  });
  if (!file) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const upstream = await fetch(
      `${FILER_URL}/${file.storageKey.replace(/^\/+/, "")}`,
    );
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return new Response(upstream.body, {
      headers: {
        "content-type": file.mimeType || "application/octet-stream",
        // 差し替えが即座に効いてほしいので溜めない（画像 1 枚ぶんなので安い）
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });
  }
}
