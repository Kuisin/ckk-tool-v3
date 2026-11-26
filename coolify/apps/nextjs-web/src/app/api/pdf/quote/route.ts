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
import { docNo } from "@/lib/doc-number";
import { isIssued, notIssuedResponse, pdfStorageKey } from "@/lib/document-pdf";
import { documentFormatters } from "@/lib/format";
import { normalizeLocale } from "@/lib/i18n";
import { issuerForQuote, ownCompanyLogo } from "@/lib/own-companies";
import { multilineHtml, renderPdf } from "@/lib/pdf";
import {
  orderTypeLabelLocalized,
  pdfAttnLine,
  quoteLineNoteHtml,
  quoteLineToolHtml,
  quotePdfLabels,
  taxBaseSuffixLocalized,
  taxRowLabelLocalized,
} from "@/lib/pdf-labels";
import { documentQrSvg } from "@/lib/pdf-qr";
import { QR_KINDS } from "@/lib/qr-payload";
import { getObject, putObject } from "@/lib/storage";
import { docKeyFromRequest } from "../../doc-key";

// Reads request query params → always rendered at request time.
export const dynamic = "force-dynamic";

const yen = (n: number) => n.toLocaleString("ja-JP");

/** Build the response headers for serving a quote PDF (inline vs attachment). */
function pdfHeaders(quoteNumber: string, download: boolean): HeadersInit {
  const disp = download ? "attachment" : "inline";
  return {
    "content-type": "application/pdf",
    "content-disposition": `${disp}; filename="${docNo(quoteNumber)}.pdf"`,
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

  const key = await docKeyFromRequest("quotes", "QOT", id);
  const quote = key ? await fetchQuote(key) : null;
  if (!key || !quote) {
    return new Response(`Quote not found: ${id}`, { status: 404 });
  }
  // 閲覧は発行後のみ（下書きの見積書は PDF を出さない）。
  if (!isIssued(quote.status)) return notIssuedResponse("見積書"); // i18n-ignore

  // DTO の番号フィールドは id の姿（`CKK~…` — 法人まで運ぶ）。保管キーと
  // QR は id のまま（番号は法人ごとの連番で、番号だけでは別法人の書類と
  // 取り違える）。紙とファイル名に出すのは番号だけ。
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
  const labels = quotePdfLabels(lang, validUntilStr);
  // 税率ごとの区分記載（請求書と同じ形）。単一税率なら 1 行。
  const taxRows = totals.buckets.map((b) => ({
    label: taxRowLabelLocalized(b.taxRate, lang),
    base_suffix:
      totals.buckets.length > 1
        ? taxBaseSuffixLocalized(yen(b.taxableBase), lang)
        : "",
    tax: yen(b.taxAmount),
  }));

  // 発行元（自社法人 MS0I）= 見積書が持つ法人。見積書は拠点を持たないので、
  // 法人は作成時の「発行会社」で決まり、以後は変わらない（own_company_id）。
  const { issuer, company } = await issuerForQuote(key, lang);
  // 見出しのロゴもその法人のもの（他の法人の書類に CKK のマークを刷らない）。
  const logo = await ownCompanyLogo(company, lang);

  const data = {
    lang,
    labels,
    issuer,
    brand_logo: logo.html,
    recipient: {
      name: quote.customerName,
      contact: pdfAttnLine(lang, quote.customerBranchName),
      address: "",
    },
    // 書類 QR（CKK:QOT:<番号>）。URL は入れない。
    doc_qr: documentQrSvg(QR_KINDS.QUOTE, quote.quoteNumber),
    doc: {
      number: docNo(quote.quoteNumber),
      issued_date: documentFormatters.date(quote.createdAt),
      valid_until: validUntilStr,
      // 営業担当が未設定の見積は作成者を出す（従来の挙動へのフォールバック）。
      sales_rep: quote.salesRepName ?? quote.createdBy,
    },
    items: quote.items.map((it) => {
      // 値引きの注意書き + 明細の備考（受取先の言語）。空なら行を足さない。
      const note = quoteLineNoteHtml(it, yen(it.discountAmount), lang);
      return {
        row_class: note ? "has-line-note" : "",
        line_note_row: note
          ? `<tr class="line-note"><td colspan="6">${note}</td></tr>`
          : "",
        // 画面用の品名は「名称 コード」。帳票はコードを名称の下に別の行で刷るので、
        // そのまま渡すとコードが 2 回出る — 末尾のコードを落として名称だけにする。
        name:
          it.productCode && it.productName.endsWith(` ${it.productCode}`)
            ? it.productName.slice(0, -(it.productCode.length + 1))
            : it.productName,
        // 製品コード（PRD-YYYYMM-NNNN）。**採番前のレガシー品目は空欄で刷る** —
        // 以前ここは内部の連番 id を刷っていた（品目統合で本来の製品コードへ）。
        code: it.productCode ?? "",
        // 再研磨の明細: 研ぎ直す工具（売っているのは役務、研ぐのはこの工具）。
        tool_html: quoteLineToolHtml(it.toolLabel, lang),
        order_type: orderTypeLabelLocalized(it.orderType, lang),
        quantity: yen(it.quantity),
        unit_price: yen(it.unitPrice),
        amount: yen(it.amount),
        delivery_date: documentFormatters.date(it.deliveryDate),
      };
    }),
    tax_rows: taxRows,
    totals: {
      subtotal: yen(totals.subtotal),
      tax: yen(totals.tax),
      grand_total: yen(totals.grandTotal),
    },
    notes: multilineHtml(quote.notes),
  };

  let pdf: ArrayBuffer;
  try {
    pdf = await renderPdf("quote.html", data, { assets: logo.assets });
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
