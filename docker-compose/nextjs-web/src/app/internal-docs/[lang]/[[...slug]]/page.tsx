/**
 * /internal-docs/[lang]/[[...slug]] — 社内ドキュメントのページ。
 * generateStaticParams なし（動的レンダー）— レイアウトの auth() を常に通す。
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
import { internalSource } from "@/lib/internal-source";

interface Params {
  params: Promise<{ lang: string; slug?: string[] }>;
}

export default async function InternalDocsPage({ params }: Params) {
  const { lang, slug } = await params;
  const page = internalSource.getPage(slug, lang);
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

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { lang, slug } = await params;
  const page = internalSource.getPage(slug, lang);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}
