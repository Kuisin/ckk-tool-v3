/**
 * GET /api/forms/<code>/responses/export?status=&from=&to=&fields= — 回答を Excel で。
 *
 * 絞り込みの規約は lib/form-export-core.ts（画面と共有）。読み出しと権限は
 * lib/form-export.ts。ここは HTTP の作法だけを持つ。
 *
 * Server Action ではなく Route Handler なのは、`Content-Disposition` を返す
 * 必要があるのと、Server Action のレスポンスに 1MB の上限があるため
 * （定義の書き出し /api/forms/[code]/export と同じ理由）。
 */

import { NextResponse } from "next/server";
import { statusLabel } from "@/components/ui/StatusBadge";
import { recordAudit } from "@/lib/audit";
import { requirePermissionResponse, sessionUserId } from "@/lib/authz";
import {
  answerCells,
  exportDownloadName,
  loadFormExport,
} from "@/lib/form-export";
import {
  FIXED_EXPORT_COLUMNS,
  parseExportFilter,
} from "@/lib/form-export-core";
import { getCurrentPreferences } from "@/lib/user-preferences";
import {
  buildXlsx,
  cellDateTime,
  cellNumber,
  cellText,
  type XlsxCell,
} from "@/lib/xlsx";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  // 書き出しは EXPORT。閲覧できる人がみな持ち出せるわけではない。
  const denied = await requirePermissionResponse("form", "EXPORT");
  if (denied) return denied;

  const { code } = await params;
  const filter = parseExportFilter(new URL(request.url).searchParams);
  const viewerId = await sessionUserId();

  const data = await loadFormExport(code, filter, viewerId);
  // 「無い」と「共有されていない」を区別しない（コードの総当たりを防ぐ）。
  if (!data) return new NextResponse("Not found", { status: 404 });

  const { form, fields, responses, hasMore } = data;

  // 日時は利用者の表示設定の地域で読む（Excel にタイムゾーンは無い）。
  const prefs = await getCurrentPreferences();
  const timeZone = prefs.timeZone || "Asia/Tokyo";

  // 匿名フォームでは回答者の列ごと落とす（空欄を残すと「誰か居るのに空」に見える）。
  const showRespondent = form.respondentVisibility === "SHOWN";
  const fixed = FIXED_EXPORT_COLUMNS.filter(
    (c) => showRespondent || c !== "回答者",
  );

  const columns = [
    ...fixed.map((header) => ({ header })),
    ...fields.map((f) => ({ header: f.label.ja || f.label.en || f.key })),
  ];

  const rows: XlsxCell[][] = responses.map((r) => {
    const head: XlsxCell[] = [
      cellNumber(r.recordNo),
      cellText(r.responseNumber),
      cellText(statusLabel("FormResponse", r.status)),
      ...(showRespondent ? [cellText(r.respondent)] : []),
      cellDateTime(r.submittedAt),
    ];
    const body = answerCells(r, fields).map((cell) =>
      // 数値項目は数値のまま入れる — 文字列だと Excel で合計も並べ替えもできない。
      cell.number != null ? cellNumber(cell.number) : cellText(cell.text),
    );
    return [...head, ...body];
  });

  const xlsx = buildXlsx({ name: form.title, columns, rows }, { timeZone });

  // 誰がいつ何件持ち出したかは残す（個人の回答を含むファイルなので）。
  await recordAudit({
    action: "EXPORT",
    tableName: "forms",
    recordId: form.code,
    after: {
      note: `回答を Excel で書き出し（${responses.length} 件${hasMore ? "・上限で打ち切り" : ""}）`,
    },
  }).catch(() => {});

  // 打ち切ったことはファイル名で伝える。表の中に注記の行を混ぜるとデータが
  // 汚れ、応答ヘッダは通常のダウンロードでは読めない。名前なら保存時に必ず目に入る。
  const filename = exportDownloadName(
    form.title,
    hasMore ? `${form.code}_一部` : form.code,
    "xlsx",
  );
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // ASCII の控えと RFC 5987 の両方を出す（日本語名は filename* でしか渡せない）。
      "content-disposition": `attachment; filename="form-${form.code}-responses.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
}
