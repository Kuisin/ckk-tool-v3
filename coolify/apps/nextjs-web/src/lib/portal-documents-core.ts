/**
 * portal-documents-core.ts — 社外へ出す書類の種別と表示ラベル（純粋・client-safe）。
 *
 * portal-documents.ts は `server-only` なので、クライアント部品から値を
 * import できない（型だけなら可）。ラベルと種別はどちらからも要るので
 * ここに置く。
 */

/**
 * 社外に出す書類の種別。
 *
 * **出荷書（delivery_orders）は含めない** — work_order 経由で工程と外注先に
 * 2 ジョインで届いてしまう。社外に出す書類ではない。
 */
export const PORTAL_DOCUMENT_TYPES = [
  "quotes",
  "order_acceptances",
  "delivery_notes",
  "invoices",
] as const;

export type PortalDocumentType = (typeof PORTAL_DOCUMENT_TYPES)[number];

export function isPortalDocumentType(v: string): v is PortalDocumentType {
  return (PORTAL_DOCUMENT_TYPES as readonly string[]).includes(v);
}

/**
 * 社外に見せてよい状態（portal-documents.ts の一覧・単件判定と、書類詳細の
 * 「ポータル共有」の表示可否が同じ定義を見る）。
 *
 * 見積書は DRAFT（下書き）・期限切れは出さない。EXPIRED は保存しない派生状態
 * （components/sales/quotes/model.ts quoteDisplayStatus）なので、期限は
 * 呼び出し側が validUntil で見る。
 */
export const VISIBLE_QUOTE_STATUS = ["ISSUED"] as const;
/** 注文請書は「確定して先へ進んだもの」だけ。IMPORT / DRAFT は取込の途中。 */
export const VISIBLE_ACCEPTANCE_STATUS = [
  "APPROVED",
  "COMPLETED",
  "ARCHIVED",
] as const;
/** 納品書・請求書は発行済み以降。 */
export const VISIBLE_DELIVERY_NOTE_STATUS = ["ISSUED", "DELIVERED"] as const;
export const VISIBLE_INVOICE_STATUS = ["ISSUED", "SENT", "PAID"] as const;

const VISIBLE_STATUS: Record<PortalDocumentType, readonly string[]> = {
  quotes: VISIBLE_QUOTE_STATUS,
  order_acceptances: VISIBLE_ACCEPTANCE_STATUS,
  delivery_notes: VISIBLE_DELIVERY_NOTE_STATUS,
  invoices: VISIBLE_INVOICE_STATUS,
};

/**
 * その状態の書類を社外へ見せてよいか。リンクを発行しても開けない書類
 * （下書きなど）に「ポータル共有」を出さないために使う。見積書の期限切れは
 * 状態ではないので、ここでは判定しない。
 */
export function isPortalVisibleStatus(
  type: PortalDocumentType,
  status: string,
): boolean {
  return VISIBLE_STATUS[type].includes(status);
}

/** next-intl の `t()` と互換の最小の形（サーバー/クライアントどちらの実体も渡せる）。 */
type TrLike = (key: string) => string;

const PORTAL_DOCUMENT_LABEL_KEY: Record<PortalDocumentType, string> = {
  quotes: "common.quote",
  order_acceptances: "common.orderAcceptance",
  delivery_notes: "common.deliveryNote",
  invoices: "common.invoice",
};

export function portalDocumentLabel(
  type: PortalDocumentType,
  tr: TrLike,
): string {
  return tr(PORTAL_DOCUMENT_LABEL_KEY[type]);
}

/** 書類番号のプレフィクス（doc-number.ts の DocPrefix に対応）。 */
export const PORTAL_DOCUMENT_PREFIX: Record<
  PortalDocumentType,
  "QOT" | "ORD" | "DRN" | "INV"
> = {
  quotes: "QOT",
  order_acceptances: "ORD",
  delivery_notes: "DRN",
  invoices: "INV",
};
