/**
 * metabase-embed-core.ts — Metabase 静的埋め込みの署名（純ロジック）。
 *
 * Metabase の「埋め込み」は、ダッシュボード id と**ロックされたパラメータ**を
 * HS256 の JWT に入れ、`/embed/dashboard/<jwt>` を iframe で開く方式。
 * 署名鍵は Metabase 側の MB_EMBEDDING_SECRET_KEY と同じ値。
 *
 * ライブラリを足していないのは、必要なのが「HMAC-SHA256 と base64url」
 * だけだから（検証も更新もしない — こちらは発行専用）。同じ判断の前例が
 * ws-auth.ts / attest-core.ts にある。
 *
 * ★ パラメータは**呼び出し側の DB 設定からのみ**渡すこと。リクエストから
 *   受け取ると、壁のディスプレイから他拠点のデータを覗けてしまう。
 *   併せて Metabase 側でもそのパラメータを locked に設定する必要がある
 *   （locked でないと JWT の値が単なる初期値になり、URL で上書きできる）。
 */

import { createHmac } from "node:crypto";

export type MetabaseEmbedParams = Record<string, string | number>;

export type MetabaseEmbedInput = {
  siteUrl: string;
  secret: string;
  dashboardId: number;
  params?: MetabaseEmbedParams;
  /** トークンの寿命（秒）。既定 10 分 — 画面が引き直すたびに作り直す。 */
  expiresInSec?: number;
  /** 署名時刻（ms）。テストのために注入可能にしてある。 */
  nowMs?: number;
};

export const DEFAULT_EMBED_TTL_SEC = 600;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** HS256 の JWT を 1 本作る。 */
export function signMetabaseToken(input: MetabaseEmbedInput): string {
  const now = input.nowMs ?? Date.now();
  const exp =
    Math.floor(now / 1000) + (input.expiresInSec ?? DEFAULT_EMBED_TTL_SEC);

  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      resource: { dashboard: input.dashboardId },
      params: input.params ?? {},
      exp,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", input.secret)
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

/**
 * 埋め込み用の完全な URL。ハッシュ部分は Metabase の表示オプションで、
 * ディスプレイ向けに枠・題・操作を全部落とす（誰も触らない画面なので、
 * 押せるものが出ていると誤操作の余地しか生まない）。
 */
export function buildMetabaseEmbedUrl(input: MetabaseEmbedInput): string {
  const token = signMetabaseToken(input);
  const base = input.siteUrl.replace(/\/+$/, "");
  return `${base}/embed/dashboard/${token}#bordered=false&titled=false&refresh=60`;
}
