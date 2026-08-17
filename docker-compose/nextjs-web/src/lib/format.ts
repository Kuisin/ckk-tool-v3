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

/**
 * HTML 特殊文字のエスケープ — 文字列を HTML の **テキスト位置、または
 * 二重引用符で囲んだ属性値** へ埋め込むときに使う。
 *
 * lib/pdf.ts のテンプレート差し込みは無エスケープなので、HTML を組み立てる
 * 側の責任でここを通すこと（PDF / メール本文が共通の経路）。属性値は必ず
 * `"` で囲む — `'` はエスケープしない。
 */
export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * 指示書番号の表示形式 `YYYYMMDD-XXXXX`（作成日 + 通し連番 5 桁）。
 *
 * **保存側は従来どおり通し連番の int**（= ロット番号・URL のキー）で、
 * これは表示専用の整形。日付が取れない画面では従来の `#N` を返す。
 */
export function workOrderNumberLabel(
  workOrderNumber: number | null | undefined,
  createdAt?: string | Date | null,
): string {
  if (workOrderNumber == null) return "—";
  const serial = String(workOrderNumber).padStart(5, "0");
  const d = createdAt ? toDate(createdAt) : null;
  if (!d) return `#${workOrderNumber}`;
  // JST の暦日で採る（TOKYO_DATE は yyyy/MM/dd）。
  const ymd = TOKYO_DATE.format(d).replace(/\D/g, "");
  return `${ymd}-${serial}`;
}
