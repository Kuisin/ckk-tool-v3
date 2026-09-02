/**
 * GET /api/kiosk/floor-maps/[id]/image — フロアマップ図面画像の配信。
 *
 * kiosk_floor_maps.file_id → files.storage_key を解決し、SeaweedFS
 * （lib/storage）から本体をインライン返却する。フロアマップは端末管理
 * （SY09）と保管場所（MS0C / 在庫管理 PD04）で共用のため、RBAC は
 * kiosk:READ / inventory:READ / master:READ のいずれか。
 * 行・オブジェクトが無ければ 404。
 */

import { isInlineSafe } from "@/lib/attachments";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { contentTypeForKey, getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const allowed = await Promise.all([
    checkPermission("kiosk", "READ"),
    checkPermission("inventory", "READ"),
    checkPermission("master", "READ"),
  ]);
  if (!allowed.some((a) => a.ok)) {
    return new Response("Forbidden", { status: 403 });
  }

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

  const contentType = file.mimeType || contentTypeForKey(file.storageKey);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": contentType,
      // 旧データに SVG が残っていても inline では開かない（監査 M1）。
      "content-disposition": isInlineSafe(contentType)
        ? "inline"
        : "attachment",
      "x-content-type-options": "nosniff",
      "content-security-policy":
        "sandbox; default-src 'none'; img-src 'self' data:; object-src 'self'",
      // 図面は差し替えで URL が変わらないためキャッシュしない。
      "cache-control": "no-store",
    },
  });
}
