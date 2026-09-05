/**
 * POST /api/extract/material-delivery — 素材の納品書を po-extract に読ませ、
 * **突合済みの素材入荷の下書き**を返す（/api/extract/material-order の入荷版）。
 *
 * 納品書は「何が何本届いたか」の記録なので、金額欄は読まない。返すのは行の
 * 集まりで、どの行を登録するかは画面（/purchase/material-receipts/intake）で
 * 人が決める。
 */

import { getTranslations } from "next-intl/server";
import { validateFile } from "@/lib/attachments";
import { requirePermissionResponse } from "@/lib/authz";
import {
  extractMaterialDelivery,
  PurchaseExtractError,
} from "@/lib/purchase-intake";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 読ませてよい原本 — PDF と画像だけ（抽出器が扱えるのはこれだけ）。 */
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export async function POST(request: Request): Promise<Response> {
  // 入荷を登録する操作の一部 — material_receipt:CREATE でゲートする。
  const denied = await requirePermissionResponse("material_receipt", "CREATE");
  if (denied) return denied;

  const tr = await getTranslations();
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { error: tr("purchase.intake.fileRequired") },
      { status: 400 },
    );
  }

  const checked = validateFile(file.name, file.type, file.size, tr);
  if (!checked.ok) {
    return Response.json({ error: checked.error }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(checked.contentType)) {
    return Response.json(
      { error: tr("purchase.intake.unsupportedFileType") },
      { status: 400 },
    );
  }

  try {
    return Response.json({ draft: await extractMaterialDelivery(file) });
  } catch (err) {
    if (err instanceof PurchaseExtractError) {
      return Response.json({ error: err.failure }, { status: 502 });
    }
    console.error("[extract/material-delivery]", err);
    return Response.json(
      {
        error: {
          summary: tr("purchase.intake.extractFailed"),
          retryable: true,
        },
      },
      { status: 502 },
    );
  }
}
