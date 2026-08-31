/**
 * metabase-embed.ts — 環境設定を読んで埋め込み URL を作る薄い層。server-only.
 *
 * 未設定なら null を返して**静かに落ちる**（DEVICE_SIGNALS_SECRET と同じ姿勢）。
 * ここで例外にすると、Metabase を使っていない環境でディスプレイ全体が
 * 落ちてしまう — 影響範囲は「その 1 台のその表示だけ」に留める。
 */

import type { MetabaseConfig } from "./display-content";
import { buildMetabaseEmbedUrl } from "./metabase-embed-core";

export function metabaseConfigured(): boolean {
  return Boolean(
    process.env.METABASE_SITE_URL && process.env.METABASE_EMBED_SECRET,
  );
}

/** 署名済みの埋め込み URL。未設定なら null（画面は設定を促す表示になる）。 */
export function metabaseEmbedUrl(config: MetabaseConfig): string | null {
  const siteUrl = process.env.METABASE_SITE_URL;
  const secret = process.env.METABASE_EMBED_SECRET;
  if (!siteUrl || !secret) return null;
  return buildMetabaseEmbedUrl({
    siteUrl,
    secret,
    dashboardId: config.dashboardId,
    params: config.params,
  });
}
