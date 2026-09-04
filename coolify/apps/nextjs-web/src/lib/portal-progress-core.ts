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
import type { PortalDocumentType } from "./portal-documents-core";

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

/**
 * 書類・注文明細の「明細 1 行」。見積書・注文請書・納品書・請求書で形が違う
 * （製品名 / 摘要）ので、**社外に出す時点で 1 つの形に畳む**。
 *
 * label は製品名（見積・注文請書・納品書）か摘要（請求書）。どちらも
 * 「何に対する行か」を人が読む欄で、内部 id は入らない。
 */
export interface PortalLineItemDto {
  label: string;
  quantity: number;
  /** 納品書は include_price=false のとき null（価格を載せない納品書に出さない）。 */
  unitPrice: string | null;
  amount: string | null;
  deliveryDate: string | null;
}

export const PORTAL_LINE_ITEM_DTO_KEYS: readonly (keyof PortalLineItemDto)[] = [
  "amount",
  "deliveryDate",
  "label",
  "quantity",
  "unitPrice",
];

/**
 * 「この書類に関係する別の書類」への参照。
 *
 * **番号だけを持つ**。ここに載るのは、その相手も同じ判定
 * （portalAccessFor）を通って見えると確認できたものだけで、見えない書類は
 * 行ごと落とす —— 番号を出すだけでも「その書類は在る」を教えてしまうため。
 */
export interface PortalRelatedDocumentDto {
  type: PortalDocumentType;
  number: string;
  issuedOn: string | null;
}

export const PORTAL_RELATED_DOCUMENT_DTO_KEYS: readonly (keyof PortalRelatedDocumentDto)[] =
  ["issuedOn", "number", "type"];

export interface PortalDocumentDetailDto extends PortalDocumentDto {
  type: PortalDocumentType;
  /** PDF を引くための file id（アクセスを証明した後にだけ返す）。 */
  pdfFileId: string | null;
  currency: string;
  /**
   * 単価・金額を出してよい書類か。
   *
   * **納品書の include_price をそのまま運ぶ。** 「明細が全部 null なら価格
   * 無しの書類だろう」と推測すると、単価を入れ忘れただけの書類にまで
   * 「価格を記載していません」と書いてしまう（意図と欠落は別物）。
   */
  showsPrices: boolean;
  /** 明細。**社外に出してよい 5 欄だけ**に畳んである（PortalLineItemDto）。 */
  lineItems: PortalLineItemDto[];
  /**
   * 関連書類。**相手も見えると確認できたものだけ**が入る
   * （番号を出すだけでも「その書類は在る」を教えてしまうため）。
   */
  related: PortalRelatedDocumentDto[];

  // ── 種別ごとの補足（無い種別では null のまま）───────────────────────────
  /** 見積書: 有効期限。 */
  validUntil: string | null;
  /** 注文請書: 取引先自身の注文書番号（自分のどの注文かを照合する手掛かり）。 */
  customerOrderRef: string | null;
  /** 注文請書: 注文日。 */
  orderedOn: string | null;
  /** 納品書: 納品日。 */
  deliveredOn: string | null;
  /** 請求書: 請求期間・支払期限・内訳。 */
  billingPeriodFrom: string | null;
  billingPeriodTo: string | null;
  dueDate: string | null;
  subtotal: string | null;
  taxAmount: string | null;
}

export const PORTAL_DOCUMENT_DETAIL_DTO_KEYS: readonly (keyof PortalDocumentDetailDto)[] =
  [
    "billingPeriodFrom",
    "billingPeriodTo",
    "currency",
    "customerOrderRef",
    "deliveredOn",
    "dueDate",
    "hasPdf",
    "issuedOn",
    "lineItems",
    "number",
    "orderedOn",
    "pdfFileId",
    "related",
    "showsPrices",
    "subtotal",
    "taxAmount",
    "totalAmount",
    "type",
    "validUntil",
  ];

/**
 * 注文明細 1 件の詳細。一覧の行（PortalOrderLineDto）に、その 1 件を開いた
 * ときだけ出すものを足したもの。
 *
 * customerOrderRef は**取引先自身の注文書番号**なので社外に出してよい
 * （むしろ「自分のどの注文か」を照合する唯一の手掛かり）。
 */
export interface PortalOrderLineDetailDto extends PortalOrderLineDto {
  acceptanceNumber: string;
  customerOrderRef: string | null;
  orderedOn: string | null;
  related: PortalRelatedDocumentDto[];
}

export const PORTAL_ORDER_LINE_DETAIL_DTO_KEYS: readonly (keyof PortalOrderLineDetailDto)[] =
  [
    ...PORTAL_ORDER_LINE_DTO_KEYS,
    "acceptanceNumber",
    "customerOrderRef",
    "orderedOn",
    "related",
  ].sort() as (keyof PortalOrderLineDetailDto)[];

/**
 * 進捗を「どこまで進んだか」の段として読むための順序。
 *
 * CANCELLED は段ではない（進行の外）ので入らない —— 呼び出し側は
 * `portalProgressStepIndex` が -1 を返したら段ではなく警告として描く。
 */
export const PORTAL_PROGRESS_STEPS = [
  "RECEIVED",
  "IN_PRODUCTION",
  "READY",
  "SHIPPED",
  "DELIVERED",
] as const satisfies readonly PortalProgress[];

/** 段の番号（0 始まり）。進行の外（CANCELLED）は -1。 */
export function portalProgressStepIndex(progress: PortalProgress): number {
  return (PORTAL_PROGRESS_STEPS as readonly string[]).indexOf(progress);
}
/**
 * 注文明細 1 件（`ORD-YYYYMM-NNNNN-NN`）を分解する。
 *
 * 一覧の行から詳細へ渡るのはこの文字列だけ（内部 id は社外へ出さない）ので、
 * 受け取り側は必ずここで検証する。
 */
export function parsePortalOrderLineNumber(
  value: string,
): { yearMonth: string; seq: number; branch: number } | null {
  const m = /^ORD-(\d{6})-(\d{5})-(\d{1,3})$/.exec(value.trim().toUpperCase());
  if (!m) return null;
  return { yearMonth: m[1], seq: Number(m[2]), branch: Number(m[3]) };
}

/** 表示番号（`ORD-YYYYMM-NNNNN-NN`）。枝番未採番の行は番号を持たない。 */
export function portalOrderLineNumber(
  acceptanceNumber: string,
  branch: number | null,
): string | null {
  return branch == null
    ? null
    : `${acceptanceNumber}-${String(branch).padStart(2, "0")}`;
}

/**
 * ホーム（/portal）に出す件数。
 *
 * 「いま何件動いているか」だけを数える —— 一覧を丸ごと読ませずに、
 * 見に行く価値があるかを 1 目で判らせるため。
 */
export interface PortalOrderSummary {
  total: number;
  byProgress: Record<PortalProgress, number>;
  /** 進行中（納品済み・キャンセル以外）の件数。 */
  active: number;
}

export function summarizePortalOrders(
  rows: readonly { progress: PortalProgress }[],
): PortalOrderSummary {
  const byProgress = Object.fromEntries(
    PORTAL_PROGRESS.map((p) => [p, 0]),
  ) as Record<PortalProgress, number>;
  for (const r of rows) byProgress[r.progress] += 1;
  return {
    total: rows.length,
    byProgress,
    active: rows.filter(
      (r) => r.progress !== "DELIVERED" && r.progress !== "CANCELLED",
    ).length,
  };
}
