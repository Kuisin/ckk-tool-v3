"use client";

/**
 * useUrlState — 画面状態（検索・フィルタ・ページ・ソート・タブ）を URL search
 * params に保持する共通フック（design.md §8.1 / ページ共有機能の前提）。
 *
 * 2 つの更新モード:
 * - client（既定）: `window.history.replaceState` — サーバー往復なし。
 *   一覧のクライアントサイドフィルタ/ページング向け（キーストローク毎でも軽い）。
 *   Next.js App Router はネイティブ history 更新を useSearchParams に同期する。
 * - server: `router.replace` — RSC 再取得あり。サーバーサイドページングの
 *   画面（通知一覧など）向け。
 *
 * 規約: 既定値と同じ状態はパラメータを削除して URL を短く保つ。
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export type UrlPatch = Record<string, string | null | undefined>;

/** search params の差分更新関数を返す。null/undefined/"" のキーは削除。 */
export function useUrlPatcher(mode: "client" | "server" = "client") {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (patch: UrlPatch) => {
      // 連続呼び出し（リセット等）でも取りこぼさないよう、フックのスナップ
      // ショットではなく現在の window.location.search を起点にする。
      const base =
        typeof window !== "undefined"
          ? window.location.search
          : searchParams.toString();
      const next = new URLSearchParams(base);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, v);
      }
      const q = next.toString();
      const url = q ? `${pathname}?${q}` : pathname;
      if (mode === "server") {
        router.replace(url, { scroll: false });
      } else {
        window.history.replaceState(null, "", url);
      }
    },
    [router, pathname, searchParams, mode],
  );
}

/**
 * 文字列 1 値を URL param に保持: [value, set]。
 * set はフィルタ変更として扱い、常にページ番号（`page`）をリセットする。
 * 検索テキスト・Select フィルタ用（クリアは null/""）。
 */
export function useUrlStringState(
  key: string,
  defaultValue = "",
): [string, (v: string | null) => void] {
  const searchParams = useSearchParams();
  const patch = useUrlPatcher();
  const value = searchParams.get(key) ?? defaultValue;
  const set = useCallback(
    (v: string | null) => {
      patch({ [key]: v === defaultValue ? null : v, page: null });
    },
    [patch, key, defaultValue],
  );
  return [value, set];
}

/** useUrlStringState の Select 向け別名（null 許容の値をそのまま渡せる）。 */
export function useUrlSelectState(
  key: string,
): [string | null, (v: string | null) => void] {
  const searchParams = useSearchParams();
  const patch = useUrlPatcher();
  const value = searchParams.get(key);
  const set = useCallback(
    (v: string | null) => patch({ [key]: v, page: null }),
    [patch, key],
  );
  return [value, set];
}

/**
 * 詳細画面のアクティブタブを `?tab=` に保持: [tab, setTab]。
 * Mantine Tabs の value/onChange にそのまま渡す。既定タブは URL から省略。
 */
export function useTabParam(
  defaultTab: string,
  key = "tab",
): [string, (v: string | null) => void] {
  const searchParams = useSearchParams();
  const patch = useUrlPatcher();
  const tab = searchParams.get(key) ?? defaultTab;
  const setTab = useCallback(
    (v: string | null) => {
      patch({ [key]: !v || v === defaultTab ? null : v });
    },
    [patch, key, defaultTab],
  );
  return [tab, setTab];
}

export interface UrlTableState {
  page: number;
  pageSize: number | null; // null = 呼び出し側の既定
  sort: { key: string; dir: "asc" | "desc" } | null;
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
  setSort: (s: { key: string; dir: "asc" | "desc" } | null) => void;
}

/**
 * DataTable のページ・ページサイズ・ソートを URL に保持
 * （`?page=2&size=50&sort=updatedAt.desc`）。既定値はパラメータ省略。
 */
export function useUrlTableState(): UrlTableState {
  const searchParams = useSearchParams();
  const patch = useUrlPatcher();

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const sizeRaw = Number(searchParams.get("size"));
  const pageSize = Number.isFinite(sizeRaw) && sizeRaw > 0 ? sizeRaw : null;
  const sortRaw = searchParams.get("sort");
  let sort: UrlTableState["sort"] = null;
  if (sortRaw) {
    const idx = sortRaw.lastIndexOf(".");
    const key = idx > 0 ? sortRaw.slice(0, idx) : sortRaw;
    const dir = sortRaw.slice(idx + 1);
    sort = { key, dir: dir === "desc" ? "desc" : "asc" };
  }

  const setPage = useCallback(
    (p: number) => patch({ page: p <= 1 ? null : String(p) }),
    [patch],
  );
  const setPageSize = useCallback(
    (s: number) => patch({ size: String(s), page: null }),
    [patch],
  );
  const setSort = useCallback(
    (s: { key: string; dir: "asc" | "desc" } | null) =>
      patch({ sort: s ? `${s.key}.${s.dir}` : null }),
    [patch],
  );

  return { page, pageSize, sort, setPage, setPageSize, setSort };
}
