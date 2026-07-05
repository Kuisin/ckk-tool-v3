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

/** ISO date(-time) → `yyyy/MM/dd` */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const s = iso instanceof Date ? iso.toISOString() : iso;
  return s.slice(0, 10).replace(/-/g, "/");
}

/** ISO timestamp → `yyyy/MM/dd HH:mm` */
export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const s = iso instanceof Date ? iso.toISOString() : iso;
  const [d, t = ""] = s.split(/[ T]/);
  return `${d.replace(/-/g, "/")} ${t.slice(0, 5)}`.trim();
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
