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
