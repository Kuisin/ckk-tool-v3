/**
 * / — ランチャー（要ログイン）。
 *
 * サーバー側でセッションを本検証（期限・アイドル・失効）し、ユーザーの
 * 権限で表示アプリをフィルタしてクライアントシェルへ渡す。
 */

import { redirect } from "next/navigation";
import { I18nProvider } from "@/components/I18nProvider";
import { LauncherShell } from "@/components/LauncherShell";
import { visibleApps } from "@/lib/app-list";
import { readableCodes } from "@/lib/authz";
import { getMessages } from "@/lib/i18n";
import { getSession } from "@/lib/kiosk-auth";

export const dynamic = "force-dynamic";

export default async function LauncherPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const codes = await readableCodes(session.userId);
  const m = getMessages(session.locale);
  const apps = visibleApps(codes).map((app) => ({
    key: app.key,
    label: m.apps[app.labelKey],
    href: app.href,
  }));

  // QR ログイン後はユーザーの言語（users.locale）で描画（ログイン前は日本語固定）
  return (
    <I18nProvider locale={session.locale}>
      <LauncherShell apps={apps} displayName={session.displayName} />
    </I18nProvider>
  );
}
