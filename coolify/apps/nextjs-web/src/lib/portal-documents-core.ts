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

export const PORTAL_DOCUMENT_LABEL: Record<PortalDocumentType, string> = {
  quotes: "見積書",
  order_acceptances: "注文請書",
  delivery_notes: "納品書",
  invoices: "請求書",
};

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
