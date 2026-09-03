import "server-only";

/**
 * document-pdf.ts — 業務文書 PDF の保管キーと「発行済みか」の判定（server-only）。
 *
 * 生成 PDF は SeaweedFS に `pdfs/<種別>/<文書番号>.pdf` で保管する。キー生成を
 * ここに集約し、API ルート（生成・配信）と詳細ページ（PDF タブのメタ表示）が
 * 同じ 1 箇所を参照する。
 *
 * **閲覧は発行後のみ** — 下書き（DRAFT）の PDF は生成も閲覧もできない
 * （`isIssued`）。API ルートは 403 を返し、UI は PDF タブ / PDF ボタンを
 * 出さない。文書ごとの「発行済み」定義は下記のとおり:
 *   見積書 QUOTE          … DRAFT 以外（ISSUED。EXPIRED は保存しない派生状態）
 *   請求書 INVOICE        … ISSUED / SENT / PAID
 *   納品書 DELIVERY_NOTE  … ISSUED / DELIVERED
 * いずれも「DRAFT でなければ発行済み」で一致するため判定は共通。
 *
 * **設計依頼書はこの `isIssued` を使えない** — 状態が承認軸と作業軸に分かれて
 * いて、DRAFT 以外でも REQUESTED / REJECTED / CANCELLED は「まだ発行前」だから。
 * 判定は components/sales/design-requests/model.ts の `isIssuedDesign`。
 */

import type { PdfFileMeta } from "@/components/ui/PdfAttachmentPanel";
import { statObject } from "@/lib/storage";
import { label } from "./messages";

/** 生成 PDF の保管キー（種別 → 文書番号 → key）。 */
export const pdfStorageKey = {
  quote: (quoteNumber: string) => `pdfs/quotes/${quoteNumber}.pdf`,
  invoice: (invoiceNumber: string) => `pdfs/invoices/${invoiceNumber}.pdf`,
  deliveryNote: (deliveryNumber: string) =>
    `pdfs/delivery-notes/${deliveryNumber}.pdf`,
  designRequest: (requestNumber: string) =>
    `pdfs/design-requests/${requestNumber}.pdf`,
};

/** 発行済み（= PDF を閲覧してよい）か。下書きのみ不可。 */
export function isIssued(status: string): boolean {
  return status !== "DRAFT";
}

/**
 * 未発行文書への PDF アクセスを断る 403 レスポンス。
 * `docType` は呼び出し元がそのまま渡す書類名（"見積書" 等 — 呼び出し元の
 * route ハンドラは本ウェーブの対象外のため、文言はここで ja 固定にする。
 * 誰が開いても同じ文章になる、他の PDF ルートの決まり事に合わせている）。
 */
export function notIssuedResponse(docType: string): Response {
  return new Response(
    label(
      "api.documentPdf.notIssuedYet",
      "ja",
      "発行前の{docType}は PDF を閲覧できません", // i18n-ignore
      { docType },
    ),
    { status: 403 },
  );
}

/**
 * 保管済み PDF のメタ（サイズ・生成日時）。未生成なら null — その場合でも
 * 発行済みならプレビュー URL への初回アクセスで生成されるので、UI は
 * プレビュー自体は表示する。
 */
export async function storedPdfMeta(key: string): Promise<PdfFileMeta | null> {
  const stat = await statObject(key);
  if (!stat) return null;
  return { sizeBytes: stat.size, generatedAt: stat.mtime };
}
