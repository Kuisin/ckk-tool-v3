/**
 * portal-progress-core.ts — 社外へ出す「進捗」の射影（純関数・テスト対象）。
 *
 * ■ なぜ行をそのまま返さないのか
 *
 * 受注・出荷の行を素で返すと、社外に出してはいけないものが一緒に出る。
 * 実際に確認したもの:
 *   - order_lines.lot_number      = 指示書番号。キオスクの QR `CKK:WO:<int>` そのもの
 *   - delivery_orders.work_order_id → WorkOrder → WorkOrderStep.supplierBp = **外注先**
 *   - order_acceptances.extracted = AI 抽出の生 JSON / .notes = 社内メモ
 *   - .assigned_plant_id / .sales_rep_id / .source / .status（IMPORT 等の内部状態）
 *   - order_lines.is_locked       = 承認依頼中であること
 *
 * なので**許可リストで組んだ DTO** だけを返し、キー集合をテストで固定する。
 * 後から select を広げた人は CI で落ちる — 「工程の中身は社外に出さない」を
 * 機械で守れるのはこれだけ。
 */

import type { Tr } from "./i18n";

/** 社外に見せる進捗。**工程の粒度は出さない**（どこの誰が何をしたかは社内の話）。 */
export const PORTAL_PROGRESS = [
  "RECEIVED", // 受注済み（まだ着手していない）
  "IN_PRODUCTION", // 製造中
  "READY", // 完成・出荷待ち
  "SHIPPED", // 出荷済み
  "DELIVERED", // 納品済み
  "CANCELLED",
] as const;

export type PortalProgress = (typeof PORTAL_PROGRESS)[number];

export function portalProgressLabel(progress: PortalProgress, tr: Tr): string {
  return tr(`enum.PORTAL_PROGRESS_LABEL.${progress}`);
}

/** 注文明細の状態（app.ORDER_LINE_STATUS）。 */
export type OrderLineStatusLike =
  | "DRAFT"
  | "CONFIRMED"
  | "IN_PRODUCTION"
  | "PARTIAL_SHIPPED"
  | "SHIPPED"
  | "CANCELLED";

/**
 * 進捗の判定。
 *
 * 納品済みは delivery_notes 側にしか無いので、明細の状態だけでは出せない。
 * **キャンセルが最優先** — 進行中に見せてから「実は止まっていた」が一番困る。
 */
export function portalProgressOf(
  line: { status: OrderLineStatusLike; cancelledAt?: Date | null },
  deliveries: readonly { deliveredAt?: Date | null }[] = [],
): PortalProgress {
  if (line.cancelledAt || line.status === "CANCELLED") return "CANCELLED";

  // 納品書が 1 通でも「納品済み」なら、出荷より先の段階に居る。
  const anyDelivered = deliveries.some((d) => d.deliveredAt != null);

  switch (line.status) {
    case "SHIPPED":
      return anyDelivered ? "DELIVERED" : "SHIPPED";
    case "PARTIAL_SHIPPED":
      // 一部だけ出ている状態は「出荷済み」と言い切らない。
      return "SHIPPED";
    case "IN_PRODUCTION":
      return "IN_PRODUCTION";
    case "CONFIRMED":
      return "RECEIVED";
    default:
      // DRAFT は社外に出さない（確定前の下書き）。呼び出し側が絞る前提だが、
      // 万一届いても「受注」とは言わない。
      return "RECEIVED";
  }
}

/**
 * 社外へ出す注文明細 1 行。**この形が社外に出てよいものの全て**。
 *
 * キー集合は portal-progress-core.test.ts が固定している。項目を足すときは
 * 「これは取引先に見せてよいか」を毎回考えること（既定は見せない）。
 */
export interface PortalOrderLineDto {
  /** 表示用の枝番（ORD-YYYYMM-NNNNN-NN の NN）。内部 id は出さない。 */
  branch: number | null;
  productName: string;
  quantity: number;
  /** 金額は文字列（表示のための丸めを DB 側の型に依存させない）。 */
  unitPrice: string | null;
  amount: string | null;
  deliveryDate: string | null;
  progress: PortalProgress;
  shippedOn: string | null;
}

export const PORTAL_ORDER_LINE_DTO_KEYS: readonly (keyof PortalOrderLineDto)[] =
  [
    "amount",
    "branch",
    "deliveryDate",
    "productName",
    "progress",
    "quantity",
    "shippedOn",
    "unitPrice",
  ];

/**
 * 社外へ出す書類 1 件（一覧の行）。
 *
 * status は書類ごとの生の状態ではなく、**社外向けに畳んだ表示**にする
 * （IMPORT / PRICE_DIFF のような社内の途中経過を出さない）。
 */
export interface PortalDocumentDto {
  /** 表示番号（QOT-… / ORD-… / DRN-… / INV-…）。 */
  number: string;
  issuedOn: string | null;
  /** 合計金額。納品書は include_price=false なら null にすること。 */
  totalAmount: string | null;
  /** その書類の PDF が引けるか（引ける場合だけリンクを出す）。 */
  hasPdf: boolean;
}

export const PORTAL_DOCUMENT_DTO_KEYS: readonly (keyof PortalDocumentDto)[] = [
  "hasPdf",
  "issuedOn",
  "number",
  "totalAmount",
];
