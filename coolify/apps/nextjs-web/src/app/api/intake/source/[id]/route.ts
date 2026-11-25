/**
 * GET /api/intake/source/[id] — 注文請書の取込元ファイル配信。
 *
 * `[id]` は注文請書の id（`CKK~ORD-2026-00001` — lib/doc-number.ts の「id」の姿）。
 * 番号は法人ごとの連番なので、番号だけでは請書が 1 つに決まらない。
 * 古いリンクのために番号だけ・旧番号（`ORD-202607-00001`）も受けるが、
 * 1 件に決まるときだけ返す（複数の法人に同じ番号があれば 404）。
 *
 * 取込元は files 行（source_file_id）+ SeaweedFS のオブジェクト —
 * 添付（document_attachments）ではないため /api/attachments では配信
 * できない。PDF / 画像のみなので常に inline（ブラウザ内表示）で返す。
 * 行・オブジェクトのどちらかが無ければ 404。
 */

import { rowInScope } from "@ckk/authz-core";
import { checkPermission, sessionUserId } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { parseDocKey } from "@/lib/doc-number";
import { resolveDocId } from "@/lib/doc-ref";
import { contentTypeForKey, getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** パスの id → 注文請書の参照。決まらなければ null。 */
async function acceptanceRef(raw: string): Promise<string | null> {
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    // 壊れた符号化はそのまま読む（どうせ番号の形に合わず 404 になる）
  }
  const key = parseDocKey(id, "ORD");
  if (key) return key.docRef;
  const resolved = await resolveDocId("order_acceptances", id);
  return resolved.status === "ok" ? resolved.docRef : null;
}

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  // 取込元ファイルの閲覧 — GET なので CREATE ではなく READ でゲート（判断メモ）。
  const authz = await checkPermission("order_acceptance", "READ");
  if (!authz.ok) {
    const status = (await sessionUserId()) ? 403 : 401;
    return Response.json({ error: authz.error }, { status });
  }
  const { id } = await params;
  const docRef = await acceptanceRef(id).catch(() => null);
  if (!docRef) return new Response("Not found", { status: 404 });

  const row = await prisma.orderAcceptance
    .findUnique({
      where: { docRef },
      select: {
        createdBy: true,
        sourceFile: {
          select: { storageKey: true, filename: true, mimeType: true },
        },
      },
    })
    .catch(() => null);
  // OWN スコープの利用者は自分が取り込んだ行だけ（/api/intake/queue と同じ規則）。
  // スコープ外は不存在と区別しない（404）。
  if (
    row &&
    !rowInScope(authz.access, { createdBy: row.createdBy }, authz.userId)
  ) {
    return new Response("Not found", { status: 404 });
  }
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
