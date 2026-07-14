/**
 * GET /api/pdf/invoice?id=<INV-…>[&download=1][&force=1] — 請求書 PDF.
 *
 * Serves the stored PDF from SeaweedFS if present; otherwise renders it via
 * Gotenberg (src/pdf-templates/invoice.html), stores it, then streams it
 * back. `download=1` forces an attachment; default is inline. `force=1` skips
 * the stored copy and regenerates. Data comes from app.invoices via Prisma
 * (id = INV-YYYYMM-NNNNN).
 *
 * 明細の由来（出荷書 / 納品書番号）は「由来」列に併記する。合計は
 * 小計 / 消費税（10%）/ 合計金額（税込）の 3 行。
 */

import { fetchInvoice } from "@/app/(dashboard)/billing/invoices/data";
import { parseDocKey } from "@/lib/doc-number";
import { formatDate } from "@/lib/format";
import { renderPdf } from "@/lib/pdf";
import { getObject, putObject } from "@/lib/storage";

// Reads request query params → always rendered at request time.
export const dynamic = "force-dynamic";

const yen = (n: number) => n.toLocaleString("ja-JP");

// 発行元（CKK 本社）— delivery-note ルートの issuer ブロックと同一。
const ISSUER = {
  name: "シー・ケィ・ケー株式会社",
  address: "〒475-0823 愛知県半田市港町2丁目27番2",
  tel: "TEL: 0569-21-6187　FAX: 0569-23-6427",
  invoice_reg: "T1234567890123",
};

/** Build the response headers for serving the PDF (inline vs attachment). */
function pdfHeaders(invoiceNumber: string, download: boolean): HeadersInit {
  const disp = download ? "attachment" : "inline";
  return {
    "content-type": "application/pdf",
    "content-disposition": `${disp}; filename="${invoiceNumber}.pdf"`,
  };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const download = url.searchParams.get("download") === "1";
  const force = url.searchParams.get("force") === "1";
  if (!id) {
    return new Response('Missing "id" query parameter', { status: 400 });
  }

  const key = parseDocKey(id, "INV");
  const invoice = key ? await fetchInvoice(key) : null;
  if (!invoice) {
    return new Response(`Invoice not found: ${id}`, { status: 404 });
  }

  const storageKey = `pdfs/invoices/${invoice.invoiceNumber}.pdf`;

  // Serve the stored copy if it exists (SeaweedFS), else generate + store.
  // `force=1` regenerates and overwrites the stored copy.
  if (!force) {
    const cached = await getObject(storageKey);
    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: pdfHeaders(invoice.invoiceNumber, download),
      });
    }
  }

  // 宛先メタ: 支店 + ご担当者。
  const metaLines = [
    invoice.customerBranchName
      ? `${invoice.customerBranchName}　ご担当者 様`
      : "ご担当者 様",
  ];

  const data = {
    issuer: ISSUER,
    recipient: {
      name: invoice.customerName,
      meta: metaLines.join("<br>"),
    },
    doc: {
      number: invoice.invoiceNumber,
      issued_date: formatDate(invoice.issuedAt ?? invoice.createdAt),
      period: `${formatDate(invoice.billingPeriodFrom)} 〜 ${formatDate(invoice.billingPeriodTo)}`,
      due_date: formatDate(invoice.dueDate),
    },
    items: invoice.items.map((it) => ({
      name: it.description,
      quantity: yen(it.quantity),
      unit_price: yen(it.unitPrice),
      amount: yen(it.amount),
      provenance: [it.shippingOrderNumber, it.deliveryNoteNumber]
        .filter(Boolean)
        .join(" / "),
    })),
    totals: {
      subtotal: yen(invoice.subtotal),
      tax: yen(invoice.taxAmount),
      grand_total: yen(invoice.totalAmount),
    },
    notes: (invoice.notes ?? "").replace(/\n/g, "<br>"),
  };

  let pdf: ArrayBuffer;
  try {
    pdf = await renderPdf("invoice.html", data);
  } catch (err) {
    console.error("[pdf/invoice]", err);
    return new Response("PDF generation failed", { status: 502 });
  }

  // Persist to SeaweedFS for later view/download (best-effort; non-blocking on failure).
  if (!(await putObject(storageKey, pdf, "application/pdf"))) {
    console.warn(`[pdf/invoice] storage write failed for ${storageKey}`);
  }

  return new Response(pdf, {
    status: 200,
    headers: pdfHeaders(invoice.invoiceNumber, download),
  });
}
