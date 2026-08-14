/**
 * /internal-docs/[lang] — 社内ドキュメントのレイアウト（要ログイン）。
 *
 * 認証は二重: proxy.ts の matcher が /internal-docs を包含（未ログインは
 * /login へリダイレクト）+ このレイアウトでのサーバー側セッション確認
 * （防御の深層化 — matcher の回帰でも公開されない）。
 */

import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { DocsShell } from "@/components/docs/DocsShell";
import { isDocLang } from "@/lib/docs-i18n";
import { internalSource } from "@/lib/internal-source";

export const dynamic = "force-dynamic";

export default async function InternalDocsLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { lang } = await params;
  if (!isDocLang(lang)) notFound();
  return (
    <DocsShell
      lang={lang}
      searchApi="/internal-docs/search"
      title="CKK 社内ドキュメント"
      tree={internalSource.getPageTree(lang)}
    >
      {children}
    </DocsShell>
  );
}
