/**
 * api-dto.ts — 応答に載せる値の作り方（純粋）。
 *
 * 画面用のマッパー（各画面の `data.ts`）は**そのままでは使えない**。
 * あちらは `localized()` で閲覧者の言語に解決し、enum をラベルに直し、日付を
 * 利用者ごとの書式にする。API に閲覧者は居ないので、どれも間違いになる。
 *
 * ここでの約束（`_specs/api.md` §6）:
 *   識別子   … 書類番号（画面・印刷 QR と同じ公開識別子）
 *   状態     … DB の enum 値そのまま（日本語ラベルは返さない）
 *   多言語列 … `{ ja, en, … }` の生 JSON
 *   日時     … RFC 3339 UTC
 *   金額     … 数値（文字列にしない）
 */

/** Prisma Decimal / number / null → number | null。 */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  // Prisma の Decimal は toString() を持つ
  const n = Number(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Date → RFC 3339 UTC（null 安全）。 */
export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/**
 * 多言語 JSON をそのまま返す。**`localized()` を通さない。**
 * 形が違う（文字列が入っている等）ときは `{ ja: <その文字列> }` に寄せる —
 * 呼び出し側が常に同じ形を扱えるように。
 */
export function localizedJson(v: unknown): Record<string, string> | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return { ja: v };
  if (typeof v === "object") {
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
    }
    return Object.keys(out).length > 0 ? out : null;
  }
  return null;
}

/** 日付だけの列（date 型）は時刻を持たないので、日付部分だけ返す。 */
export function dateOnly(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
