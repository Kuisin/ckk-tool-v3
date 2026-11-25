/**
 * step-due-date-core.ts — 工程納期（work_order_steps.due_date）の判定。純ロジック。
 *
 * **nextjs-kiosk と逐語コピー（twin file）** — 共有端末の工程画面も同じ規則で
 * 赤くする。変えたら `pnpm twin:sync`（nextjs-kiosk）で写すこと。
 *
 * 業務の日付は JST で決まる（締日・採番と同じ）。比較は「YYYY-MM-DD の文字列」
 * 同士で行い、`Date` の生の比較はしない — サーバー（UTC）とブラウザ（任意の TZ）
 * で「今日」が食い違うと、hydration の不一致と日付の 1 日ずれが同時に起きる。
 */

const TOKYO_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** その瞬間の JST の暦日（YYYY-MM-DD）。en-CA は ISO 形式で出す。 */
export function jstTodayString(now: Date = new Date()): string {
  return TOKYO_DATE.format(now);
}

/**
 * 暦日 → 表示用の時刻（JST の正午）。日付だけの値を `new Date("YYYY-MM-DD")`
 * （UTC 深夜）で読むと、UTC より西のタイムゾーンでは前日に見える。正午なら
 * ±12 時間のどこから見ても同じ日になる。
 */
export function dueDateInstant(dueDate: string): string {
  return `${dueDate}T12:00:00+09:00`;
}

/** 締めた工程（もう遅れようがない）。 */
const CLOSED_STATUSES = new Set(["COMPLETED", "CANCELLED"]);

/**
 * 工程納期を過ぎて、まだ終わっていないか。納期当日はまだ遅れではない
 * （その日のうちに終えればよい）。納期が無い工程は常に false。
 */
export function isStepOverdue(
  dueDate: string | null | undefined,
  status: string,
  today: string,
): boolean {
  if (!dueDate) return false;
  if (CLOSED_STATUSES.has(status)) return false;
  return dueDate < today;
}
