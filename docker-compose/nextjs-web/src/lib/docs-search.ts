import "server-only";

/**
 * docs-search.ts — /docs マニュアルの全文検索インデックス（サーバー専用）。
 *
 * DOCS_TREE の全ページ × 全言語の Markdown を読み、プレーンテキスト化して
 * モジュールレベルにキャッシュする。検索はサーバーアクション（docs/actions.ts）
 * から呼ぶ。依存追加なし（frozen lockfile）＝自前の軽量スコアリング。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { DOCS_LANGS, DOCS_TREE, type DocLang } from "./docs-tree";

const DOCS_DIR = path.join(process.cwd(), "src", "content", "docs");

export interface DocSearchResult {
  slug: string;
  lang: DocLang;
  title: string;
  /** マッチ箇所の抜粋（前後の文脈つき）。 */
  snippet: string;
}

interface IndexRecord {
  slug: string;
  lang: DocLang;
  title: string;
  /** 見出しテキスト（重み高め）。 */
  headings: string;
  /** 本文プレーンテキスト。 */
  text: string;
  /** 小文字化した検索対象（title + headings + text）。 */
  haystack: string;
}

/** Markdown をプレーンテキスト化（見出し記号・装飾・リンクを除去）。 */
function stripMarkdown(md: string): { headings: string; text: string } {
  const headings: string[] = [];
  const body: string[] = [];
  let inFence = false;
  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      body.push(raw);
      continue;
    }
    const h = raw.match(/^#{1,6}\s+(.*)$/);
    const line = (h ? h[1] : raw)
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^\s*>\s?/, "")
      .replace(/^\s*[-*]\s+/, "")
      .replace(/^\s*\d+\.\s+/, "")
      .trim();
    if (!line) continue;
    if (h) headings.push(line);
    else body.push(line);
  }
  return { headings: headings.join(" 　 "), text: body.join(" ") };
}

let cache: Promise<IndexRecord[]> | null = null;

async function buildIndex(): Promise<IndexRecord[]> {
  const pages = DOCS_TREE.flatMap((s) => s.pages);
  const records: IndexRecord[] = [];
  for (const page of pages) {
    for (const lang of DOCS_LANGS) {
      try {
        const md = await readFile(
          path.join(DOCS_DIR, ...page.slug.split("/"), `${lang}.md`),
          "utf8",
        );
        const { headings, text } = stripMarkdown(md);
        const title = page.title[lang] ?? page.title.ja;
        records.push({
          slug: page.slug,
          lang,
          title,
          headings,
          text,
          haystack: `${title} 　 ${headings} 　 ${text}`.toLowerCase(),
        });
      } catch {
        // その言語のファイルが無ければスキップ
      }
    }
  }
  return records;
}

function getIndex(): Promise<IndexRecord[]> {
  if (!cache) cache = buildIndex();
  return cache;
}

/** クエリの前後を切り出したスニペットを作る。 */
function makeSnippet(rec: IndexRecord, needle: string): string {
  const src = rec.text || rec.headings;
  if (!needle) return src.slice(0, 120);
  const idx = src.toLowerCase().indexOf(needle);
  if (idx < 0) return src.slice(0, 120);
  const start = Math.max(0, idx - 50);
  const end = Math.min(src.length, idx + needle.length + 70);
  return `${start > 0 ? "…" : ""}${src.slice(start, end)}${end < src.length ? "…" : ""}`;
}

/**
 * マニュアル全文検索。指定言語を優先し、無ければ全言語から拾う。
 * スコア: タイトル一致 > 見出し一致 > 本文一致、複数語は AND。
 */
export async function searchDocs(
  query: string,
  lang: DocLang,
  limit = 8,
): Promise<DocSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const index = await getIndex();

  const scored = index
    .filter((r) => r.lang === lang)
    .map((r) => {
      let score = 0;
      for (const t of terms) {
        if (!r.haystack.includes(t)) return { r, score: -1 };
        if (r.title.toLowerCase().includes(t)) score += 10;
        if (r.headings.toLowerCase().includes(t)) score += 4;
        if (r.text.toLowerCase().includes(t)) score += 1;
      }
      return { r, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ r }) => ({
    slug: r.slug,
    lang: r.lang,
    title: r.title,
    snippet: makeSnippet(r, terms[0]),
  }));
}
