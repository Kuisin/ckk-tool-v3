/**
 * GET /api/design-programs/[id]/file — 加工プログラム本体のダウンロード。
 *
 * 読める人は図面と同じ `design_file:READ`（関わる業務ロールは全員持つ —
 * /api/design-files/[id] と同じ判断）。プログラムは機械へ持っていくもので
 * ブラウザで開くものではないので、**常に attachment** で返す。
 */

import { requirePermissionResponse } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const denied = await requirePermissionResponse("design_file", "READ");
  if (denied) return denied;

  const { id } = await params;
  if (!UUID_RE.test(id)) return new Response("Not found", { status: 404 });

  const row = await prisma.designProgram.findUnique({
    where: { id },
    select: { file: { select: { storageKey: true, filename: true } } },
  });
  if (!row?.file) return new Response("Not found", { status: 404 });

  const bytes = await getObject(row.file.storageKey);
  if (!bytes) return new Response("Not found", { status: 404 });

  const encodedName = encodeURIComponent(row.file.filename);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
    },
  });
}
