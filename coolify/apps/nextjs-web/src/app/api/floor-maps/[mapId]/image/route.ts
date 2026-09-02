/**
 * フロアマップの図面画像アップロード API。
 *
 *   POST /api/floor-maps/{mapId}/image  → 差し替え（multipart: file）
 *
 * Server Action ではなく Route Handler なのは、Server Action のリクエスト
 * ボディが既定 1MB 上限で、図面（〜10MB）が自分のコードに届く前に 413 で
 * 落ちるため — /api/avatars・/api/attachments/upload と同じ方式に揃えている。
 * RBAC・検証・保存・監査は lib/floor-map-image.ts。
 */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { MAX_MAP_IMAGE_BYTES, saveFloorMapImage } from "@/lib/floor-map-image";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mapId: string }> },
): Promise<NextResponse> {
  const tr = await getTranslations();
  const { mapId } = await params;
  if (!uuidSchema.safeParse(mapId).success) {
    return NextResponse.json(
      { ok: false, error: tr("settings.kioskDevicesActions.invalidTarget") },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: tr("common.sendAsMultipartFormData") },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: tr("common.selectAnImageFile") },
      { status: 400 },
    );
  }
  // 巨大ファイルは保存処理に入る前に弾く。
  if (file.size > MAX_MAP_IMAGE_BYTES) {
    return NextResponse.json(
      { ok: false, error: tr("common.imageSizeMax10Mb") },
      { status: 413 },
    );
  }

  const result = await saveFloorMapImage(mapId, file);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  // 図面は端末管理・拠点マスタの両方に出る。
  revalidatePath("/settings/kiosk-devices");
  revalidatePath("/master/plants");
  return NextResponse.json(result);
}
