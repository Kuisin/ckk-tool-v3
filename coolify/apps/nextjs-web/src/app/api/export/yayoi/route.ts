/**
 * GET /api/export/yayoi?invoice=<INV-…> — 弥生会計 Next 仕訳 CSV エクスポート.
 *
 * 請求書 1 件 → 仕訳 CSV（lib/csv-export.ts buildYayoiCsv、UTF-8 with BOM）を
 * attachment で返す。仕訳日付は発行日。**下書き（DRAFT）は出さない**（金額が
 * 確定していない仕訳を会計へ渡さない — 409）。
 * エクスポート成功時に invoices.yayoi_exported_at を刻み、audit_logs へ
 * EXPORT 相当の UPDATE を記録する（recordId = INV 番号）。**既にエクスポート
 * 済みなら `force=1` を付けない限り 409**（二重取込の防止 — §9）。
 */

import { fetchInvoice } from "@/app/(dashboard)/billing/invoices/data";
import { recordAudit } from "@/lib/audit";
import { requirePermissionResponse } from "@/lib/authz";
import { buildYayoiCsv } from "@/lib/csv-export";
import { prisma } from "@/lib/db";
import { parseDocKey } from "@/lib/doc-number";

// Reads request query params → always rendered at request time.
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requirePermissionResponse("billing_closing", "EXPORT");
  if (denied) return denied;
  const url = new URL(request.url);
  const id = url.searchParams.get("invoice");
  if (!id) {
    return new Response('Missing "invoice" query parameter', { status: 400 });
  }

  const key = parseDocKey(id, "INV");
  const invoice = key ? await fetchInvoice(key) : null;
  if (!key || !invoice) {
    return new Response(`Invoice not found: ${id}`, { status: 404 });
  }

  if (invoice.status === "DRAFT" || !invoice.issuedAt) {
    return new Response(`Invoice ${id} is a draft; issue it before export`, {
      status: 409,
    });
  }
  if (invoice.yayoiExportedAt && url.searchParams.get("force") !== "1") {
    return new Response(
      `Invoice ${id} was already exported at ${invoice.yayoiExportedAt}; add force=1 to export again`,
      { status: 409 },
    );
  }

  const csv = buildYayoiCsv({
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName,
    // 仕訳日付 = 発行日（下書きは上で弾いている）。
    date: invoice.issuedAt,
    totalAmount: invoice.totalAmount,
    taxAmount: invoice.taxAmount,
  });

  // エクスポート日時を刻む（best-effort — 失敗してもダウンロードは返す）。
  const exportedAt = new Date();
  try {
    await prisma.invoice.update({
      where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
      data: { yayoiExportedAt: exportedAt },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "invoices",
      recordId: invoice.invoiceNumber,
      before: { yayoiExportedAt: invoice.yayoiExportedAt },
      after: { yayoiExportedAt: exportedAt.toISOString() },
    });
  } catch (e) {
    console.error("[export/yayoi] failed to stamp yayoiExportedAt", e);
  }

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${invoice.invoiceNumber}_yayoi.csv"`,
    },
  });
}
