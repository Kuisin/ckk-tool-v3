/**
 * user-preferences-core.ts — ユーザー個人の表示設定（純ロジック・isomorphic）。
 *
 * 保存先は app.users の locale / date_format / time_format / time_zone
 * （DB アクセスは server-only の lib/user-preferences.ts）。ここには型・既定値・
 * 正規化だけを置き、フォーマッタ本体は lib/format.ts が組み立てる。
 *
 * 設計の要点:
 *   - **保存は常に UTC**（timestamptz）。timeZone は「画面に出すとき、どこの
 *     時刻として読むか」だけを決める表示専用の設定で、保存値の意味は変えない。
 *   - locale はキオスクと共有の 1 列（app.users.locale）。同じ人が Web でも
 *     タブレットでも同じ言語になる。
 *   - 不正値は必ず既定へ倒す（normalize）。表示設定が壊れて画面が落ちるより、
 *     既定で表示できるほうがよい。
 */

import { type Locale, normalizeLocale } from "./i18n";

/** 日付の並び。値はそのまま表示パターンを表す（DB の CHECK と同じ集合）。 */
export const DATE_FORMATS = [
  "YYYY/MM/DD",
  "YYYY-MM-DD",
  "DD/MM/YYYY",
  "MM/DD/YYYY",
] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const TIME_FORMATS = ["24h", "12h"] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

export interface DisplayPreferences {
  locale: Locale;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  /** IANA タイムゾーン名（例 "Asia/Tokyo"）。 */
  timeZone: string;
}

/**
 * 既定値 — 従来の挙動（日本語・JST・yyyy/MM/dd・24 時間）そのまま。
 * 未ログイン・設定前・不正値のときはここへ倒れる。
 */
export const DEFAULT_PREFERENCES: DisplayPreferences = {
  locale: "ja",
  dateFormat: "YYYY/MM/DD",
  timeFormat: "24h",
  timeZone: "Asia/Tokyo",
};

/**
 * 選択肢に出すタイムゾーン。網羅ではなく、この会社が実際に使う範囲
 * （国内 + 取引のあるアジア圏 + 欧米の代表）に絞る。ここに無い IANA 名でも
 * 保存・表示はできる（`isValidTimeZone` を通れば通す）。
 */
export const COMMON_TIME_ZONES = [
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Seoul",
  "Asia/Ho_Chi_Minh",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "America/Los_Angeles",
  "America/Chicago",
  "America/New_York",
  "UTC",
] as const;

/**
 * Intl が解決できる IANA 名かどうか。DB 側に CHECK を置けない
 * （pg_timezone_names を CHECK から参照できない）ぶん、ここが唯一の関門。
 */
export function isValidTimeZone(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function normalizeDateFormat(value: string | null | undefined): DateFormat {
  return (DATE_FORMATS as readonly string[]).includes(value ?? "")
    ? (value as DateFormat)
    : DEFAULT_PREFERENCES.dateFormat;
}

function normalizeTimeFormat(value: string | null | undefined): TimeFormat {
  return (TIME_FORMATS as readonly string[]).includes(value ?? "")
    ? (value as TimeFormat)
    : DEFAULT_PREFERENCES.timeFormat;
}

/** DB 行など未検証の値から表示設定を作る（各項目ごとに既定へ倒す）。 */
export function normalizePreferences(raw: {
  locale?: string | null;
  dateFormat?: string | null;
  timeFormat?: string | null;
  timeZone?: string | null;
}): DisplayPreferences {
  return {
    locale: normalizeLocale(raw.locale),
    dateFormat: normalizeDateFormat(raw.dateFormat),
    timeFormat: normalizeTimeFormat(raw.timeFormat),
    timeZone: isValidTimeZone(raw.timeZone)
      ? (raw.timeZone as string)
      : DEFAULT_PREFERENCES.timeZone,
  };
}

/** 設定画面の選択肢ラベル（日付は実例で見せる — 2026-03-05 で固定）。 */
export function dateFormatExample(format: DateFormat): string {
  switch (format) {
    case "YYYY-MM-DD":
      return "2026-03-05";
    case "DD/MM/YYYY":
      return "05/03/2026";
    case "MM/DD/YYYY":
      return "03/05/2026";
    default:
      return "2026/03/05";
  }
}

export type { Locale };
