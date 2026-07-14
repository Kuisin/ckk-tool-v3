/**
 * recents.ts — 「最近使用した値」の localStorage 永続化 (SearchSelect 用).
 *
 * key ごとに {value,label} を最大 MAX_RECENTS 件、新しい順で保持する。
 * storage を注入可能にしてユニットテストできる純関数として実装。
 */

export interface RecentOption {
  value: string;
  label: string;
}

export const MAX_RECENTS = 5;

const PREFIX = "ckk:recents:";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null; // storage disabled (private mode etc.)
  }
}

/** key の最近使用リスト（新しい順）。壊れた JSON は空扱い。 */
export function readRecents(
  key: string,
  storage: StorageLike | null = defaultStorage(),
): RecentOption[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(PREFIX + key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is RecentOption =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as RecentOption).value === "string" &&
          typeof (r as RecentOption).label === "string",
      )
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

/** 選択された option を先頭に積む（重複は除去、MAX_RECENTS 件で切る）。 */
export function pushRecent(
  key: string,
  option: RecentOption,
  storage: StorageLike | null = defaultStorage(),
): RecentOption[] {
  const next = [
    option,
    ...readRecents(key, storage).filter((r) => r.value !== option.value),
  ].slice(0, MAX_RECENTS);
  try {
    storage?.setItem(PREFIX + key, JSON.stringify(next));
  } catch {
    // quota / private mode — recents are best-effort
  }
  return next;
}
