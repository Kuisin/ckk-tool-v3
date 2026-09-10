/**
 * api-response.ts — 外部 API の成功応答。
 *
 * 一覧は必ず `{ data, page, syncedAt }` の封筒に入れる（`_specs/api.md` §5）。
 * 裸の配列を返さないのは、あとから `page` を足すと**破壊的変更**になるため。
 */

/** 機能が閉じている環境の応答。**problem+json にしない** — 誤り本文を返すと
 *  「その口は在るが今は使えない」と教えることになる。無いものは無いように見せる。 */
export function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

export interface PageInfo {
  /** 次のページを取りに行くための不透明カーソル。最後のページでは null。 */
  nextCursor: string | null;
  hasMore: boolean;
}

export interface Envelope<T> {
  data: T[];
  page: PageInfo;
  /** **DB の時計**。次回の `?updatedSince=` にそのまま渡す（§5）。 */
  syncedAt: string;
}

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

/** 単一資源。 */
export function jsonOk(
  body: unknown,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...JSON_HEADERS, ...extra },
  });
}

/** 一覧（封筒つき）。 */
export function jsonList<T>(
  data: T[],
  page: PageInfo,
  syncedAt: Date,
): Response {
  const body: Envelope<T> = { data, page, syncedAt: syncedAt.toISOString() };
  return jsonOk(body);
}
