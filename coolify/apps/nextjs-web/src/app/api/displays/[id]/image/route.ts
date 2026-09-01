/**
 * ディスプレイに映す画像のアップロード API。
 *
 *   POST /api/displays/{id}/image  → 差し替え（multipart: file）
 *
 * Server Action ではなく Route Handler なのは、Server Action のリクエスト
 * ボディが既定 1MB 上限で、画像が自分のコードに届く前に 413 で落ちるため —
 * /api/avatars・/api/floor-maps/[mapId]/image と同じ方式に揃えている。
 * RBAC・検証・保存・監査・画面への合図は lib/display-image.ts。
 */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_DISPLAY_IMAGE_BYTES, saveDisplayImage } from "@/lib/display-image";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { ok: false, error: "対象の指定が不正です" },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "multipart/form-data で送信してください" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "画像ファイルを選択してください" },
      { status: 400 },
    );
  }
  // 巨大ファイルは保存処理に入る前に弾く。
  if (file.size > MAX_DISPLAY_IMAGE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "画像サイズは 10MB 以下にしてください" },
      { status: 413 },
    );
  }

  const result = await saveDisplayImage(id, file);
  if (!result.ok) return NextResponse.json(result, { status: 400 });

  revalidatePath("/settings/kiosk-devices");
  return NextResponse.json(result);
}
