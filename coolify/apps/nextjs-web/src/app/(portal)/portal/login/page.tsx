/**
 * /portal/login — 取引先ポータルのログイン（パスワードなし）。
 *
 * 事前登録されたメールアドレスへ確認コードを送る。メールが受け取れないときは
 * バックアップコード（管理者が事前に発行して手渡ししたもの）で入れる。
 *
 * 既にセッションがあればポータルの入口へ流す。
 */

import { redirect } from "next/navigation";
import { PortalLoginForm } from "@/components/portal/PortalLoginForm";
import { getPortalSession } from "@/lib/portal-auth";
import { requirePortalFeature } from "@/lib/portal-page";

export const dynamic = "force-dynamic";

export default async function PortalLoginPage() {
  requirePortalFeature();
  const session = await getPortalSession();
  if (session) redirect("/portal");
  return <PortalLoginForm />;
}
