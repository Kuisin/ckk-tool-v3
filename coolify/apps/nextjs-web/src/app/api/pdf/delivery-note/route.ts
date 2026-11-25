/**
 * GET /api/pdf/delivery-note?id=<DRN-…>[&download=1][&force=1] — 納品書 PDF.
 *
 * Serves the stored PDF from SeaweedFS if present; otherwise renders it via
 * Gotenberg (src/pdf-templates/delivery-note.html), stores it, then streams it
 * back. `download=1` forces an attachment; default is inline. `force=1` skips
 * the stored copy and regenerates. Data comes from app.delivery_notes via
 * Prisma (id = DRN-YYYYMM-NNNNN).
 *
 * 価格記載（include_price）が OFF のときは単価・金額列と合計ブロックを出さない
 * — テンプレートエンジンに条件分岐が無いため、列見出し・セル・合計を HTML
 * 断片としてルート側で組み立てて注入する（内部の信頼データのみ）。
 * DIRECT_TO_USER（ユーザー直送）は届け先（最終需要家）を宛先メタに表示する。
 */

import { fetchDeliveryNoteForDocument } from "@/app/(dashboard)/shipping/delivery-notes/data";
import { deliveryNoteTotals } from "@/components/shipping/delivery-notes/model";
import { requirePermissionResponse } from "@/lib/authz";
import { docNo } from "@/lib/doc-number";
import { isIssued, notIssuedResponse, pdfStorageKey } from "@/lib/document-pdf";
import { documentFormatters, escapeHtml } from "@/lib/format";
import { normalizeLocale } from "@/lib/i18n";
import { issuerForDeliveryNote } from "@/lib/own-companies";
import { multilineHtml, renderPdf } from "@/lib/pdf";
import {
  deliveryMethodLabelLocalized,
  deliveryNotePdfLabels,
  pdfAttnLine,
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

/** Build the response headers for serving the PDF (inline vs attachment). */
function pdfHeaders(deliveryNumber: string, download: boolean): HeadersInit {
  const disp = download ? "attachment" : "inline";
  return {
    "content-type": "application/pdf",
    "content-disposition": `${disp}; filename="${docNo(deliveryNumber)}.pdf"`,
  };
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requirePermissionResponse("delivery_note", "READ");
  if (denied) return denied;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const download = url.searchParams.get("download") === "1";
  const force = url.searchParams.get("force") === "1";
  if (!id) {
    return new Response('Missing "id" query parameter', { status: 400 });
  }

  const key = await docKeyFromRequest("delivery_notes", "DRN", id);
  const note = key ? await fetchDeliveryNoteForDocument(key) : null;
  if (!key || !note) {
    return new Response(`Delivery note not found: ${id}`, { status: 404 });
  }
  // 閲覧は発行後のみ（下書きの納品書は PDF を出さない）。
  if (!isIssued(note.status)) return notIssuedResponse("納品書"); // i18n-ignore

  // DTO の番号フィールドは id の姿（`CKK~…` — 法人まで運ぶ）。保管キーと
  // QR は id のまま（番号は法人ごとの連番で、番号だけでは別法人の書類と
  // 取り違える）。紙とファイル名に出すのは番号だけ。
  const storageKey = pdfStorageKey.deliveryNote(note.deliveryNumber);

  // Serve the stored copy if it exists (SeaweedFS), else generate + store.
  // `force=1` regenerates and overwrites the stored copy.
  if (!force) {
    const cached = await getObject(storageKey);
    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: pdfHeaders(note.deliveryNumber, download),
      });
    }
  }

  const lang = normalizeLocale(note.recipientDocumentLocale);
  const labels = deliveryNotePdfLabels(lang);
  // 画面（DeliveryNoteDetail）と同じ関数を通すので、PDF と画面で行の数も金額も一致する。
  const totals = deliveryNoteTotals(note);

  // 宛先メタ: 支店 + ご担当者、ユーザー直送は届け先（最終需要家）を明記する。
  const metaLines = [pdfAttnLine(lang, note.recipientBranchName)];
  if (note.deliveryMethod === "DIRECT_TO_USER" && note.endUserName) {
    metaLines.push(`${labels.endUserPrefix} ${note.endUserName}`);
  }

  // 発行元（自社法人 MS0I）— 出荷元拠点 → 明細の担当拠点 → 既定の法人。
  const { issuer } = await issuerForDeliveryNote(key, lang);

  // 価格記載（includePrice）に応じて 単価/金額 列・合計ブロックを注入する。
  const data = {
    lang,
    labels,
    issuer,
    recipient: {
      name: note.recipientName,
      meta: metaLines.map(escapeHtml).join("<br>"),
    },
    // 書類 QR（CKK:DRN:<番号>）。URL は入れない。
    doc_qr: documentQrSvg(QR_KINDS.DELIVERY_NOTE, note.deliveryNumber),
    doc: {
      number: docNo(note.deliveryNumber),
      issued_date: documentFormatters.date(note.createdAt),
      shipping_number: docNo(note.deliveryOrderNumber),
      method: deliveryMethodLabelLocalized(note.deliveryMethod, lang),
    },
    price_head: note.includePrice
      ? `<th class="right">${labels.unitPrice}</th><th class="right">${labels.amount}</th>`
      : "",
    items: note.items.map((it) => ({
      name: it.productName,
      // 製品コード（PRD-YYYYMM-NNNN）。**採番前のレガシー品目は空欄で刷る** —
      // 以前ここは内部の連番 id を刷っていた（品目統合で本来の製品コードへ）。
      code: it.productCode ?? "",
      quantity: yen(it.quantity),
      price_cells: note.includePrice
        ? `<td class="right">${yen(it.unitPrice ?? 0)}</td><td class="right">${yen(it.amount ?? 0)}</td>`
        : "",
      notes: it.notes ?? "",
    })),
    // 価格記載ありのときだけ合計ブロックを出す。中身は請求書と同じ区分記載
    // （小計 → 税率ごとの消費税 → 合計（税込））— 納品書に刷った金額と、後で
    // 届く請求書の金額が食い違ってはいけない。
    totals_block: totals
      ? `<div class="totals"><table>
           <tr><td>${labels.totalQuantity}</td><td>${yen(note.totalQuantity)}</td></tr>
           <tr><td>${labels.subtotal}</td><td>¥ ${yen(totals.subtotal)}</td></tr>
           ${totals.buckets
             .map(
               (b) =>
                 `<tr><td>${escapeHtml(taxRowLabelLocalized(b.taxRate, lang))}${
                   totals.buckets.length > 1
                     ? escapeHtml(
                         taxBaseSuffixLocalized(yen(b.taxableBase), lang),
                       )
                     : ""
                 }</td><td>¥ ${yen(b.taxAmount)}</td></tr>`,
             )
             .join("")}
           <tr class="grand-total"><td>${labels.grandTotalTaxIncl}</td><td>¥ ${yen(totals.totalAmountInclTax)}</td></tr>
         </table></div>`
      : "",
    notes: multilineHtml(note.notes),
  };

  let pdf: ArrayBuffer;
  try {
    pdf = await renderPdf("delivery-note.html", data);
  } catch (err) {
    console.error("[pdf/delivery-note]", err);
    return new Response("PDF generation failed", { status: 502 });
  }

  // Persist to SeaweedFS for later view/download (best-effort; non-blocking on failure).
  if (!(await putObject(storageKey, pdf, "application/pdf"))) {
    console.warn(`[pdf/delivery-note] storage write failed for ${storageKey}`);
  }

  return new Response(pdf, {
    status: 200,
    headers: pdfHeaders(note.deliveryNumber, download),
  });
}
