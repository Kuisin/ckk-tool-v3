/**
 * /manual/[lang]/[[...slug]] — 公開ユーザーマニュアルのページ。
 * ビルド時 SSG（コンテンツはビルド時にコンパイル済み）。
 */

import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { docsMdxComponents } from "@/components/docs/mdx-components";
import { manualSource } from "@/lib/manual-source";

interface Params {
  params: Promise<{ lang: string; slug?: string[] }>;
}

export default async function ManualPage({ params }: Params) {
  const { lang, slug } = await params;
  const page = manualSource.getPage(slug, lang);
  if (!page) notFound();

  const MDX = page.data.body;
  return (
    <DocsPage full={page.data.full} toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={docsMdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return manualSource.generateParams("slug", "lang");
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { lang, slug } = await params;
  const page = manualSource.getPage(slug, lang);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}
