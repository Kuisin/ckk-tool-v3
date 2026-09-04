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
  /** 導出番号 DOR-YYYYMM-NNNNN。 */
  deliveryOrderNumber: string;
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

// ── 請求期間（前回締日, 今回締日] ───────────────────────────────────────────
//
// 顧客の請求期間は暦月ではなく **前回の締日の翌日 〜 今回の締日** で切る。
// 「月初〜締日」で切ると、締日より後の出荷はその月にも翌月（翌月も月初から
// 数える）にも入らず、どの締めにも拾われないまま請求されない。
//
// 締日は暦日（@db.Date = UTC 0 時の Date）で持つが、shipped_at は時刻を持つ
// タイムスタンプなので、境界は **JST の 0 時**（= UTC 前日 15:00）に置く。
// UTC 0 時で切ると JST 0〜9 時の出荷が前日の側に落ちる。

/** JST（UTC+9）— 帳票・締日の暦日を決める時計。 */
const JST_OFFSET_MS = 9 * 3_600_000;

/** 暦日（UTC 0 時の Date）→ その暦日の JST 0 時を表す瞬間。 */
export function jstMidnightOf(calendarDate: Date): Date {
  return new Date(calendarDate.getTime() - JST_OFFSET_MS);
}

/** 前月の締日（暦日）。1 月なら前年 12 月。月末指定（31/null）は前月の月末。 */
export function previousClosingDate(
  year: number,
  month: number,
  closingDay: number | null | undefined,
): Date {
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return closingDateFor(prevYear, prevMonth, closingDay);
}

/** 請求期間の開始日（暦日）= 前回締日の翌日。invoices.billing_period_from。 */
export function billingPeriodStart(
  year: number,
  month: number,
  closingDay: number | null | undefined,
): Date {
  return addDays(previousClosingDate(year, month, closingDay), 1);
}

export interface BillingWindow {
  /** 今回の締日（暦日）。 */
  closingDate: Date;
  /** shipped_at の下限（含む）= 前回締日の翌日 JST 0 時。 */
  gte: Date;
  /** shipped_at の上限（含まない）= 今回締日の翌日 JST 0 時。 */
  lt: Date;
}

/**
 * 顧客 × 対象月の請求期間 — shipped_at が [gte, lt) なら今回の締めに入る。
 * closingDay は顧客の締日設定（1–31、31/null = 月末）。
 */
export function billingWindowFor(
  year: number,
  month: number,
  closingDay: number | null | undefined,
): BillingWindow {
  const closingDate = closingDateFor(year, month, closingDay);
  return {
    closingDate,
    gte: jstMidnightOf(billingPeriodStart(year, month, closingDay)),
    lt: jstMidnightOf(addDays(closingDate, 1)),
  };
}

/** shipped_at が請求期間に入るか。 */
export function inBillingWindow(
  shippedAt: Date,
  window: Pick<BillingWindow, "gte" | "lt">,
): boolean {
  return shippedAt >= window.gte && shippedAt < window.lt;
}

/**
 * 月初の何日目までは日次オートランで前月分も走らせるか。締日当日（月末）の
 * 06 時以降に出荷された分は当日のオートランに間に合わないので、翌月に入って
 * から前月の締めをもう一度集計して拾う（PROCESSED 済みの締日はスキップされる）。
 */
export const PREVIOUS_MONTH_GRACE_DAYS = 3;

/** その日の日次オートランが走らせる対象月（前月 → 当月の順）。 */
export function autorunTargetMonths(
  year: number,
  month: number,
  day: number,
): { year: number; month: number }[] {
  const targets: { year: number; month: number }[] = [];
  if (day <= PREVIOUS_MONTH_GRACE_DAYS) {
    targets.push(
      month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 },
    );
  }
  targets.push({ year, month });
  return targets;
}
