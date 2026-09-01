/**
 * /admin-manual/[lang] — 管理マニュアルのレイアウト（要ログイン + 権限）。
 *
 * 認証は三重: proxy.ts の matcher が /admin-manual を包含（未ログインは
 * /login へリダイレクト）+ このレイアウトでのセッション確認 + `admin_manual`
 * 権限の確認。ランチャー（DC02）を隠すだけでは URL 直打ちで開けてしまうため、
 * ルート側でも必ず権限を見る。公開マニュアル（DC01）とは別権限。
 */

import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { DocsShell } from "@/components/docs/DocsShell";
import { checkPermission } from "@/lib/authz";
import { isDocLang } from "@/lib/docs-i18n";
import { internalSource } from "@/lib/internal-source";
import { getTr } from "@/lib/ui-text-server";

export const dynamic = "force-dynamic";

export default async function InternalDocsLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const tr = await getTr();
  const session = await auth();
  if (!session?.user) redirect("/login");
  const authz = await checkPermission("admin_manual", "READ");
  if (!authz.ok) notFound();

  const { lang } = await params;
  if (!isDocLang(lang)) notFound();
  return (
    <DocsShell
      crossLink={{ text: tr("マニュアル"), url: `/manual/${lang}` }}
      lang={lang}
      searchApi="/admin-manual/search"
      title={tr("CKK 管理マニュアル")}
      tree={internalSource.getPageTree(lang)}
    >
      {children}
    </DocsShell>
  );
}
