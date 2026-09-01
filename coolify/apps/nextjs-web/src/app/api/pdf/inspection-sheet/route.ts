/**
 * GET /api/pdf/inspection-sheet?templateId=<id>[&workOrder=<num>][&download=1]
 * — 検査表の**空欄シート** PDF（現場メモ用）。
 *
 * テンプレートの項目（種別・合格基準・目標・抜取）と空欄の実測値セルを印刷する。
 * `workOrder` 指定時はその指示書番号を印字し、ロット数量（予定数量）から
 * 抜取の要求サンプル数 = セル数を計算する。work_order_final_inspections が
 * あれば末尾に最終検査・出荷前確認の欄も付ける（無ければ空欄のまま）。
 * オンデマンド生成（SeaweedFS には保存しない — 帳票番号を持たない補助票のため）。
 * 権限: workOrder あり = work_order READ / なし = master READ。
 */

import { requirePermissionResponse } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { fetchFinalInspectionPdfData } from "@/lib/final-inspection-data";
import {
  BLANK_LINE,
  blankSheetItems,
  blankValueColumns,
  countsTableHtml,
  dimensionalGridHtml,
  equipmentLegendNote,
  esc,
  finalInspectionSectionHtml,
  shapeSectionHtml,
  sheetTemplateHead,
} from "@/lib/inspection-sheet-pdf";
import { renderPdf } from "@/lib/pdf";
import { documentQrSvg } from "@/lib/pdf-qr";
import { QR_KINDS } from "@/lib/qr-payload";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const templateId = Number(url.searchParams.get("templateId"));
  const workOrderParam = url.searchParams.get("workOrder");
  const workOrderNumber = workOrderParam ? Number(workOrderParam) : null;
  const download = url.searchParams.get("download") === "1";
  if (!Number.isInteger(templateId)) {
    return new Response('Missing "templateId" query parameter', {
      status: 400,
    });
  }
  if (workOrderParam != null && !Number.isInteger(workOrderNumber)) {
    return new Response('Invalid "workOrder" query parameter', {
      status: 400,
    });
  }

  const denied = await requirePermissionResponse(
    workOrderNumber != null ? "work_order" : "master",
    "READ",
  );
  if (denied) return denied;

  const template = await prisma.inspectionTemplate.findUnique({
    where: { id: templateId },
    include: {
      relatedProcessStep: true,
      items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
    },
  });
  if (!template) {
    return new Response(`Template not found: ${templateId}`, { status: 404 });
  }

  const wo =
    workOrderNumber != null
      ? await prisma.workOrder.findUnique({
          where: { workOrderNumber },
          select: { plannedQuantity: true },
        })
      : null;
  if (workOrderNumber != null && !wo) {
    return new Response(`Work order not found: ${workOrderNumber}`, {
      status: 404,
    });
  }
  const lotQuantity = wo?.plannedQuantity ?? null;

  const samplingSpec = {
    samplingMode: template.samplingMode,
    samplingValue:
      template.samplingValue == null ? null : Number(template.samplingValue),
  };

  let grid_html = "";
  let counts_table_html = "";
  let overflowNote = "";
  if (template.recordStyle === "COUNTS") {
    counts_table_html = countsTableHtml(blankSheetItems(template.items));
  } else {
    const { columns, overflowNote: note } = blankValueColumns(
      template.items,
      samplingSpec,
      lotQuantity,
      template.sampleNaming,
    );
    grid_html = dimensionalGridHtml(template.items, columns);
    overflowNote = note;
  }

  const finalInspection =
    workOrderNumber != null
      ? await fetchFinalInspectionPdfData(workOrderNumber)
      : null;

  const pdf = await renderPdf("inspection-sheet.html", {
    // 検査表は指示書に属する紙なので QR は指示書番号（CKK:WO:<番号>）。
    // 指示書の無い白紙（マスタ印刷）では空 = QR を描かない。
    doc_qr: documentQrSvg(QR_KINDS.WO, workOrderNumber),
    template: sheetTemplateHead(template, lotQuantity),
    meta: {
      work_order: workOrderNumber != null ? `#${workOrderNumber}` : BLANK_LINE,
      lot_quantity: lotQuantity != null ? `${lotQuantity} 本` : BLANK_LINE,
      inspected_at: BLANK_LINE,
      recorded_by: BLANK_LINE,
      confirmed: BLANK_LINE,
      produced_by: BLANK_LINE,
      approved: BLANK_LINE,
    },
    grid_html,
    counts_table_html,
    shape_html: shapeSectionHtml(template.items),
    overall: { judgement: "合格 ・ 不合格" },
    footer_note:
      esc(
        `* は必須項目。抜取の欄数はロット数量からの要求サンプル数（上限 10 欄）。${overflowNote}`,
      ) + equipmentLegendNote(template.items),
    final_inspection_html: finalInspectionSectionHtml(finalInspection),
  });

  const filename = `inspection-${template.code}-v${template.version}.pdf`;
  return new Response(pdf, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    },
  });
}
