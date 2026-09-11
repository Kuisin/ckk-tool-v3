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
 *   そのため値を持つフック（`useUrlStringState` / `useUrlSelectState` /
 *   `useTabParam`）は**ローカル state を正**にし、URL は追いかけるだけに
 *   する（戻る/進む・リンク・リセットなど**外から**変わったときだけ取り込む）。
 *   ページ・ソート（`useUrlTableState`）は入力欄ではないので URL のままでよい。
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import {
  type MirroredState,
  NOT_PENDING,
  reconcileMirrored,
  writeMirrored,
} from "@/lib/url-state-core";

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
 *
 * 値はローカル state が正で、URL はその写し（冒頭の ★ を参照）。
 */
export function useUrlStringState(
  key: string,
  defaultValue = "",
  mode: "client" | "server" = "client",
): [string, (v: string | null) => void] {
  const searchParams = useSearchParams();
  const patch = useUrlPatcher(mode);
  const urlValue = searchParams.get(key) ?? defaultValue;
  const [value, sync] = useMirroredState(urlValue);
  const set = useCallback(
    (v: string | null) => {
      const next = v ?? defaultValue;
      sync(next); // 入力欄へは同期で反映（URL の往復を待たない）
      patch({ [key]: next === defaultValue ? null : next, page: null });
    },
    [patch, sync, key, defaultValue],
  );
  return [value, set];
}

/** useUrlStringState の Select 向け別名（null 許容の値をそのまま渡せる）。 */
export function useUrlSelectState(
  key: string,
  mode: "client" | "server" = "client",
): [string | null, (v: string | null) => void] {
  const searchParams = useSearchParams();
  const patch = useUrlPatcher(mode);
  const urlValue = searchParams.get(key);
  const [value, sync] = useMirroredState(urlValue);
  const set = useCallback(
    (v: string | null) => {
      sync(v);
      patch({ [key]: v, page: null });
    },
    [patch, sync, key],
  );
  return [value, set];
}

/**
 * 「自分で書いた値」と「外から変わった URL」を両立させる小さな state。
 * 判定そのものは `lib/url-state-core.ts`（純ロジック・試験あり）が持つ。
 *
 * - `sync(v)` … 自分の更新。**そのレンダーで即座に** `v` になる（URL の
 *   往復を待たない）。同時に「URL が v になるのを待っている」印を立てる。
 * - 待っている間に届く `source` は打鍵前の古い値なので無視する。
 * - 追いついたら印を下ろし、以後の `source` の変化は外からの変更として取り込む。
 *
 * レンダー中の setState は React 公式の「外の値が変わったら state を調整する」
 * パターン。安定したら `reconcileMirrored` が同じ参照を返すので追加の
 * レンダーは起きない。
 */
function useMirroredState<T>(source: T): [T, (v: T) => void] {
  const [state, setState] = useState<MirroredState<T>>(() => ({
    value: source,
    pending: NOT_PENDING,
  }));
  const next = reconcileMirrored(state, source);
  if (next !== state) setState(next);
  const sync = useCallback((v: T) => setState(writeMirrored(v)), []);
  return [next.value, sync];
}

/**
 * 詳細画面のアクティブタブを `?tab=` に保持: [tab, setTab]。
 * Mantine Tabs の value/onChange にそのまま渡す。既定タブは URL から省略。
 *
 * 値はローカル state が正で、URL はその写し（冒頭の ★ を参照） — URL からだけ
 * 読むと、タブを押してから切り替わるまで 1 トランジション遅れる。
 */
export function useTabParam(
  defaultTab: string,
  key = "tab",
): [string, (v: string | null) => void] {
  const searchParams = useSearchParams();
  const patch = useUrlPatcher();
  const urlTab = searchParams.get(key) ?? defaultTab;
  const [tab, sync] = useMirroredState(urlTab);
  const setTab = useCallback(
    (v: string | null) => {
      sync(v ?? defaultTab);
      patch({ [key]: !v || v === defaultTab ? null : v });
    },
    [patch, sync, key, defaultTab],
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
export function useUrlTableState(
  mode: "client" | "server" = "client",
): UrlTableState {
  const searchParams = useSearchParams();
  const patch = useUrlPatcher(mode);

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
