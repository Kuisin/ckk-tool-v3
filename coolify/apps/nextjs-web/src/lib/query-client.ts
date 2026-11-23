/**
 * query-client.ts — TanStack Query の QueryClient と、鍵の作り方。
 *
 * ★ **TanStack Query を使ってよい場所は狭い。** ページのデータは Server
 *   Component が読み、書き込みは Server Action + `router.refresh()` — ここは
 *   変えない。Query に載せるのは「クライアントが自分で取りに行く読み取り」
 *   だけ: 入力に合わせた検索（SearchSelect / F4）、開いてから読む一覧
 *   （ファイル管理）、定期的な確認（VersionSkewBanner）。一覧・詳細画面の
 *   データを Query へ移さないこと（同じデータの取り方が 2 通りになる）。
 */

import { QueryClient } from "@tanstack/react-query";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 既定は「キャッシュはすぐ出すが、必ず取り直す」。マスタは別の画面で
        // 増えるので、古い結果を正として見せ続けない。
        staleTime: 0,
        // タブへ戻るたびにフォーム上の検索欄が全部取り直しに行くのを止める。
        // 要る場所（VersionSkewBanner）だけが個別に有効にする。
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

let browserClient: QueryClient | undefined;

/**
 * サーバーではリクエストごとに新しく作る（モジュールに持つと別の利用者の
 * 結果が混ざる）。ブラウザでは 1 つを使い回す — レンダーのたびに作ると
 * キャッシュが毎回空になる。
 */
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  browserClient ??= makeQueryClient();
  return browserClient;
}

const fnIds = new WeakMap<object, number>();
let nextFnId = 1;

/**
 * 関数を鍵に入れるための番号。**同じ関数には同じ番号、違う関数には違う番号。**
 *
 * 鍵は JSON として比べられるので、関数をそのまま入れると黙って落ち、別々の
 * 検索（製品と取引先）が同じキャッシュを引いてしまう。Server Action の参照は
 * モジュールで 1 つなので、同じ検索を使う欄どうしは結果を共有できる。
 * 呼び出し側がレンダーごとに作り直した関数（条件を閉じ込めたもの）は毎回
 * 違う番号になる = 取り直す。条件が違う結果を混ぜないための安全側。
 */
export function fnKey(fn: object): number {
  let id = fnIds.get(fn);
  if (id === undefined) {
    id = nextFnId++;
    fnIds.set(fn, id);
  }
  return id;
}
