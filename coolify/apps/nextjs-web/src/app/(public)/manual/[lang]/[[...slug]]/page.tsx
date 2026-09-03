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
import { isDocLang } from "@/lib/docs-i18n";
import { INTL_LOCALES } from "@/lib/i18n";
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

/**
 * マニュアルはログイン不要の公開コンテンツなので、業務書類の詳細ページ
 * （権限チェックが要るため generateMetadata はタイトルのみを返す）とは違い、
 * 標準の Open Graph / Twitter Card を素直に出してよい — Nextcloud の
 * 権限連動プレビュー（lib/link-preview.ts）を経由しなくても、どのチャット/
 * メッセージアプリの標準リンクプレビューでもタイトル・説明・サムネイルが
 * 出る。og:image は `metadata.metadataBase`（app/layout.tsx）で絶対 URL に
 * 解決される。
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { lang, slug } = await params;
  const page = manualSource.getPage(slug, lang);
  if (!page) notFound();

  const title = page.data.title;
  const description = page.data.description;
  const locale = isDocLang(lang)
    ? INTL_LOCALES[lang].replace("-", "_")
    : "ja_JP";
  const images = [
    { url: "/icons/icon-512.png", width: 512, height: 512, alt: title },
  ];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: page.url,
      siteName: "CKK マニュアル", // i18n-ignore — ブランド名の固定表記（layout.tsx の APP_NAME と同じ扱い）
      type: "article",
      locale,
      images,
    },
    twitter: {
      card: "summary",
      title,
      description,
      images,
    },
  };
}
