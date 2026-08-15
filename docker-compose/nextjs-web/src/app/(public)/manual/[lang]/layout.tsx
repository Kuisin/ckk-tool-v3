/**
 * /manual/[lang] — 公開ユーザーマニュアルのレイアウト（ログイン不要）。
 * proxy.ts の matcher から `manual` プレフィックスを除外して公開している。
 */

import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DocsShell } from "@/components/docs/DocsShell";
import { isDocLang } from "@/lib/docs-i18n";
import { manualSource } from "@/lib/manual-source";

export default async function ManualLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;
  if (!isDocLang(lang)) notFound();
  return (
    <DocsShell
      // 社内ドキュメントは要ログイン — 未ログインで押すとログイン画面へ。
      // リンク先が認証されるので、公開ページに出しても中身は漏れない。
      crossLink={{ text: "社内ドキュメント", url: `/internal-docs/${lang}` }}
      lang={lang}
      searchApi="/manual/search"
      title="CKK マニュアル"
      tree={manualSource.getPageTree(lang)}
    >
      {children}
    </DocsShell>
  );
}
