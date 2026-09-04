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
import { quoteTotals } from "@/components/sales/quotes/model";
import { requirePermissionResponse } from "@/lib/authz";
import { parseDocKey } from "@/lib/doc-number";
import { isIssued, notIssuedResponse, pdfStorageKey } from "@/lib/document-pdf";
import { documentFormatters } from "@/lib/format";
import { normalizeLocale } from "@/lib/i18n";
import { multilineHtml, renderPdf } from "@/lib/pdf";
import {
  orderTypeLabelLocalized,
  pdfAttnLine,
  quotePdfLabels,
  taxLabelLocalized,
} from "@/lib/pdf-labels";
import { documentQrSvg } from "@/lib/pdf-qr";
import { QR_KINDS } from "@/lib/qr-payload";
import { getObject, putObject } from "@/lib/storage";

// Reads request query params → always rendered at request time.
export const dynamic = "force-dynamic";

const yen = (n: number) => n.toLocaleString("ja-JP");

// 発行元（CKK 本社）— design-preview の issuer ブロックに対応。
const ISSUER = {
  name: "シー・ケィ・ケー株式会社", // i18n-ignore
  address: "〒475-0823 愛知県半田市港町2丁目27番2", // i18n-ignore
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
  // 閲覧は発行後のみ（下書きの見積書は PDF を出さない）。
  if (!isIssued(quote.status)) return notIssuedResponse("見積書"); // i18n-ignore

  const storageKey = pdfStorageKey.quote(quote.quoteNumber);

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
  // 受取先（顧客の支店 → 顧客本体の順）の言語。未設定は既定言語 ja
  // （_specs/i18n-glossary.md §2.7・決定 10 — 閲覧者の表示設定ではない）。
  const lang = normalizeLocale(quote.recipientDocumentLocale);
  const validUntilStr = documentFormatters.date(quote.validUntil);
  const labels = {
    ...quotePdfLabels(lang, validUntilStr),
    // 消費税の見出しは顧客の課税区分で変わる（請求書と同じ taxLabelLocalized）。
    tax: taxLabelLocalized(quote.customerTaxType, lang),
  };

  const data = {
    lang,
    labels,
    issuer: ISSUER,
    recipient: {
      name: quote.customerName,
      contact: pdfAttnLine(lang, quote.customerBranchName),
      address: "",
    },
    // 書類 QR（CKK:QOT:<番号>）。URL は入れない。
    doc_qr: documentQrSvg(QR_KINDS.QUOTE, quote.quoteNumber),
    doc: {
      number: quote.quoteNumber,
      issued_date: documentFormatters.date(quote.createdAt),
      valid_until: validUntilStr,
      // 営業担当が未設定の見積は作成者を出す（従来の挙動へのフォールバック）。
      sales_rep: quote.salesRepName ?? quote.createdBy,
    },
    items: quote.items.map((it) => ({
      name: it.productName,
      code: it.productId,
      order_type: orderTypeLabelLocalized(it.orderType, lang),
      quantity: yen(it.quantity),
      unit_price: yen(it.unitPrice),
      amount: yen(it.amount),
      delivery_date: documentFormatters.date(it.deliveryDate),
    })),
    totals: {
      subtotal: yen(totals.subtotal),
      tax: yen(totals.tax),
      grand_total: yen(totals.grandTotal),
    },
    notes: multilineHtml(quote.notes),
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
