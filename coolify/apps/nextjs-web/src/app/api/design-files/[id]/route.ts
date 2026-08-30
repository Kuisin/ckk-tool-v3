/**
 * /api/design-files/[id] — 設計図（版）の配信。
 *
 * 設計図 (PD06) が持つ `design_files` は `file_id → files` を直接指して
 * いて、`document_attachments` の行ではない。そのため `/api/attachments/[id]`
 * では開けず、版一覧はファイル名を並べるだけで**中身を見る手段が無かった**。
 * ここがその手段。
 *
 * GET — SeaweedFS から本体をストリーム返却。PDF / 画像は inline、それ以外は
 *       attachment。読める人は `design_file:READ` を持つ人 — 図面は
 *       「何を作るか」なので、関わる業務ロールは全員 READ を持つ。
 *
 * 削除は無い — 版は履歴なので消さない（差し替えは新しい版を足す）。
 */

import { isInlineSafe } from "@/lib/attachments";
import { requirePermissionResponse } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { contentTypeForKey, getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const denied = await requirePermissionResponse("design_file", "READ");
  if (denied) return denied;

  const { id } = await params;
  const designFileId = decodeURIComponent(id);

  const row = await prisma.designFile.findUnique({
    where: { id: designFileId },
    include: {
      file: {
        select: { storageKey: true, filename: true, mimeType: true },
      },
    },
  });
  if (!row) return new Response("Not found", { status: 404 });

  const bytes = await getObject(row.file.storageKey);
  if (!bytes) return new Response("Not found", { status: 404 });

  const contentType =
    row.file.mimeType || contentTypeForKey(row.file.storageKey);
  // インライン表示は PDF / 画像 / 3D だけ。それ以外は必ずダウンロードにする
  // （SVG・HTML を inline で返すと保存 XSS になる。判定は lib/attachments の
  //  isInlineSafe が唯一の持ち主）。
  const inline = isInlineSafe(contentType);
  const encodedName = encodeURIComponent(row.file.filename);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      // 申告 MIME を勝手に読み替えさせない（sniffing 経由の HTML 実行を塞ぐ）。
      "x-content-type-options": "nosniff",
      // 万一 inline で開かれても、スクリプト・同一オリジンを与えない。
      "content-security-policy":
        "sandbox; default-src 'none'; img-src 'self' data:; object-src 'self'",
    },
  });
}
