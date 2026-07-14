/**
 * /api/attachments/[id] — 証憑の配信と削除。
 *
 * GET    — SeaweedFS から本体をストリーム返却。PDF / 画像は inline
 *          （ブラウザ内表示）、それ以外（XLSX / CSV 等）は attachment。
 *          行・オブジェクトのどちらかが無ければ 404。
 * DELETE — lib/attachments.deleteAttachment（行削除 + オブジェクト
 *          best-effort 削除 + 監査）。応答は { ok } JSON。
 */

import { NextResponse } from "next/server";
import { deleteAttachment, fetchAttachmentFile } from "@/lib/attachments";
import { contentTypeForKey, getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { id } = await params;
  const file = await fetchAttachmentFile(decodeURIComponent(id));
  if (!file) return new Response("Not found", { status: 404 });

  const bytes = await getObject(file.storageKey);
  if (!bytes) return new Response("Not found", { status: 404 });

  const contentType = file.mimeType || contentTypeForKey(file.storageKey);
  const inline =
    contentType === "application/pdf" || contentType.startsWith("image/");
  const encodedName = encodeURIComponent(file.filename);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const { id } = await params;
  const result = await deleteAttachment(decodeURIComponent(id));
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
