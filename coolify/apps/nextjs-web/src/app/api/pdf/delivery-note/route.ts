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

import { fetchDeliveryNote } from "@/app/(dashboard)/shipping/delivery-notes/data";
import { requirePermissionResponse } from "@/lib/authz";
import { parseDocKey } from "@/lib/doc-number";
import { isIssued, notIssuedResponse, pdfStorageKey } from "@/lib/document-pdf";
import { documentFormatters } from "@/lib/format";
import { normalizeLocale } from "@/lib/i18n";
import { renderPdf } from "@/lib/pdf";
import {
  deliveryMethodLabelLocalized,
  deliveryNotePdfLabels,
  pdfAttnLine,
} from "@/lib/pdf-labels";
import { documentQrSvg } from "@/lib/pdf-qr";
import { QR_KINDS } from "@/lib/qr-payload";
import { getObject, putObject } from "@/lib/storage";

// Reads request query params → always rendered at request time.
export const dynamic = "force-dynamic";

const yen = (n: number) => n.toLocaleString("ja-JP");

// 発行元（CKK 本社）— quote ルートの issuer ブロックと同一。
const ISSUER = {
  name: "シー・ケィ・ケー株式会社",
  address: "〒475-0823 愛知県半田市港町2丁目27番2",
  tel: "TEL: 0569-21-6187　FAX: 0569-23-6427",
  invoice_reg: "T1234567890123",
};

/** Build the response headers for serving the PDF (inline vs attachment). */
function pdfHeaders(deliveryNumber: string, download: boolean): HeadersInit {
  const disp = download ? "attachment" : "inline";
  return {
    "content-type": "application/pdf",
    "content-disposition": `${disp}; filename="${deliveryNumber}.pdf"`,
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

  const key = parseDocKey(id, "DRN");
  const note = key ? await fetchDeliveryNote(key) : null;
  if (!note) {
    return new Response(`Delivery note not found: ${id}`, { status: 404 });
  }
  // 閲覧は発行後のみ（下書きの納品書は PDF を出さない）。
  if (!isIssued(note.status)) return notIssuedResponse("納品書");

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

  // 宛先メタ: 支店 + ご担当者、ユーザー直送は届け先（最終需要家）を明記する。
  const metaLines = [pdfAttnLine(lang, note.recipientBranchName)];
  if (note.deliveryMethod === "DIRECT_TO_USER" && note.endUserName) {
    metaLines.push(`${labels.endUserPrefix} ${note.endUserName}`);
  }

  // 価格記載（includePrice）に応じて 単価/金額 列・合計ブロックを注入する。
  const data = {
    lang,
    labels,
    issuer: ISSUER,
    recipient: {
      name: note.recipientName,
      meta: metaLines.join("<br>"),
    },
    // 書類 QR（CKK:DRN:<番号>）。URL は入れない。
    doc_qr: documentQrSvg(QR_KINDS.DELIVERY_NOTE, note.deliveryNumber),
    doc: {
      number: note.deliveryNumber,
      issued_date: documentFormatters.date(note.createdAt),
      shipping_number: note.deliveryOrderNumber,
      method: deliveryMethodLabelLocalized(note.deliveryMethod, lang),
    },
    price_head: note.includePrice
      ? `<th class="right">${labels.unitPrice}</th><th class="right">${labels.amount}</th>`
      : "",
    items: note.items.map((it) => ({
      name: it.productName,
      code: it.productId,
      quantity: yen(it.quantity),
      price_cells: note.includePrice
        ? `<td class="right">${yen(it.unitPrice ?? 0)}</td><td class="right">${yen(it.amount ?? 0)}</td>`
        : "",
      notes: it.notes ?? "",
    })),
    totals_block: note.includePrice
      ? `<div class="totals"><table>
           <tr><td>${labels.totalQuantity}</td><td>${yen(note.totalQuantity)}</td></tr>
           <tr class="grand-total"><td>${labels.total}</td><td>¥ ${yen(note.totalAmount ?? 0)}</td></tr>
         </table></div>`
      : "",
    notes: (note.notes ?? "").replace(/\n/g, "<br>"),
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
