/**
 * POST /api/intake/upload — 受注請書の優先取込（multipart: file）。
 *
 * 画面の「優先取込」から 1 ファイルずつ呼ばれ、lib/intake.ingestAndExtract
 * （保存 → IMPORT 行採番 → po-extract 抽出 → 突合 → DRAFT + 明細）を同期
 * 実行する。抽出は 1 件あたり約 30〜60 秒 — クライアントは逐次呼び出す。
 * 応答: { ok: true, number, status, error? }（抽出失敗でも行は作成される —
 * status: "IMPORT" + error）。入力不正は { ok: false, error }（400）。
 */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requirePermissionResponse } from "@/lib/authz";
import { ingestAndExtract } from "@/lib/intake";

export const dynamic = "force-dynamic";
// 抽出 ~48s/doc + 余裕（po-extract 側タイムアウト 180s に合わせる）。
export const maxDuration = 300;

/** 受け付ける拡張子 → 保存用 MIME（lib/intake の許可リストと同一）。 */
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** 最大ファイルサイズ（20MB — 添付と同じ上限）。 */
const MAX_BYTES = 20 * 1024 * 1024;

function badRequest(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requirePermissionResponse("order_acceptance", "CREATE");
  if (denied) return denied;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("multipart/form-data で送信してください");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return badRequest("ファイルが指定されていません");
  }
  if (file.size <= 0) return badRequest("ファイルが空です");
  if (file.size > MAX_BYTES) {
    return badRequest("ファイルサイズは 20MB 以下にしてください");
  }
  const ext = file.name.includes(".")
    ? (file.name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const contentType = MIME_BY_EXT[ext];
  if (!contentType) {
    return badRequest(
      "対応していないファイル形式です（PDF / PNG / JPG / WEBP）",
    );
  }

  try {
    const result = await ingestAndExtract({
      filename: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType,
      source: "UPLOAD",
    });
    revalidatePath("/sales/order-acceptances");
    return NextResponse.json({
      ok: true,
      number: result.number,
      status: result.status,
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (e) {
    console.error("[intake/upload]", e);
    return NextResponse.json(
      { ok: false, error: "取込処理に失敗しました" },
      { status: 500 },
    );
  }
}
