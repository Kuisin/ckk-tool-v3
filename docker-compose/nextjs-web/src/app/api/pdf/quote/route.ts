/**
 * GET /api/pdf/quote?id=<quoteId> — 見積書 PDF (design-preview `quote.html`).
 *
 * Loads the quote (mock for now), maps it to the template data shape, renders
 * the price-table line items, and streams the Gotenberg-generated PDF back.
 * Replace `getQuote` with a server/Prisma fetch later.
 */

import {
  getQuote,
  orderTypeLabel,
  quoteTotals,
} from "@/components/sales/quotes/mock";
import { formatDate } from "@/lib/format";
import { renderPdf } from "@/lib/pdf";

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

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return new Response('Missing "id" query parameter', { status: 400 });
  }

  const quote = getQuote(id);
  if (!quote) {
    return new Response(`Quote not found: ${id}`, { status: 404 });
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

  return new Response(pdf, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${quote.quoteNumber}.pdf"`,
    },
  });
}
