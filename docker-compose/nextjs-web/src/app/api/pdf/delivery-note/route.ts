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
import { parseDocKey } from "@/lib/doc-number";
import { DELIVERY_METHOD_LABEL } from "@/lib/enum-labels";
import { formatDate } from "@/lib/format";
import { renderPdf } from "@/lib/pdf";
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

  const storageKey = `pdfs/delivery-notes/${note.deliveryNumber}.pdf`;

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

  // 宛先メタ: 支店 + ご担当者、ユーザー直送は届け先（最終需要家）を明記する。
  const metaLines = [
    note.recipientBranchName
      ? `${note.recipientBranchName}　ご担当者 様`
      : "ご担当者 様",
  ];
  if (note.deliveryMethod === "DIRECT_TO_USER" && note.endUserName) {
    metaLines.push(`届け先（最終需要家）: ${note.endUserName}`);
  }

  // 価格記載（includePrice）に応じて 単価/金額 列・合計ブロックを注入する。
  const data = {
    issuer: ISSUER,
    recipient: {
      name: note.recipientName,
      meta: metaLines.join("<br>"),
    },
    doc: {
      number: note.deliveryNumber,
      issued_date: formatDate(note.createdAt),
      shipping_number: note.shippingOrderNumber,
      method: DELIVERY_METHOD_LABEL[note.deliveryMethod] ?? note.deliveryMethod,
    },
    price_head: note.includePrice
      ? '<th class="right">単価 (円)</th><th class="right">金額 (円)</th>'
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
           <tr><td>数量合計</td><td>${yen(note.totalQuantity)}</td></tr>
           <tr class="grand-total"><td>合計金額</td><td>¥ ${yen(note.totalAmount ?? 0)}</td></tr>
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
