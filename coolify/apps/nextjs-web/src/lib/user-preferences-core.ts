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
 *   - 文字の大きさ・太さは **CSS 変数 1 組**で表す（displayRootCss）。段の名前
 *     だけを DB に持ち、倍率はここが決める — 刻みを直しても保存済みの行を
 *     書き換えずに済む。
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

/**
 * 文字の大きさ（5 段・真ん中 "md" が従来の大きさ）。
 * DB には段の名前だけを持つ（倍率は下の TEXT_SCALE_FACTORS が唯一の定義）。
 */
export const TEXT_SCALES = ["xs", "sm", "md", "lg", "xl"] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

/**
 * アプリの書体。"noto" = 同梱の Noto Sans JP（既定・全端末で同じ見た目）、
 * "system" = OS 既定の書体へ委ねる（Windows は游ゴシック UI 系、Mac は
 * ヒラギノ系 — 端末ごとに見た目が変わる）。
 *
 * **PDF には効かない** — 帳票は常に埋め込み Noto Sans JP で固定（lib/pdf.ts）。
 * ここは画面表示だけの設定。
 */
export const FONT_FAMILIES = ["noto", "system"] as const;
export type FontFamilyPref = (typeof FONT_FAMILIES)[number];

/** 選択肢ごとの実際の font-family スタック（globals.css の --app-font-family へ渡す）。 */
export const FONT_FAMILY_STACKS: Record<FontFamilyPref, string> = {
  noto: "'Noto Sans JP', 'Noto Sans CJK JP', system-ui, -apple-system, sans-serif",
  system: "system-ui, -apple-system, sans-serif",
};

/**
 * 段ごとの倍率（html の font-size に掛ける）。rem 基準を動かすので、文字だけ
 * でなく余白・行の高さ・部品の高さも一緒に伸び縮みする（iOS の文字サイズと
 * 同じ挙動。文字だけ大きくすると、高さが固定の部品から文字がはみ出す）。
 *
 * 下げ幅（-6.25% / -12.5%）より上げ幅（+12.5% / +25%）を大きく取っている。
 * 小さくしたい人は「少し詰めたい」だけだが、大きくしたい人は「読めない」の
 * ほうを直したいので、必要な振れ幅が違う。
 *
 * メディアクエリの境界（Mantine / Tailwind とも em・rem 指定）はブラウザ既定の
 * 文字サイズを基準に評価されるため、ここを動かしても**折り返し幅は変わらない**。
 */
export const TEXT_SCALE_FACTORS: Record<TextScale, number> = {
  xs: 0.875,
  sm: 0.9375,
  md: 1,
  lg: 1.125,
  xl: 1.25,
};

/**
 * 太字テキスト時の本文の太さ。400 → 500 の 1 段だけ上げる。
 *
 * 2 段（600）上げないのは、この画面群が `fw={500}` を「少し強調」として
 * 各所で**インライン指定**しているため — 本文を 600 にすると、強調のほうが
 * 細く見える逆転が起きる。500 なら強調と同じ太さで並ぶだけで反転しない。
 * 併せて Mantine の medium（600 → 700）も 1 段上げ、強調は本文より太いまま
 * にしている。
 */
const BOLD_TEXT_WEIGHTS = { regular: 500, medium: 700 } as const;
const NORMAL_TEXT_WEIGHTS = { regular: 400, medium: 600 } as const;

export interface DisplayPreferences {
  locale: Locale;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  /** IANA タイムゾーン名（例 "Asia/Tokyo"）。 */
  timeZone: string;
  /** 文字の大きさ（5 段。既定 "md" = 従来どおり）。 */
  textScale: TextScale;
  /** 本文の文字を太くする。 */
  boldText: boolean;
  /** アプリの書体（既定 "noto"）。PDF には効かない。 */
  fontFamily: FontFamilyPref;
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
  textScale: "md",
  boldText: false,
  fontFamily: "noto",
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

function normalizeTextScale(value: string | null | undefined): TextScale {
  return (TEXT_SCALES as readonly string[]).includes(value ?? "")
    ? (value as TextScale)
    : DEFAULT_PREFERENCES.textScale;
}

function normalizeFontFamily(value: string | null | undefined): FontFamilyPref {
  return (FONT_FAMILIES as readonly string[]).includes(value ?? "")
    ? (value as FontFamilyPref)
    : DEFAULT_PREFERENCES.fontFamily;
}

/** DB 行など未検証の値から表示設定を作る（各項目ごとに既定へ倒す）。 */
export function normalizePreferences(raw: {
  locale?: string | null;
  dateFormat?: string | null;
  timeFormat?: string | null;
  timeZone?: string | null;
  textScale?: string | null;
  boldText?: boolean | null;
  fontFamily?: string | null;
}): DisplayPreferences {
  return {
    locale: normalizeLocale(raw.locale),
    dateFormat: normalizeDateFormat(raw.dateFormat),
    timeFormat: normalizeTimeFormat(raw.timeFormat),
    timeZone: isValidTimeZone(raw.timeZone)
      ? (raw.timeZone as string)
      : DEFAULT_PREFERENCES.timeZone,
    textScale: normalizeTextScale(raw.textScale),
    boldText: raw.boldText === true,
    fontFamily: normalizeFontFamily(raw.fontFamily),
  };
}

/**
 * 文字の大きさ・太さ・書体を表す CSS 変数一式。
 *
 * 実際の適用先（html の font-size / body の font-weight / Mantine の太さ・
 * 書体変数）は globals.css §2 が持ち、ここは値だけを配る。設定画面が
 * 「保存前の見た目」を出すときも同じ変数を html へ直接載せるので、
 * **適用の仕方が 1 通り**に保たれる。書体は PDF には配らない（lib/pdf.ts は
 * これを読まず、常に埋め込み Noto Sans JP を使う）。
 */
export function displayCssVariables(
  prefs: DisplayPreferences,
): Record<string, string> {
  const weights = prefs.boldText ? BOLD_TEXT_WEIGHTS : NORMAL_TEXT_WEIGHTS;
  return {
    "--app-text-scale": String(TEXT_SCALE_FACTORS[prefs.textScale]),
    "--app-font-family": FONT_FAMILY_STACKS[prefs.fontFamily],
    "--app-font-weight-regular": String(weights.regular),
    "--app-font-weight-medium": String(weights.medium),
  };
}

/**
 * 上の変数を :root へ流し込む CSS 文字列（サーバーで `<style>` に入れる）。
 *
 * クライアントで当てると、最初の描画だけ既定の大きさで出てから切り替わる
 * （文字がひと呼吸おいて跳ねる）。SSR で流し込めばその瞬間が無い。
 *
 * 値は列挙（textScale/fontFamily）から作った固定の数値・CSS 単一引用符の
 * font-family リストだけで、利用者の自由入力は一切通らないので
 * `<`・`>`・`&`・二重引用符は入り得ない（`<style>` の中身は生テキストで、
 * React がエスケープすると壊れる）。
 */
export function displayRootCss(prefs: DisplayPreferences): string {
  const body = Object.entries(displayCssVariables(prefs))
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
  return `:root{${body}}`;
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
