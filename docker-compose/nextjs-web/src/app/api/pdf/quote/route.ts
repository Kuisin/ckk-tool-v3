/**
 * GET /api/pdf/quote?id=<quoteId>[&download=1][&force=1] — 見積書 PDF.
 *
 * Serves the stored PDF from SeaweedFS if present; otherwise renders it via
 * Gotenberg (design-preview `quote.html`), stores it, then streams it back.
 * `download=1` forces an attachment; default is inline (in-browser view).
 * `force=1` skips the stored copy and regenerates (PDF タブの「再生成」).
 * Quote data comes from sales.quotes via Prisma (id = QOT-YYYYMM-NNNNN).
 */

import { fetchQuote } from "@/app/(dashboard)/sales/quotes/data";
import { orderTypeLabel, quoteTotals } from "@/components/sales/quotes/model";
import { requirePermissionResponse } from "@/lib/authz";
import { parseDocKey } from "@/lib/doc-number";
import { formatDate } from "@/lib/format";
import { renderPdf } from "@/lib/pdf";
import { getObject, putObject } from "@/lib/storage";

// Reads request query params → always rendered at request time.
export const dynamic = "force-dynamic";

const yen = (n: number) => n.toLocaleString("ja-JP");

// 発行元（CKK 本社）— design-preview の issuer ブロックに対応。
const ISSUER = {
  name: "シー・ケィ・ケー株式会社",
  address: "〒475-0823 愛知県半田市港町2丁目27番2",
  tel: "TEL: 0569-21-6187　FAX: 0569-23-6427",
  invoice_reg: "T1234567890123",
};

/** Build the response headers for serving a quote PDF (inline vs attachment). */
function pdfHeaders(quoteNumber: string, download: boolean): HeadersInit {
  const disp = download ? "attachment" : "inline";
  return {
    "content-type": "application/pdf",
    "content-disposition": `${disp}; filename="${quoteNumber}.pdf"`,
  };
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requirePermissionResponse("quote", "READ");
  if (denied) return denied;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const download = url.searchParams.get("download") === "1";
  const force = url.searchParams.get("force") === "1";
  if (!id) {
    return new Response('Missing "id" query parameter', { status: 400 });
  }

  const key = parseDocKey(id, "QOT");
  const quote = key ? await fetchQuote(key) : null;
  if (!quote) {
    return new Response(`Quote not found: ${id}`, { status: 404 });
  }

  const storageKey = `pdfs/quotes/${quote.quoteNumber}.pdf`;

  // Serve the stored copy if it exists (SeaweedFS), else generate + store.
  // `force=1` regenerates and overwrites the stored copy.
  if (!force) {
    const cached = await getObject(storageKey);
    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: pdfHeaders(quote.quoteNumber, download),
      });
    }
  }

  const totals = quoteTotals(quote);
  const data = {
    issuer: ISSUER,
    recipient: {
      name: quote.customerName,
      contact: quote.customerBranchName
        ? `${quote.customerBranchName}　ご担当者 様`
        : "ご担当者 様",
      address: "",
    },
    doc: {
      number: quote.quoteNumber,
      issued_date: formatDate(quote.createdAt),
      valid_until: formatDate(quote.validUntil),
      sales_rep: quote.createdBy,
    },
    items: quote.items.map((it) => ({
      name: it.productName,
      code: it.productId,
      order_type: orderTypeLabel(it.orderType),
      quantity: yen(it.quantity),
      unit_price: yen(it.unitPrice),
      amount: yen(it.amount),
      delivery_date: formatDate(it.deliveryDate),
    })),
    totals: {
      subtotal: yen(totals.subtotal),
      tax: yen(totals.tax),
      grand_total: yen(totals.grandTotal),
    },
    notes: (quote.notes ?? "").replace(/\n/g, "<br>"),
  };

  let pdf: ArrayBuffer;
  try {
    pdf = await renderPdf("quote.html", data);
  } catch (err) {
    console.error("[pdf/quote]", err);
    return new Response("PDF generation failed", { status: 502 });
  }

  // Persist to SeaweedFS for later view/download (best-effort; non-blocking on failure).
  if (!(await putObject(storageKey, pdf, "application/pdf"))) {
    console.warn(`[pdf/quote] storage write failed for ${storageKey}`);
  }

  return new Response(pdf, {
    status: 200,
    headers: pdfHeaders(quote.quoteNumber, download),
  });
}
