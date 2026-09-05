/**
 * POST /api/extract/material-order — 仕入先の見積書 / 注文請書 / 発注書控えを
 * po-extract に読ませ、**突合済みの素材発注書の下書き**を返す。
 *
 * 注文請書側（/api/extract/order-request）は抽出器の生 JSON をそのまま返して
 * いるが、こちらは仕入先と素材の突合まで済ませて返す — 突合には DB（取引先・
 * 素材マスタ・学習した表記）が要るので、ブラウザには持ち込めない。
 *
 * どのモデルが動くかはリクエストごとに SY0E の設定で決まる（`X-AI-Config`。
 * ヘッダ無し = ローカル ollama の既定）。OCR は常にローカル。
 */

import { getTranslations } from "next-intl/server";
import { validateFile } from "@/lib/attachments";
import { requirePermissionResponse } from "@/lib/authz";
import {
  extractMaterialOrder,
  PurchaseExtractError,
} from "@/lib/purchase-intake";

// 3 段パイプライン（OCR + vision + LLM）で 25〜60 秒。キャッシュしない。
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
  // 素材発注書の下書きを作る操作 — purchase_order:CREATE でゲートする。
  const denied = await requirePermissionResponse("purchase_order", "CREATE");
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

  // 大きさ（20MB）は添付と同じ規則を共有する。形式はここで絞る — 抽出器は
  // PDF と画像しか読めないので、Excel を投げられても待たせるだけ無駄になる。
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
    return Response.json({ draft: await extractMaterialOrder(file) });
  } catch (err) {
    if (err instanceof PurchaseExtractError) {
      // 分類済み（原因・対処・再試行の可否）をそのまま画面へ渡す。
      return Response.json({ error: err.failure }, { status: 502 });
    }
    console.error("[extract/material-order]", err);
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
