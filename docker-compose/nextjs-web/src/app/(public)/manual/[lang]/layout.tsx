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
      lang={lang}
      searchApi="/manual/search"
      title="CKK マニュアル"
      tree={manualSource.getPageTree(lang)}
    >
      {children}
    </DocsShell>
  );
}
