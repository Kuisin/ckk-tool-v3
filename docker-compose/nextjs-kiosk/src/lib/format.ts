/**
 * format.ts — 日付・多言語 JSON の整形（JST 固定）。
 *
 * コンテナは UTC で動く（Dockerfile に TZ 指定なし）ので、「今日」や
 * 日付のみの列（@db.Date）は必ず JST を明示して組み立てる。
 * nextjs-web の同名モジュールの必要分だけを移植（zh フォールバックを追加）。
 */

import type { Locale } from "./i18n";

const TOKYO_TIME = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const TOKYO_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Date → `HH:mm`（JST）。null は null のまま返す。 */
export function formatTime(d: Date | null | undefined): string | null {
  return d ? TOKYO_TIME.format(d) : null;
}

/** Date → `YYYY-MM-DD`（JST）。 */
export function jstDateString(d: Date): string {
  return TOKYO_DATE.format(d); // en-CA は ISO 形式（YYYY-MM-DD）
}

/**
 * その瞬間の JST 日付の 00:00+09:00 を表す Date。
 * `@db.Date` 列（planned_date / worked_date）への書き込みと日付比較に使う。
 */
export function jstDateOnly(d: Date): Date {
  return new Date(`${jstDateString(d)}T00:00:00+09:00`);
}

/** { ja, en } DB JSON field (_specs/design.md §17.4)。 */
export type LocalizedText = { ja: string; en: string };

/** 表示側フォールバック: 現在ロケール → ja → en → '—'。 */
export function localized(
  value: LocalizedText | null | undefined,
  locale: Locale = "ja",
): string {
  if (!value) return "—";
  // zh はマスタ JSON に無い（ja/en の 2 言語のみ）ので ja へフォールバック
  const primary = locale === "zh" ? value.ja : value[locale];
  return primary || value.ja || value.en || "—";
}
