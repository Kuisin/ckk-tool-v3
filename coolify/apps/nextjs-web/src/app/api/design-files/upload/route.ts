/**
 * POST /api/design-files/upload — 設計図の版を 1 つ手で足す（multipart/form-data）。
 *
 * 設計図 (PD06) の唯一の登録口。設計依頼から出た版も、依頼を経ない版
 * （図面だけ先に出来ている・既存図面を取り込む）も同じここを通る。
 * designRequestId を渡さなければ design_request_id = null になり、
 * 一覧では「手動」と出る。
 *
 * フィールド:
 *   productId       … 対象製品（必須）
 *   customerBpId  … 受注元（任意。空 = 汎用）
 *   designRequestId … 成果物とする設計依頼の uuid（任意。空 = 手動登録）
 *   notes         … 版のメモ（任意）
 *   blueprint     … 図面データ 1 枚（必須）
 *   preview       … プレビュー用 0..1 枚（任意）
 *   reference     … 参考資料 0..N 枚（同名で複数）
 *   referenceNote … 参考資料の説明（reference と**同じ順**で並べる）
 *
 * **Server Action ではなく Route Handler なのは、Server Action のボディが
 * 1MB で頭打ちになるから**（app CLAUDE.md）。図面は普通に超える。
 */

import { NextResponse } from "next/server";
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { requirePermissionResponse } from "@/lib/authz";
import { uploadDesignVersion } from "@/lib/design-files";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function badRequest(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

async function toBytes(f: File) {
  return { name: f.name, type: f.type, bytes: await f.arrayBuffer() };
}

export async function POST(request: Request): Promise<NextResponse> {
  // 図面そのものの権限。設計依頼 (design_request) とは別コード — 依頼を
  // 出す人と図面を描く人は同じではない。
  const deny = await requirePermissionResponse("design_file", "CREATE");
  if (deny) return deny as NextResponse;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("multipart/form-data で送信してください");
  }

  const productId = Number(form.get("productId"));
  if (!Number.isInteger(productId) || productId <= 0) {
    return badRequest("対象の製品が指定されていません");
  }

  const bpRaw = String(form.get("customerBpId") ?? "").trim();
  if (bpRaw && !UUID_RE.test(bpRaw)) {
    return badRequest("受注元の指定が不正です");
  }

  const requestRaw = String(form.get("designRequestId") ?? "").trim();
  if (requestRaw && !UUID_RE.test(requestRaw)) {
    return badRequest("設計依頼の指定が不正です");
  }

  const blueprint = form.get("blueprint");
  if (!(blueprint instanceof File) || blueprint.size === 0) {
    return badRequest("図面データを選択してください");
  }

  const previewRaw = form.get("preview");
  const preview =
    previewRaw instanceof File && previewRaw.size > 0 ? previewRaw : null;
  // 参考資料は「ファイルの配列」と「説明の配列」を同じ順で受ける。
  // 説明が足りない/多いぶんは無視する（順ズレしても落とさない）。
  const referenceNotes = form.getAll("referenceNote").map(String);
  const references = form
    .getAll("reference")
    .filter((f): f is File => f instanceof File && f.size > 0);

  // 巨大ファイルはバッファリング前に弾く。
  for (const f of [blueprint, ...(preview ? [preview] : []), ...references]) {
    if (f.size > MAX_ATTACHMENT_BYTES) {
      return badRequest(`${f.name} が大きすぎます（1 件 20MB まで）`);
    }
  }

  const result = await uploadDesignVersion({
    productId,
    customerBpId: bpRaw || null,
    designRequestId: requestRaw || null,
    notes: String(form.get("notes") ?? "").trim() || null,
    blueprint: await toBytes(blueprint),
    preview: preview ? await toBytes(preview) : null,
    references: await Promise.all(
      references.map(async (f, i) => ({
        ...(await toBytes(f)),
        note: referenceNotes[i]?.trim() || null,
      })),
    ),
  });
  if (!result.ok) return badRequest(result.error);
  return NextResponse.json({ ok: true, version: result.data.version });
}
