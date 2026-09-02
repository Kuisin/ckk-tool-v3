/**
 * GET /api/pdf/inspection-record?id=<recordUuid>[&download=1]
 * — 検査記録の**記入済みシート** PDF（結果確認用）。
 *
 * 記録した実測値（サンプルごと）・項目合否・総合判定・記録/検査表確認/
 * 検収メタを、記録時に使用したテンプレートバージョンの定義とともに印刷する。
 * 製作者は record が紐づく工程ステップの completedBy（新規フィールドを
 * 持たず既存データを読むだけ）。work_order_final_inspections があれば末尾に
 * 最終検査・出荷前確認の欄も付ける。
 * オンデマンド生成（SeaweedFS には保存しない）。権限: work_order READ。
 */

import { requirePermissionResponse } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { fetchFinalInspectionPdfData } from "@/lib/final-inspection-data";
import { documentFormatters } from "@/lib/format";
import {
  formatSampleValue,
  itemSpecFromRow,
  parseStoredSamples,
} from "@/lib/inspection-core";
import {
  countsTableHtml,
  dimensionalGridHtml,
  equipmentLegendNote,
  esc,
  filledSheetItems,
  filledValueColumns,
  finalInspectionSectionHtml,
  shapeSectionHtml,
  sheetTemplateHead,
  templateImageHtml,
} from "@/lib/inspection-sheet-pdf";
import { templateImageDataUri } from "@/lib/inspection-template-image";
import { label } from "@/lib/messages";
import { renderPdf } from "@/lib/pdf";
import { documentQrSvg } from "@/lib/pdf-qr";
import { QR_KINDS } from "@/lib/qr-payload";

export const dynamic = "force-dynamic";

/**
 * この検査記録シートは取引先向けではなく社内の品質記録（`_specs/i18n-glossary.md`
 * §2.7 の「受取先の言語で出す」対象は見積書/納品書/請求書の 3 帳票だけ）。
 * `documentFormatters` と同じ理由（開いた人によって内容が変わってはいけない）
 * で ja 固定にする — `lib/messages.ts` の locale 明示 API を使う。
 */
const STATUS_LABEL: Record<string, string> = {
  PENDING: label("enum.INSPECTION_STATUS_LABEL.PENDING", "ja", "未実施"),
  PASS: label("enum.INSPECTION_STATUS_LABEL.PASS", "ja", "合格"),
  FAIL: label("enum.INSPECTION_STATUS_LABEL.FAIL", "ja", "不合格"),
  APPROVED: label(
    "pdf.inspectionRecord.approvedStatus",
    "ja",
    "合格（承認済）",
  ),
};

export async function GET(request: Request): Promise<Response> {
  const denied = await requirePermissionResponse("work_order", "READ");
  if (denied) return denied;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const download = url.searchParams.get("download") === "1";
  if (!id) {
    return new Response('Missing "id" query parameter', { status: 400 });
  }

  const record = await prisma.inspectionRecord.findUnique({
    where: { id },
    include: {
      template: { include: { relatedProcessStep: true } },
      step: {
        select: {
          inputQuantity: true,
          completedBy: true,
          workOrder: {
            select: { workOrderNumber: true, plannedQuantity: true },
          },
        },
      },
      items: {
        include: { templateItem: true },
        orderBy: { templateItem: { sortOrder: "asc" } },
      },
    },
  });
  if (!record) {
    return new Response(`Inspection record not found: ${id}`, { status: 404 });
  }

  // 記録者・検査表確認者・検収者・製作者（工程完了者）の表示名
  const userIds = [
    record.recordedBy,
    record.approvedBy,
    record.confirmedBy,
    record.step.completedBy,
  ].filter((v): v is string => v != null);
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameOf = (uid: string | null) =>
    uid ? (users.find((u) => u.id === uid)?.displayName ?? "—") : "—";

  const lotQuantity =
    record.step.inputQuantity ?? record.step.workOrder.plannedQuantity;

  let grid_html = "";
  let counts_table_html = "";
  const items = record.items.map((it) => it.templateItem);
  if (record.template.recordStyle === "COUNTS") {
    counts_table_html = countsTableHtml(filledSheetItems(record.items));
  } else {
    const columns = filledValueColumns(
      record.items,
      items,
      record.template.sampleNaming,
    );
    grid_html = dimensionalGridHtml(items, columns);
  }

  // 形状（section=SHAPE）項目の記録値
  const shapeValues = new Map<number, string>();
  for (const it of record.items) {
    if (it.templateItem.section !== "SHAPE") continue;
    const spec = itemSpecFromRow(it.templateItem);
    const samples = parseStoredSamples(it.measuredValues);
    const value =
      samples[0] ?? (it.measuredValue != null ? it.measuredValue : null);
    if (value != null) {
      shapeValues.set(it.templateItem.id, formatSampleValue(spec, value));
    }
  }

  const finalInspection = await fetchFinalInspectionPdfData(
    record.step.workOrder.workOrderNumber,
  );

  const image = await templateImageDataUri(record.template.imageFileId);

  const pdf = await renderPdf("inspection-sheet.html", {
    // 検査表は指示書に属する紙なので QR は指示書番号（CKK:WO:<番号>）。
    doc_qr: documentQrSvg(QR_KINDS.WO, record.step.workOrder.workOrderNumber),
    template: sheetTemplateHead(record.template, lotQuantity),
    meta: {
      work_order: `#${record.step.workOrder.workOrderNumber}`,
      lot_quantity: label(
        "pdf.inspectionRecord.lotQuantity",
        "ja",
        "{quantity} 本",
        {
          quantity: lotQuantity,
        },
      ),
      inspected_at: record.recordedAt
        ? esc(documentFormatters.dateTime(record.recordedAt.toISOString()))
        : "—",
      recorded_by: esc(nameOf(record.recordedBy)),
      confirmed: record.confirmedAt
        ? esc(
            `${nameOf(record.confirmedBy)}（${documentFormatters.dateTime(record.confirmedAt.toISOString())}）`,
          )
        : "—",
      produced_by: esc(nameOf(record.step.completedBy)),
      approved: record.approvedAt
        ? esc(
            `${nameOf(record.approvedBy)}（${documentFormatters.dateTime(record.approvedAt.toISOString())}）`,
          )
        : "—",
    },
    template_image_html: templateImageHtml(
      image?.dataUri ?? null,
      image?.filename ?? null,
    ),
    grid_html,
    counts_table_html,
    shape_html: shapeSectionHtml(items, shapeValues),
    overall: { judgement: STATUS_LABEL[record.status] ?? record.status },
    footer_note:
      esc(
        label(
          "pdf.inspectionRecord.footerNote",
          "ja",
          "* は必須項目。実測値はサンプルごとの記録値。",
        ),
      ) + equipmentLegendNote(items),
    final_inspection_html: finalInspectionSectionHtml(finalInspection),
  });

  const filename = `inspection-record-${record.step.workOrder.workOrderNumber}-${record.template.code}.pdf`;
  return new Response(pdf, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    },
  });
}
