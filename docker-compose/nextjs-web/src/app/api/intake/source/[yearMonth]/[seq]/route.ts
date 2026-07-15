/**
 * GET /api/intake/source/[yearMonth]/[seq] — 受注請書の取込元ファイル配信。
 *
 * 取込元は files 行（source_file_id）+ SeaweedFS のオブジェクト —
 * 添付（document_attachments）ではないため /api/attachments では配信
 * できない。PDF / 画像のみなので常に inline（ブラウザ内表示）で返す。
 * 行・オブジェクトのどちらかが無ければ 404。
 */

import { prisma } from "@/lib/db";
import { contentTypeForKey, getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ yearMonth: string; seq: string }> };

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { yearMonth, seq } = await params;
  const seqNum = Number(seq);
  if (!/^\d{6}$/.test(yearMonth) || !Number.isInteger(seqNum) || seqNum < 1) {
    return new Response("Not found", { status: 404 });
  }

  const row = await prisma.orderAcceptance
    .findUnique({
      where: { yearMonth_seq: { yearMonth, seq: seqNum } },
      select: {
        sourceFile: {
          select: { storageKey: true, filename: true, mimeType: true },
        },
      },
    })
    .catch(() => null);
  const file = row?.sourceFile;
  if (!file) return new Response("Not found", { status: 404 });

  const bytes = await getObject(file.storageKey);
  if (!bytes) return new Response("Not found", { status: 404 });

  const contentType = file.mimeType || contentTypeForKey(file.storageKey);
  const encodedName = encodeURIComponent(file.filename);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `inline; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
    },
  });
}
