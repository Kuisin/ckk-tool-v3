import "server-only";

/**
 * docs.ts — /docs マニュアルの Markdown 読み出し（サーバー専用）。
 *
 * ツリー定義・型は client-safe な lib/docs-tree.ts に分離（サイドバー等が参照）。
 * ここは fs 読み出しを行うためランタイムで next.config.ts の
 * outputFileTracingIncludes に content/docs を含める。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { type DocLang, type DocPage, findDocPage } from "./docs-tree";
import { renderMarkdown } from "./markdown";

export * from "./docs-tree";

const DOCS_DIR = path.join(process.cwd(), "src", "content", "docs");

export interface DocContent {
  page: DocPage;
  /** 実際に読めた言語（要求言語が無ければ ja→en の順でフォールバック）。 */
  lang: DocLang;
  html: string;
}

/** slug + lang の Markdown を HTML で返す。見つからなければ null。 */
export async function readDoc(
  slug: string,
  lang: DocLang,
): Promise<DocContent | null> {
  const page = findDocPage(slug);
  if (!page) return null;
  const base = path.join(DOCS_DIR, ...slug.split("/"));
  const order: DocLang[] = [lang, "ja", "en"];
  for (const l of order) {
    try {
      const md = await readFile(path.join(base, `${l}.md`), "utf8");
      return { page, lang: l, html: renderMarkdown(md, l) };
    } catch {
      // try next fallback language
    }
  }
  return null;
}
