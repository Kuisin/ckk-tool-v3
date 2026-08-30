/**
 * table-settings-core.ts — 一覧表の「表示する列」を個人ごとに覚えるための
 * キーと値の決め方（純関数）。
 *
 * 保存先は app.user_view_settings（1 行 = 1 ユーザー × 1 キー）。**端末ではなく
 * DB に置く** — localStorage だと会社の PC で隠した列がタブレットでは出たままに
 * なり、「設定したのに直っていない」に見える。
 */

/** user_view_settings のキー接頭辞。まとめ読みにも使う。 */
export const TABLE_SETTING_PREFIX = "table.";

/** 1 つの表で覚えられる列数の上限（無制限に貯めない）。 */
const MAX_HIDDEN = 100;
const MAX_KEY_LENGTH = 160;

/**
 * 画面のパスを、**レコードによらない**形にする。
 *
 * `/sales/quotes/QOT-202608-00001` と `/sales/quotes/QOT-202608-00002` は
 * 同じ画面なので同じ設定を使いたい。数字を含む区切りは「その 1 件」を指す値
 * （番号・uuid・短縮コード）とみなして `*` に潰す。マスタの静的なパスに数字は
 * 使っていないので、これで十分に効く。
 */
export function normalizeTablePath(pathname: string): string {
  return (
    pathname
      .split("/")
      .filter(Boolean)
      .map((seg) => (/\d/.test(seg) ? "*" : seg))
      .join("/") || "home"
  );
}

/**
 * 表 1 つぶんの保存キー。
 *
 * 既定は画面のパスだけ — 1 画面に表が 1 つなら呼び出し側は何もしなくてよい。
 * 同じ画面に表が 2 つ以上あるときは、呼び出し側が `settingsKey` を渡して
 * 区別する（渡さないと 2 つの表が同じ設定を共有してしまう）。
 */
export function tableSettingKey(
  pathname: string,
  settingsKey?: string,
): string {
  const base = normalizeTablePath(pathname);
  const suffix = settingsKey ? `#${settingsKey}` : "";
  return `${TABLE_SETTING_PREFIX}${base}${suffix}`.slice(0, MAX_KEY_LENGTH);
}

/** 受け取ったキーが自分たちの形か（保存の入口で確かめる）。 */
export function isTableSettingKey(key: string): boolean {
  return (
    key.startsWith(TABLE_SETTING_PREFIX) &&
    key.length <= MAX_KEY_LENGTH &&
    /^[\w\-/*.#:]+$/.test(key)
  );
}

/**
 * 保存された値（`{ hidden: string[] }`）を正規化する。
 *
 * **知らない列 id も捨てない** — 表の列は画面ごとに違い、ここでは判断できない。
 * 実際に表示するときに「今ある列」と突き合わせるので、余分な id は無害。
 * 列名を変えたときに設定が消えるより、残しておくほうが害が少ない。
 */
export function sanitizeHiddenColumns(raw: unknown): string[] {
  const list =
    typeof raw === "object" && raw !== null && "hidden" in raw
      ? (raw as { hidden: unknown }).hidden
      : raw;
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const v of list) {
    if (typeof v !== "string" || v.length === 0 || v.length > 64) continue;
    if (out.includes(v)) continue;
    out.push(v);
    if (out.length >= MAX_HIDDEN) break;
  }
  return out;
}
