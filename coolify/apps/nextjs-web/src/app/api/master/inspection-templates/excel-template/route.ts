/**
 * GET /api/master/inspection-templates/excel-template
 *   → Excel 取込の**雛形**（見出しだけ + 記入例 1 行）を配る。
 *
 * これが無いと、Excel 取込は「どの列に何を書くのか」を当てる作業になる。
 * 見出しの定義は lib/inspection-template-io.ts の EXCEL_COLUMNS が唯一の正で、
 * 雛形も取込の解釈も同じものを見る（片方だけ変わると噛み合わなくなる）。
 */

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { checkPermission } from "@/lib/authz";
import {
  EXCEL_COLUMNS,
  ITEM_TYPE_LABELS,
  LAYOUT_STYLE_LABELS,
  RECORD_STYLE_LABELS,
  SAMPLE_NAMING_LABELS,
  SAMPLING_LABELS,
  SECTION_LABELS,
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
  layoutStyle: LAYOUT_STYLE_LABELS.DIMENSIONAL,
  sampleNaming: SAMPLE_NAMING_LABELS.GENERIC,
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
  section: SECTION_LABELS.MEASUREMENT,
  department: "",
  measurementEquipment: "LE",
  nominalValue: "8.00",
  toleranceTopDelta: "0.02",
  toleranceBottomDelta: "0.02",
};

export async function GET(): Promise<NextResponse | Response> {
  const authz = await checkPermission("master", "READ");
  if (!authz.ok) {
    return NextResponse.json(
      { ok: false, error: authz.error },
      { status: 403 },
    );
  }
  const tr = await getTranslations();

  const buf = buildXlsx({
    // シートのタブ名は取込側（lib/inspection-template-io.ts）が見ておらず
    // 最初のシートを読むだけなので、ここだけは訳してよい（列見出し・記入例の
    // 値は取込のブール判定（「はい」/「いいえ」）と結び付いているため対象外）。
    name: tr("master.inspectionTemplateExcel.sheetName"),
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
