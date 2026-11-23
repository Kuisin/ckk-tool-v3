/**
 * /llms-manual/[lang]/[[...slug]] — 公開マニュアルの生 Markdown 配信。
 *
 * next.config.ts の rewrites で /manual/:lang/:slug*.md がここへ写像される
 * （proxy.ts でも llms-manual を公開除外している）。manualSource のみ import
 * 可 — 管理マニュアルの生 Markdown 配信は存在しない。
 */

import { notFound } from "next/navigation";
import { restoreMermaidFences } from "@/lib/docs-mermaid";
import { manualSource } from "@/lib/manual-source";

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lang: string; slug?: string[] }> },
): Promise<Response> {
  const { lang, slug } = await params;
  const page = manualSource.getPage(slug, lang);
  if (!page) notFound();

  // 図は `<Mermaid chart="…" />` に置き換わった後の姿で来るので、フェンスへ戻す。
  const md = restoreMermaidFences(await page.data.getText("processed"));
  return new Response(md, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export function generateStaticParams() {
  return manualSource.generateParams("slug", "lang");
}
