/**
 * POST /api/attachments/upload — 証憑アップロード（multipart/form-data）。
 *
 * フィールド: ownerType（許可テーブルのみ）/ ownerId（業務キー）/
 * label（任意）/ file。検証・保存・監査は lib/attachments.saveAttachment。
 * 応答: { ok: true, id } | { ok: false, error }（400）。
 */

import { NextResponse } from "next/server";
import { MAX_ATTACHMENT_BYTES, saveAttachment } from "@/lib/attachments";

export const dynamic = "force-dynamic";

/** 添付を受け付ける owner テーブルの許可リスト。 */
const ALLOWED_OWNER_TYPES = new Set([
  "material_purchase_orders",
  "material_receipts",
  "order_acceptances",
  "design_requests",
]);

function badRequest(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("multipart/form-data で送信してください");
  }

  const ownerType = String(form.get("ownerType") ?? "").trim();
  const ownerId = String(form.get("ownerId") ?? "").trim();
  const labelRaw = form.get("label");
  const file = form.get("file");

  if (!ALLOWED_OWNER_TYPES.has(ownerType)) {
    return badRequest("この種類のレコードには添付できません");
  }
  if (!ownerId) return badRequest("添付対象が指定されていません");
  if (!(file instanceof File)) {
    return badRequest("ファイルが指定されていません");
  }
  // 巨大ファイルはバッファリング前に弾く。
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return badRequest("ファイルサイズは 20MB 以下にしてください");
  }

  const result = await saveAttachment({
    ownerType,
    ownerId,
    label: typeof labelRaw === "string" ? labelRaw : null,
    file: {
      name: file.name,
      type: file.type,
      bytes: await file.arrayBuffer(),
    },
  });
  if (!result.ok) return badRequest(result.error);
  return NextResponse.json({ ok: true, id: result.data.id });
}
