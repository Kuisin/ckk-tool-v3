/**
 * GET /api/pdf/inspection-record?id=<recordUuid>[&download=1]
 * — 検査記録の**記入済みシート** PDF（結果確認用）。
 *
 * 記録した実測値（サンプルごと）・項目合否・総合判定・記録/承認メタを、
 * 記録時に使用したテンプレートバージョンの定義とともに印刷する。
 * オンデマンド生成（SeaweedFS には保存しない）。権限: work_order READ。
 */

import { requirePermissionResponse } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { documentFormatters } from "@/lib/format";
import {
  esc,
  filledSheetItems,
  sheetTemplateHead,
} from "@/lib/inspection-sheet-pdf";
import { renderPdf } from "@/lib/pdf";
import { documentQrSvg } from "@/lib/pdf-qr";
import { QR_KINDS } from "@/lib/qr-payload";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "未実施",
  PASS: "合格",
  FAIL: "不合格",
  APPROVED: "合格（承認済）",
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

  // 記録者・承認者の表示名
  const userIds = [record.recordedBy, record.approvedBy].filter(
    (v): v is string => v != null,
  );
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

  const pdf = await renderPdf("inspection-sheet.html", {
    // 検査表は指示書に属する紙なので QR は指示書番号（CKK:WO:<番号>）。
    doc_qr: documentQrSvg(QR_KINDS.WO, record.step.workOrder.workOrderNumber),
    template: sheetTemplateHead(record.template, lotQuantity),
    meta: {
      work_order: `#${record.step.workOrder.workOrderNumber}`,
      lot_quantity: `${lotQuantity} 本`,
      inspected_at: record.recordedAt
        ? esc(documentFormatters.dateTime(record.recordedAt.toISOString()))
        : "—",
      recorded_by: esc(nameOf(record.recordedBy)),
      approved: record.approvedAt
        ? esc(
            `${nameOf(record.approvedBy)}（${documentFormatters.dateTime(record.approvedAt.toISOString())}）`,
          )
        : "—",
    },
    items: filledSheetItems(record.items),
    overall: { judgement: STATUS_LABEL[record.status] ?? record.status },
    footer_note: "* は必須項目。実測値はサンプルごとの記録値。",
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
