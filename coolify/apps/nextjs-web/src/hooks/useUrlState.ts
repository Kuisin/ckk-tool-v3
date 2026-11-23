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
 *
 * 実装は **nuqs**（`useQueryStates`）。このファイルは nuqs の薄い包みで、
 * 画面はこのフックだけを使う（nuqs を直接呼ばない）— 「フィルタを変えたら
 * 1 ページ目へ戻す」「既定値は URL から落とす」という約束を 1 か所に置くため。
 * URL の書式（`?q=` `?page=` `?size=` `?sort=key.dir` `?tab=`）は共有リンクに
 * 残っているので、パーサは下の定義から変えないこと。
 *
 * ★ **URL は「写し」であって、入力欄の値そのものではない。**
 *   `useSearchParams()` の更新は**同期ではない** — Next.js はネイティブの
 *   history 更新を `startTransition` の中で router へ流す（app-router.tsx の
 *   `applyUrlFromHistoryPushReplace`）ので、`replaceState` を呼んだ直後の
 *   レンダーはまだ**古い値**を返す。値を URL からだけ読むと、制御された
 *   `<input>` は 1 打ごとに「古い値を DOM へ書き戻す」ことになり、
 *   **日本語入力（IME）の変換中の文字列が壊れる** — ブラウザの変換範囲が
 *   潰され、以降の変換候補が置換ではなく**追記**になる。
 *   「あさひ」と打つと「ああさあさひ朝日」になった（2026-09-11、取引先 MS01
 *   の検索欄で発覚。同じ欄が一覧 35 画面にある）。ローマ字はたまたま無事に
 *   見えるが、これは打鍵が 1 文字ずつ確定するからで、直っているわけではない。
 *   そのため値は **nuqs の内部 state を正**にする — nuqs は set した値を
 *   同じレンダーで返し、URL への反映（と `useSearchParams` の追いつき）を
 *   待たない。戻る/進む・リンクなど**外から**の変化だけを取り込む。
 *   以前は同じことを自前の `lib/url-state-core.ts` でやっていた。
 *   **`useSearchParams()` を入力欄の value に直結する形へ戻さないこと。**
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createParser, parseAsString, useQueryStates } from "nuqs";
import { useCallback, useMemo } from "react";
import {
  pageParam,
  type SortState,
  sizeParam,
  sortParam,
} from "@/lib/url-state-params";

type Mode = "client" | "server";

/**
 * nuqs の共通オプション。
 * - `history: "replace"` — フィルタの 1 打ごとに履歴を積まない。
 * - `scroll: false` — 絞り込みで画面を先頭へ飛ばさない。
 * - `shallow` — client はサーバー往復なし / server は RSC を取り直す。
 * 既定値と同じ値は nuqs が URL から落とす（`clearOnDefault` の既定）。
 */
function optionsFor(mode: Mode) {
  return {
    history: "replace",
    scroll: false,
    shallow: mode !== "server",
  } as const;
}

const pageParser = createParser(pageParam).withDefault(1);
const sizeParser = createParser(sizeParam);
const sortParser = createParser(sortParam);
/** フィルタ側が「1 ページ目へ戻す」ためだけに持つ鍵（値は読まない）。 */
const pageResetParser = parseAsString;

export type UrlPatch = Record<string, string | null | undefined>;

/** search params の差分更新関数を返す。null/undefined/"" のキーは削除。 */
export function useUrlPatcher(mode: Mode = "client") {
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
  mode: Mode = "client",
): [string, (v: string | null) => void] {
  const keyMap = useMemo(
    () => ({
      value: parseAsString.withDefault(defaultValue),
      page: pageResetParser,
    }),
    [defaultValue],
  );
  const urlKeys = useMemo(() => ({ value: key }), [key]);
  const [state, setState] = useQueryStates(keyMap, {
    ...optionsFor(mode),
    urlKeys,
  });
  const set = useCallback(
    (v: string | null) => {
      // 値とページのリセットは 1 回の URL 更新で行う（別々に書くと、間の
      // URL が「新しい条件の 3 ページ目」になり、server モードで空振りする）。
      void setState({ value: v ?? defaultValue, page: null });
    },
    [setState, defaultValue],
  );
  return [state.value, set];
}

/** useUrlStringState の Select 向け別名（null 許容の値をそのまま渡せる）。 */
export function useUrlSelectState(
  key: string,
  mode: Mode = "client",
): [string | null, (v: string | null) => void] {
  const urlKeys = useMemo(() => ({ value: key }), [key]);
  const [state, setState] = useQueryStates(SELECT_KEY_MAP, {
    ...optionsFor(mode),
    urlKeys,
  });
  const set = useCallback(
    (v: string | null) => {
      // "" は「未選択」— `?key=` を残さず鍵ごと落とす。
      void setState({ value: v === "" ? null : v, page: null });
    },
    [setState],
  );
  return [state.value, set];
}

const SELECT_KEY_MAP = { value: parseAsString, page: pageResetParser };

/**
 * 詳細画面のアクティブタブを `?tab=` に保持: [tab, setTab]。
 * Mantine Tabs の value/onChange にそのまま渡す。既定タブは URL から省略。
 */
export function useTabParam(
  defaultTab: string,
  key = "tab",
): [string, (v: string | null) => void] {
  const keyMap = useMemo(
    () => ({ tab: parseAsString.withDefault(defaultTab) }),
    [defaultTab],
  );
  const urlKeys = useMemo(() => ({ tab: key }), [key]);
  const [state, setState] = useQueryStates(keyMap, {
    ...optionsFor("client"),
    urlKeys,
  });
  const setTab = useCallback(
    (v: string | null) => {
      void setState({ tab: v || null });
    },
    [setState],
  );
  return [state.tab, setTab];
}

export interface UrlTableState {
  page: number;
  pageSize: number | null; // null = 呼び出し側の既定
  sort: SortState | null;
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
  setSort: (s: SortState | null) => void;
}

const TABLE_KEY_MAP = { page: pageParser, size: sizeParser, sort: sortParser };

/**
 * DataTable のページ・ページサイズ・ソートを URL に保持
 * （`?page=2&size=50&sort=updatedAt.desc`）。既定値はパラメータ省略。
 */
export function useUrlTableState(mode: Mode = "client"): UrlTableState {
  const [state, setState] = useQueryStates(TABLE_KEY_MAP, optionsFor(mode));

  const setPage = useCallback(
    (p: number) => void setState({ page: p <= 1 ? null : p }),
    [setState],
  );
  const setPageSize = useCallback(
    (s: number) => void setState({ size: s, page: null }),
    [setState],
  );
  const setSort = useCallback(
    (s: SortState | null) => void setState({ sort: s }),
    [setState],
  );

  return {
    page: state.page,
    pageSize: state.size,
    sort: state.sort,
    setPage,
    setPageSize,
    setSort,
  };
}
