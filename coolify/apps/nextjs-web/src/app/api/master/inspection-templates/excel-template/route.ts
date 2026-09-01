/**
 * GET /api/master/inspection-templates/excel-template
 *   → Excel 取込の**雛形**（見出しだけ + 記入例 1 行）を配る。
 *
 * これが無いと、Excel 取込は「どの列に何を書くのか」を当てる作業になる。
 * 見出しの定義は lib/inspection-template-io.ts の EXCEL_COLUMNS が唯一の正で、
 * 雛形も取込の解釈も同じものを見る（片方だけ変わると噛み合わなくなる）。
 */

import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/authz";
import {
  EXCEL_COLUMNS,
  ITEM_TYPE_LABELS,
  RECORD_STYLE_LABELS,
  SAMPLING_LABELS,
} from "@/lib/inspection-template-io";
import { buildXlsx, cellText } from "@/lib/xlsx";

export const dynamic = "force-dynamic";

/** 記入例。**そのまま取り込める行**にしておく（書き方の説明を読ませない）。 */
const EXAMPLE: Record<string, string> = {
  code: "INS-EXAMPLE",
  name: "記入例：外観検査",
  processStepCode: "",
  samplingMode: SAMPLING_LABELS.ALL,
  samplingValue: "",
  recordStyle: RECORD_STYLE_LABELS.VALUES,
  itemName: "外径",
  inputType: ITEM_TYPE_LABELS.NUMBER,
  unit: "mm",
  toleranceMin: "7.98",
  toleranceMax: "8.02",
  options: "",
  acceptOptions: "",
  acceptBool: "",
  goalValue: "8.00",
  isRequired: "はい",
  allowManualOverride: "はい",
};

export async function GET(): Promise<NextResponse | Response> {
  const authz = await checkPermission("master", "READ");
  if (!authz.ok) {
    return NextResponse.json(
      { ok: false, error: authz.error },
      { status: 403 },
    );
  }

  const buf = buildXlsx({
    name: "検査表",
    columns: EXCEL_COLUMNS.map((c) => ({ header: c.header, width: c.width })),
    rows: [EXCEL_COLUMNS.map((c) => cellText(EXAMPLE[c.key] ?? ""))],
  });

  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition":
        'attachment; filename="inspection-templates-template.xlsx"',
      "cache-control": "no-store",
    },
  });
}
