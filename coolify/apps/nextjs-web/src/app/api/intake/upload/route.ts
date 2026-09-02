/**
 * POST /api/intake/upload — 注文請書の優先取込（multipart: file[, defer]）。
 *
 * 画面の「優先取込」から呼ばれ、**保存 + IMPORT 行の採番までを同期実行**して
 * すぐ返す（数百 ms）。重い抽出（po-extract、1 件 約30〜60秒）は
 * lib/intake の待ち行列へ積み、バックグラウンドで 1 件ずつ流す —
 * 利用者はボタンが戻ってすぐ次のファイルを投げられる。
 *
 * `defer=1` を付けると**採番までで止める**（抽出は積まない）。画面は選んだ
 * ファイルをまずこの形で全部送り、一覧に全行が並んでから
 * POST /api/intake/queue でまとめて抽出を積む — 先に送った 1 枚の抽出だけが
 * 走って、残りがまだ一覧に無い、という見え方を避けるため。
 *
 * 応答: { ok: true, number, status: "IMPORT", queued, pending }
 * （pending = 抽出待ち件数。defer 時は queued: false で pending は付かない）。
 * 抽出の成否は一覧の状態（IMPORT → DRAFT / 抽出失敗バッジ）で確認する。
 * 入力不正は { ok: false, error }（400）。
 */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requirePermissionResponse } from "@/lib/authz";
import { ingestAndQueueExtraction, ingestIntakeFile } from "@/lib/intake";

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
  const tr = await getTranslations();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest(tr("common.sendAsMultipartFormData"));
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return badRequest(tr("settings.orderIntake.fileNotSpecified"));
  }
  if (file.size <= 0) return badRequest(tr("common.fileIsEmpty"));
  if (file.size > MAX_BYTES) {
    return badRequest(tr("common.fileSizeMax20Mb"));
  }
  const ext = file.name.includes(".")
    ? (file.name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const contentType = MIME_BY_EXT[ext];
  if (!contentType) {
    return badRequest(tr("settings.orderIntake.unsupportedFileFormat"));
  }

  // 抽出を積まず採番までで返すか（画面のまとめ取込の 1 段目）。
  const defer = form.get("defer");
  const deferExtraction = defer === "1" || defer === "true";

  try {
    const input = {
      filename: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType,
      source: "UPLOAD" as const,
    };
    if (deferExtraction) {
      const ingested = await ingestIntakeFile(input);
      revalidatePath("/sales/order-acceptances");
      return NextResponse.json({
        ok: true,
        number: ingested.number,
        // 一覧には並ぶが抽出はまだ — 呼び出し側が /api/intake/queue で積む。
        status: "IMPORT",
        queued: false,
      });
    }
    const result = await ingestAndQueueExtraction(input);
    revalidatePath("/sales/order-acceptances");
    return NextResponse.json({
      ok: true,
      number: result.number,
      // 抽出はこれから走る — 行はまず IMPORT（取込中）で見える。
      status: "IMPORT",
      queued: true,
      pending: result.pending,
    });
  } catch (e) {
    console.error("[intake/upload]", e);
    return NextResponse.json(
      { ok: false, error: tr("settings.orderIntake.intakeProcessingFailed") },
      { status: 500 },
    );
  }
}
