/**
 * api-resources.ts — `/api/v1` が公開する資源の登録簿（純粋）。
 *
 * ここが**唯一の真実**で、OpenAPI 文書（`/api/v1/openapi.json`）はここから
 * 組み立てる。手書きの文書は必ず実装から離れていくので、両方を書かない。
 *
 * `api-resources.test.ts` が **実ファイル（src/app/api/v1/**）との一致**を
 * 機械で確かめる — 口を足して登録簿に書き忘れる、あるいはその逆を止める。
 */

/** 一覧の口 1 つ。 */
export interface ApiResource {
  /** `/api/v1` からの相対パス。 */
  path: string;
  /** 必要な権限コード（アクションは常に READ）。 */
  permission: string;
  /** 並び順・差分同期の基準列。 */
  orderField: "updatedAt" | "createdAt";
  /** カーソルの決着キー。 */
  tiebreak: "id" | "doc";
  /** 何が返るか（英語 — 機械向けの文書なので翻訳しない）。 */
  summary: string;
  /** 行スコープの説明（英語）。 */
  scope: string;
}

export const API_RESOURCES: readonly ApiResource[] = [
  {
    path: "/order-acceptances",
    permission: "order_acceptance",
    orderField: "updatedAt",
    tiebreak: "doc",
    summary:
      "Order acceptances (注文請書). Totals are derived from the lines, not stored.",
    scope: "Creator (OWN) when the grant is scoped.",
  },
  {
    path: "/order-lines",
    permission: "order_acceptance",
    orderField: "updatedAt",
    tiebreak: "id",
    summary:
      "Order lines (注文明細). The execution unit; created via the acceptance.",
    scope: "Inherited from the parent acceptance's creator.",
  },
  {
    path: "/work-orders",
    permission: "work_order",
    orderField: "updatedAt",
    tiebreak: "id",
    summary: "Work orders (指示書). Pass ?steps=1 to embed the process steps.",
    scope: "Plant of any step, or creator.",
  },
  {
    path: "/quotes",
    permission: "quote",
    orderField: "updatedAt",
    tiebreak: "doc",
    summary:
      "Quotes (見積書). EXPIRED is not stored — derive it from status ISSUED plus validUntil.",
    scope: "Creator (OWN) only; quotes have no path to a plant.",
  },
  {
    path: "/delivery-orders",
    permission: "delivery_order",
    orderField: "updatedAt",
    tiebreak: "doc",
    summary:
      "Delivery orders (出荷書) with their items. The only resource that is ever hard-deleted — poll /deletions too.",
    scope: "Shipping plant, or creator.",
  },
  {
    path: "/delivery-notes",
    permission: "delivery_note",
    orderField: "updatedAt",
    tiebreak: "doc",
    summary: "Delivery notes (納品書) with their items.",
    scope: "Plant of the parent delivery order, or creator.",
  },
  {
    path: "/invoices",
    permission: "invoice",
    orderField: "updatedAt",
    tiebreak: "doc",
    summary:
      "Invoices (請求書). taxType and taxRate are a snapshot taken at issue time.",
    scope: "Creator (OWN) only.",
  },
  {
    path: "/billing-closings",
    permission: "billing_closing",
    orderField: "updatedAt",
    tiebreak: "id",
    summary: "Billing closings (締日処理).",
    scope: "Unscoped.",
  },
  {
    path: "/business-partners",
    permission: "master",
    orderField: "updatedAt",
    tiebreak: "id",
    summary:
      "Business partners (取引先) with their active roles. One legal entity may hold several roles.",
    scope: "Unscoped (master data).",
  },
  {
    path: "/products",
    permission: "master",
    orderField: "updatedAt",
    tiebreak: "id",
    summary: "Products (製品).",
    scope: "Unscoped (master data).",
  },
  {
    path: "/materials",
    permission: "master",
    orderField: "updatedAt",
    tiebreak: "id",
    summary:
      "Materials (素材). `code` is the identifier printed on supplier documents.",
    scope: "Unscoped (master data).",
  },
  {
    path: "/material-types",
    permission: "master",
    orderField: "updatedAt",
    tiebreak: "id",
    summary: "Material types (材種).",
    scope: "Unscoped (master data).",
  },
  {
    path: "/plants",
    permission: "master",
    orderField: "updatedAt",
    tiebreak: "id",
    summary: "Sites (拠点).",
    scope: "Unscoped (master data).",
  },
  {
    path: "/storage-locations",
    permission: "master",
    orderField: "updatedAt",
    tiebreak: "id",
    summary: "Storage locations (保管場所) with their shelves.",
    scope: "Unscoped (master data).",
  },
  {
    path: "/inventory/products",
    permission: "inventory",
    orderField: "updatedAt",
    tiebreak: "id",
    summary:
      "Product stock. quantity and reservedQuantity are returned raw — availability is decided by the app, not by subtracting these.",
    scope: "Storing plant.",
  },
  {
    path: "/inventory/materials",
    permission: "inventory",
    orderField: "updatedAt",
    tiebreak: "id",
    summary: "Material stock.",
    scope: "Storing plant.",
  },
  {
    path: "/inventory/transactions",
    permission: "inventory",
    orderField: "createdAt",
    tiebreak: "id",
    summary:
      "Stock movements — an append-only ledger. Ordered by createdAt, so ?updatedSince= filters on creation time.",
    scope:
      "Unscoped; the inventory reference is polymorphic with no path to a plant.",
  },
] as const;

/** 一覧ではない口（登録簿の対象外だが、実ファイルとの照合には要る）。 */
export const API_NON_LIST_PATHS: readonly string[] = [
  "/health",
  "/me",
  "/deletions",
  "/openapi.json",
] as const;
