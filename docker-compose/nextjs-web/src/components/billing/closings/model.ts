/**
 * model.ts — 締日処理 (BL02) view-model types + pure helpers.
 *
 * Model (app.billing_closings — uuid PK, unique (customer_bp_id, closing_date)):
 *   顧客 × 締日 = 1 行。「締日処理を実行」(runClosing) が対象月の未請求出荷
 *   （SHIPPED × DISPATCH）を顧客ごとに集計して PENDING 行を作成し、
 *   「請求書を生成」(processClosing) が請求書を起こして PROCESSED にする。
 *   締日は BpCustomerAttrs.closingDay（1–31、31・未設定 = 月末）から決まる。
 *
 * Decimal 列（totalAmount）はサーバー境界で Number() 済み。日付は ISO 文字列。
 * ここは pure / client-safe のみ（Prisma import 禁止）。
 */

export type ClosingStatus = "PENDING" | "PROCESSED" | "EXPORTED";

/** 締日処理 1 行（一覧・詳細ヘッダ共通）。 */
export interface BillingClosing {
  /** uuid — URL id。 */
  id: string;
  customerBpId: string;
  customerName: string;
  /** 締日（ISO date）。 */
  closingDate: string;
  status: ClosingStatus;
  totalAmount: number | null;
  /** 生成した請求書番号 INV-YYYYMM-NNNNN（未生成は null）。 */
  invoiceNumber: string | null;
  processedAt: string | null;
  notes: string | null;
  createdAt: string;
}

/** 詳細画面に出す期間内出荷 1 行。 */
export interface ClosingShipmentRow {
  /** 導出番号 SHP-YYYYMM-NNNNN。 */
  shippingOrderNumber: string;
  shippedAt: string | null;
  quantity: number;
  amount: number;
}

export interface BillingClosingDetail extends BillingClosing {
  /** 請求期間の対象出荷（PENDING: 未請求候補 / PROCESSED: 請求書由来）。 */
  shipments: ClosingShipmentRow[];
}

/** 請求書を生成できるか — 未処理（PENDING）のみ。 */
export function isProcessable(c: Pick<BillingClosing, "status">) {
  return c.status === "PENDING";
}

// ── 対象月・締日の pure ヘルパー ─────────────────────────────────────────────
// 日付はすべて UTC 起点（DB の @db.Date と toISOString 表示に揃える）。

/** "YYYYMM" → { year, month }。不正な形式・月は null。 */
export function parseYearMonth(
  yearMonth: string,
): { year: number; month: number } | null {
  if (!/^\d{6}$/.test(yearMonth)) return null;
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(4, 6));
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** 対象月の月初（UTC 0時）。 */
export function monthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

/** 対象月の翌月初（UTC 0時）— 排他的上限。 */
export function nextMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1 + 1, 1));
}

/**
 * 顧客の締日設定 → 対象月の締日（UTC 0時）。
 * closingDay: 1–31。31 または未設定（null）は月末。月の日数を超える値も月末。
 */
export function closingDateFor(
  year: number,
  month: number,
  closingDay: number | null | undefined,
): Date {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(closingDay ?? 31, daysInMonth);
  return new Date(Date.UTC(year, month - 1, Math.max(day, 1)));
}

/** 日付に日数を加算（UTC）。支払期限 = 締日 + 支払サイト日数。 */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
