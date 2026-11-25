import "server-only";

/**
 * document-pdf.ts — 業務文書 PDF の保管キーと「発行済みか」の判定（server-only）。
 *
 * 生成 PDF は SeaweedFS に `pdfs/<種別>/<法人コード>/<文書番号>.pdf` で保管する。
 * キー生成をここに集約し、API ルート（生成・配信）と詳細ページ（PDF タブの
 * メタ表示）が同じ 1 箇所を参照する。
 *
 * **保管キーには法人コードを入れる** — 書類番号は自社法人ごとの連番なので
 * （番号設計 PR-C）、番号だけのキーでは 2 つの法人の同じ番号の PDF が同じ
 * オブジェクトを上書きし合う。取引先へ渡す**ファイル名**は番号だけのまま
 * （法人コードは社内の区別で、相手に見せるものではない）。
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
import { docRef, parseDocId } from "./doc-ref-core";
import { label } from "./messages";

/**
 * 書類の id → 保管キーの中の `<法人コード>/<文書番号>`。
 *
 * 受けるのは画面の DTO が持つ id（`CKK~QOT-2026-00001`）か参照
 * （`CKK/QOT-2026-00001`）。法人コードの無い番号だけを渡されたときは番号だけの
 * キーになる（番号設計 PR-C より前の置き場所と同じ形）— 呼び出し側は id を
 * 渡すこと。
 */
export function docStoragePath(id: string): string {
  const { companyCode, number } = parseDocId(id);
  // `<法人コード>/<番号>` = 参照（doc_ref）と同じ文字列。
  return companyCode ? docRef(companyCode, number) : number;
}

/** 生成 PDF の保管キー（種別 → 書類の id → key）。引数は id の姿で渡す。 */
export const pdfStorageKey = {
  quote: (quoteId: string) => `pdfs/quotes/${docStoragePath(quoteId)}.pdf`,
  invoice: (invoiceId: string) =>
    `pdfs/invoices/${docStoragePath(invoiceId)}.pdf`,
  deliveryNote: (deliveryNoteId: string) =>
    `pdfs/delivery-notes/${docStoragePath(deliveryNoteId)}.pdf`,
  designRequest: (requestId: string) =>
    `pdfs/design-requests/${docStoragePath(requestId)}.pdf`,
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
