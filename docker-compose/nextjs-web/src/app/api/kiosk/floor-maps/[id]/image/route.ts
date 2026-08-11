/**
 * GET /api/kiosk/floor-maps/[id]/image — フロアマップ図面画像の配信。
 *
 * kiosk_floor_maps.file_id → files.storage_key を解決し、SeaweedFS
 * （lib/storage）から本体をインライン返却する。RBAC は kiosk:READ
 * （SY09 端末管理と同じゲート）。行・オブジェクトが無ければ 404。
 */

import { requirePermissionResponse } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { contentTypeForKey, getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const denied = await requirePermissionResponse("kiosk", "READ");
  if (denied) return denied;

  const { id } = await params;
  let file: { storageKey: string; mimeType: string } | null = null;
  try {
    const map = await prisma.kioskFloorMap.findUnique({
      where: { id: decodeURIComponent(id) },
      select: {
        file: { select: { storageKey: true, mimeType: true } },
      },
    });
    file = map?.file ?? null;
  } catch {
    // 不正な uuid 等 — 404 扱い。
    file = null;
  }
  if (!file) return new Response("Not found", { status: 404 });

  const bytes = await getObject(file.storageKey);
  if (!bytes) return new Response("Not found", { status: 404 });

  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": file.mimeType || contentTypeForKey(file.storageKey),
      "content-disposition": "inline",
      // 図面は差し替えで URL が変わらないためキャッシュしない。
      "cache-control": "no-store",
    },
  });
}
