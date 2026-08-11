/**
 * / — ランチャー（要ログイン）。
 *
 * サーバー側でセッションを本検証（期限・アイドル・失効）し、ユーザーの
 * 権限で表示アプリをフィルタしてクライアントシェルへ渡す。
 */

import { redirect } from "next/navigation";
import { LauncherShell } from "@/components/LauncherShell";
import { visibleApps } from "@/lib/app-list";
import { readableCodes } from "@/lib/authz";
import { getSession } from "@/lib/kiosk-auth";

export const dynamic = "force-dynamic";

export default async function LauncherPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const codes = await readableCodes(session.userId);
  const apps = visibleApps(codes).map((app) => ({
    key: app.key,
    label: app.label,
    href: app.href,
  }));

  return <LauncherShell apps={apps} displayName={session.displayName} />;
}
