/**
 * GET /api/pdf/inspection-sheet?templateId=<id>[&workOrder=<num>][&download=1]
 * — 検査表の**空欄シート** PDF（現場メモ用）。
 *
 * テンプレートの項目（種別・合格基準・目標・抜取）と空欄の実測値セルを印刷する。
 * `workOrder` 指定時はその指示書番号を印字し、ロット数量（予定数量）から
 * 抜取の要求サンプル数 = セル数を計算する。
 * オンデマンド生成（SeaweedFS には保存しない — 帳票番号を持たない補助票のため）。
 * 権限: workOrder あり = work_order READ / なし = master READ。
 */

import { requirePermissionResponse } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  BLANK_LINE,
  blankSheetItems,
  sheetTemplateHead,
} from "@/lib/inspection-sheet-pdf";
import { renderPdf } from "@/lib/pdf";

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

  const pdf = await renderPdf("inspection-sheet.html", {
    template: sheetTemplateHead(template),
    meta: {
      work_order: workOrderNumber != null ? `#${workOrderNumber}` : BLANK_LINE,
      lot_quantity: lotQuantity != null ? `${lotQuantity} 本` : BLANK_LINE,
      inspected_at: BLANK_LINE,
      recorded_by: BLANK_LINE,
      approved: BLANK_LINE,
    },
    items: blankSheetItems(template.items, lotQuantity),
    overall: { judgement: "合格 ・ 不合格" },
    footer_note:
      "* は必須項目。抜取の欄数はロット数量からの要求サンプル数（上限 10 欄）。",
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
