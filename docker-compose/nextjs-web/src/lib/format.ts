/**
 * format.ts — Date / number / currency formatting (_specs/design.md §17.3).
 *
 * Pure functions usable from both Server and Client Components.
 *
 * ★ 日時は **ユーザーの表示設定**（言語・日付形式・時刻形式・タイムゾーン、
 *   app.users）に従う。設定は 2 経路で渡る:
 *     - クライアント: `const fmt = useFormat()`（PreferencesProvider の Context）
 *     - サーバー: `const fmt = await getServerFormatters()`（lib/user-preferences）
 *   どちらも同じ `Formatters` を返すので、SSR とハイドレーション後で出力が
 *   一致する（Context は SSR 時にも同じ値を持つ）。
 *
 *   フックを使えない素の関数（テーブル行の整形ヘルパ等）は `Formatters` を
 *   引数で受け取ること。モジュールにグローバルの「現在のユーザー」を置くと、
 *   サーバーではリクエストをまたいで混ざるため置かない。
 *
 * ★ 帳票（PDF）とメールは **ユーザー設定に従わない** — 出来上がった書類は
 *   読む人によって時刻が変わってはいけないので、JST・日本語固定の
 *   `documentFormatters` を使う。
 */

import { INTL_LOCALES, type Locale } from "./i18n";
import {
  DEFAULT_PREFERENCES,
  type DisplayPreferences,
} from "./user-preferences-core";

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

function toDate(iso: string | Date): Date | null {
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 日付の並びは設定値（YYYY/MM/DD 等）が正なので、ロケール既定の並びには
 * 頼らず `formatToParts` から組み立てる。タイムゾーンの読み替えと
 * 暦（年月日の値）の算出だけを Intl に任せる形。
 */
function datePartsFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateWith(
  prefs: DisplayPreferences,
  fmt: Intl.DateTimeFormat,
  d: Date,
): string {
  const parts = fmt.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const y = get("year");
  const m = get("month");
  const day = get("day");
  switch (prefs.dateFormat) {
    case "YYYY-MM-DD":
      return `${y}-${m}-${day}`;
    case "DD/MM/YYYY":
      return `${day}/${m}/${y}`;
    case "MM/DD/YYYY":
      return `${m}/${day}/${y}`;
    default:
      return `${y}/${m}/${day}`;
  }
}

/** 表示設定 1 つぶんの整形関数一式。 */
export interface Formatters {
  readonly prefs: DisplayPreferences;
  readonly locale: Locale;
  /** ISO date(-time) → 設定の日付形式（設定のタイムゾーンで読む）。 */
  date(iso: string | Date | null | undefined): string;
  /** ISO timestamp → 日付 + 時刻。 */
  dateTime(iso: string | Date | null | undefined): string;
  /** ISO timestamp → 時刻のみ。 */
  time(iso: string | Date | null | undefined): string;
  /** { ja, en } JSON → 表示文字列（言語設定に従う）。 */
  localized(value: LocalizedText | null | undefined): string;
  /** kiosk_devices.name（{ja,en} または旧文字列）→ 表示名。 */
  deviceName(value: unknown): string | null;
  /** 指示書番号 `YYYYMMDD-XXXXX`（暦日は設定のタイムゾーンで採る）。 */
  workOrderNumberLabel(
    workOrderNumber: number | null | undefined,
    createdAt?: string | Date | null,
  ): string;
  money(value: number | null | undefined, currency?: string): string;
}

const formattersCache = new Map<string, Formatters>();

function cacheKey(p: DisplayPreferences): string {
  return `${p.locale}|${p.dateFormat}|${p.timeFormat}|${p.timeZone}`;
}

/**
 * 表示設定から整形関数一式を作る（同じ設定なら使い回す — Intl の生成は
 * 高くつくうえ、1 画面で何百回も呼ばれる）。
 */
export function createFormatters(prefs: DisplayPreferences): Formatters {
  const key = cacheKey(prefs);
  const hit = formattersCache.get(key);
  if (hit) return hit;

  const intlLocale = INTL_LOCALES[prefs.locale];
  const hour12 = prefs.timeFormat === "12h";
  const dateParts = datePartsFormatter(prefs.timeZone);
  const timeFmt = new Intl.DateTimeFormat(intlLocale, {
    timeZone: prefs.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12,
  });
  // { ja, en } JSON は 2 言語しか持たない。zh の人には英語を見せる
  // （日本語より読める可能性が高い）。
  const textLocale: "ja" | "en" = prefs.locale === "ja" ? "ja" : "en";

  const date = (iso: string | Date | null | undefined): string => {
    if (!iso) return "—";
    const d = toDate(iso);
    return d ? formatDateWith(prefs, dateParts, d) : "—";
  };
  const time = (iso: string | Date | null | undefined): string => {
    if (!iso) return "—";
    const d = toDate(iso);
    return d ? timeFmt.format(d) : "—";
  };

  const formatters: Formatters = {
    prefs,
    locale: prefs.locale,
    date,
    time,
    dateTime: (iso) => {
      if (!iso) return "—";
      const d = toDate(iso);
      return d ? `${date(d)} ${timeFmt.format(d)}` : "—";
    },
    localized: (value) => localized(value, textLocale),
    deviceName: (value) => deviceName(value, textLocale),
    workOrderNumberLabel: (workOrderNumber, createdAt) => {
      if (workOrderNumber == null) return "—";
      const serial = String(workOrderNumber).padStart(5, "0");
      const d = createdAt ? toDate(createdAt) : null;
      if (!d) return `#${workOrderNumber}`;
      const ymd = formatDateWith(
        { ...prefs, dateFormat: "YYYY/MM/DD" },
        dateParts,
        d,
      ).replace(/\D/g, "");
      return `${ymd}-${serial}`;
    },
    money: formatMoney,
  };
  formattersCache.set(key, formatters);
  return formatters;
}

/**
 * 帳票（PDF）・メール用の固定フォーマッタ — 日本語 / JST / yyyy/MM/dd。
 * 出来上がった書類は読む人の設定で変わってはいけないのでこちらを使う。
 */
export const documentFormatters: Formatters =
  createFormatters(DEFAULT_PREFERENCES);

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
