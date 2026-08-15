/**
 * format.ts — Date / number / currency formatting (_specs/design.md §17.3).
 *
 * Pure functions usable from both Server and Client Components.
 */

const JPY = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
});

export function formatMoney(
  value: number | null | undefined,
  currency = "JPY",
): string {
  if (value == null) return "—";
  if (currency === "JPY") return JPY.format(value);
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency }).format(
    value,
  );
}

// 表示タイムゾーンは JST（Asia/Tokyo）固定。以前は ISO 文字列の切り出しで
// UTC のまま表示していた（9 時間ずれ）。Intl + timeZone 固定なら SSR と
// クライアントで同一出力になり、hydration 不一致も起きない（JST は DST なし）。
const TOKYO_DATE = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const TOKYO_DATETIME = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const TOKYO_TIME = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function toDate(iso: string | Date): Date | null {
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO date(-time) → `yyyy/MM/dd`（JST） */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = toDate(iso);
  return d ? TOKYO_DATE.format(d) : "—";
}

/** ISO timestamp → `yyyy/MM/dd HH:mm`（JST） */
export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = toDate(iso);
  return d ? TOKYO_DATETIME.format(d) : "—";
}

/** ISO timestamp → `HH:mm`（JST） */
export function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = toDate(iso);
  return d ? TOKYO_TIME.format(d) : "—";
}

/** { ja, en } DB JSON field (_specs/design.md §17.4). */
export type LocalizedText = { ja: string; en: string };

/** Render-side fallback: current locale → ja → '—'. */
export function localized(
  value: LocalizedText | null | undefined,
  locale: "ja" | "en" = "ja",
): string {
  return value?.[locale] || value?.ja || value?.en || "—";
}

/**
 * 端末名（kiosk_devices.name = { ja, en } JSON）を表示文字列にする。
 * 旧データ（文字列のまま）も受け付ける — 移行前後どちらでも壊れない。
 */
export function deviceName(
  value: unknown,
  locale: "ja" | "en" = "ja",
): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value || null;
  if (typeof value === "object") {
    const text = localized(value as LocalizedText, locale);
    return text === "—" ? null : text;
  }
  return null;
}
