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

import { INTL_LOCALES, type Locale, localeFallbackOrder } from "./i18n";
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

/**
 * 暦の日付（`YYYY-MM-DD`）を表示形式に並べ替える。**タイムゾーンで読み替えない。**
 *
 * フォームの日付項目が持っているのは「2026-03-01」という**暦の日付**であって
 * 瞬間ではない。`new Date("2026-03-01")` は UTC 0 時と解釈されるので、UTC より
 * 西のタイムゾーンで表示すると前日にずれる（回答した本人の画面と、それを読む
 * 海外拠点の画面で日付が 1 日違って見える）。ここでは並べ替えるだけにする。
 *
 * 形が合わない値はそのまま返す — 回答は過去の版のもので、いまの検証を
 * 通っていないことがある。
 */
export function formatCalendarDate(
  value: string | null | undefined,
  dateFormat: DisplayPreferences["dateFormat"],
): string {
  if (!value) return "—";
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!parts) return value;
  const [, y, m, d] = parts;
  switch (dateFormat) {
    case "YYYY-MM-DD":
      return `${y}-${m}-${d}`;
    case "DD/MM/YYYY":
      return `${d}/${m}/${y}`;
    case "MM/DD/YYYY":
      return `${m}/${d}/${y}`;
    default:
      return `${y}/${m}/${d}`;
  }
}

/**
 * 時計の時刻（`HH:MM`）を表示形式へ。日付と同じ理由でタイムゾーン変換しない
 * （「9:00 集合」は読む人の居場所で動かない）。
 */
export function formatClockTime(
  value: string | null | undefined,
  timeFormat: DisplayPreferences["timeFormat"],
): string {
  if (!value) return "—";
  const parts = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!parts) return value;
  const hour = Number(parts[1]);
  const minute = parts[2];
  if (!Number.isFinite(hour) || hour > 23) return value;
  if (timeFormat !== "12h") return `${String(hour).padStart(2, "0")}:${minute}`;
  const suffix = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute} ${suffix}`;
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
  localized(value: LocalizedTextInput | null | undefined): string;
  /** kiosk_devices.name（{ja,en} または旧文字列）→ 表示名。 */
  deviceName(value: unknown): string | null;
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
  const textLocale = prefs.locale;

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

/** { ja, en } DB JSON field (_specs/design.md §17.4). ja/en は必ず埋まる前提の固定 2 言語形。 */
export type LocalizedText = { ja: string; en: string };

/**
 * DB の多言語 JSON の一般形（`_specs/i18n-glossary.md` §2.10）。**ja だけが必須**で、
 * それ以外のキーは言語コード（`en` / `zh` / 将来足す言語）を任意に持つ —
 * 言語を増やしてもこの型・`localized()` 側は変更不要（フォーム側は
 * `components/ui/shells.tsx` の `LocalizedTextInput` が `LOCALES` を見て
 * 自動で追従する）。既存の固定 `LocalizedText`（{ja,en} 両方必須）はこの形の
 * 部分集合なので、呼び出し側の変更なしにそのまま渡せる。
 */
export type LocalizedTextInput = { ja: string } & Record<
  string,
  string | undefined
>;

/** Render-side fallback: `localeFallbackOrder(locale)` → 最初に埋まっている言語 → '—'. */
export function localized(
  value: LocalizedTextInput | null | undefined,
  locale: Locale | string = "ja",
): string {
  if (!value) return "—";
  for (const l of localeFallbackOrder(locale)) {
    const text = value[l];
    if (text) return text;
  }
  for (const text of Object.values(value)) {
    if (text) return text;
  }
  return "—";
}

/**
 * 編集フォーム用: 保存済みの `{ ja, en, ... }` から「日本語以外」を
 * `Record<言語コード, 値>` として取り出す（`LocalizedTextInput` の多言語
 * ポップアップの初期値）。`localizedInput` が未入力の英語を自動で日本語と
 * 同じ値で埋めるため、**`en` が `ja` と同一なら「未入力だった」とみなして
 * 除く** — そうしないと、翻訳した覚えのない英語欄がポップアップを開くたび
 * 埋まって見える。
 */
export function localizedTranslations(
  value: LocalizedTextInput | null | undefined,
): Record<string, string> {
  if (!value) return {};
  const out: Record<string, string> = {};
  for (const [locale, text] of Object.entries(value)) {
    if (locale === "ja" || !text) continue;
    if (locale === "en" && text === value.ja) continue;
    out[locale] = text;
  }
  return out;
}

/**
 * 端末名（kiosk_devices.name = { ja, en } JSON）を表示文字列にする。
 * 旧データ（文字列のまま）も受け付ける — 移行前後どちらでも壊れない。
 */
export function deviceName(
  value: unknown,
  locale: Locale | string = "ja",
): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value || null;
  if (typeof value === "object") {
    const text = localized(value as LocalizedTextInput, locale);
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
