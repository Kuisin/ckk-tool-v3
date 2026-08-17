/**
 * POST /api/intake/upload — 受注請書の優先取込（multipart: file）。
 *
 * 画面の「優先取込」から呼ばれ、**保存 + IMPORT 行の採番までを同期実行**して
 * すぐ返す（数百 ms）。重い抽出（po-extract、1 件 約30〜60秒）は
 * lib/intake の待ち行列へ積み、バックグラウンドで 1 件ずつ流す —
 * 利用者はボタンが戻ってすぐ次のファイルを投げられる。
 *
 * 応答: { ok: true, number, status: "IMPORT", pending }（pending = 抽出待ち件数）。
 * 抽出の成否は一覧の状態（IMPORT → DRAFT / 抽出失敗バッジ）で確認する。
 * 入力不正は { ok: false, error }（400）。
 */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requirePermissionResponse } from "@/lib/authz";
import { ingestAndQueueExtraction } from "@/lib/intake";

export const dynamic = "force-dynamic";
// 保存 + 採番のみなので短い。抽出はレスポンス後のキューで動く。
export const maxDuration = 60;

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
    const result = await ingestAndQueueExtraction({
      filename: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType,
      source: "UPLOAD",
    });
    revalidatePath("/sales/order-acceptances");
    return NextResponse.json({
      ok: true,
      number: result.number,
      // 抽出はこれから走る — 行はまず IMPORT（取込中）で見える。
      status: "IMPORT",
      pending: result.pending,
    });
  } catch (e) {
    console.error("[intake/upload]", e);
    return NextResponse.json(
      { ok: false, error: "取込処理に失敗しました" },
      { status: 500 },
    );
  }
}
