"use server";

/**
 * docs/actions.ts — マニュアル検索のサーバーアクション。
 * クライアントの検索モーダル（DocsSearch）からデバウンス付きで呼ぶ。
 */

import { type DocSearchResult, searchDocs } from "@/lib/docs-search";
import { type DocLang, isDocLang } from "@/lib/docs-tree";

export async function searchDocsAction(
  query: string,
  lang: string,
): Promise<DocSearchResult[]> {
  const l: DocLang = isDocLang(lang) ? lang : "ja";
  return searchDocs(query, l);
}
