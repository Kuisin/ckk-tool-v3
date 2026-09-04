/**
 * /portal/login — 取引先ポータルのログイン（パスワードなし）。
 *
 * 事前登録されたメールアドレスへ確認コードを送る。メールが受け取れないときは
 * バックアップコード（管理者が事前に発行して手渡ししたもの）で入れる。
 *
 * 既にセッションがあればポータルの入口へ流す。
 *
 * ■ `?e=<アドレス>` で入力欄を前埋めする
 * ご利用案内 PDF（api/pdf/portal-guide）の QR がこの形で来る。携帯で自分の
 * アドレスを打つのは案内のいちばんの脱落点なので、埋めておく。
 *
 * **資格情報ではない。** 前埋めは入力欄に置くだけで、確認コードは登録された
 * アドレスへ送られる ⇒ URL を拾った第三者は何も進められない。誰かが他人の
 * アドレスを載せた URL を作っても、コードはその他人へ届くだけで攻撃者には
 * 渡らない。応答も従来どおり登録の有無で変わらない。
 *
 * アドレスの形をしていない値は捨てる（`isPlausibleEmail`）— 入力欄に任意の
 * 文字列を出せると、案内文に見せかけた細工を画面に載せられる。
 */

import { redirect } from "next/navigation";
import { PortalLoginForm } from "@/components/portal/PortalLoginForm";
import { getPortalSession } from "@/lib/portal-auth";
import { isPlausibleEmail } from "@/lib/portal-guide-core";
import { requirePortalFeature } from "@/lib/portal-page";

export const dynamic = "force-dynamic";

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string | string[] }>;
}) {
  requirePortalFeature();
  const session = await getPortalSession();
  if (session) redirect("/portal");

  const raw = (await searchParams).e;
  const candidate = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const initialEmail = isPlausibleEmail(candidate) ? candidate : "";

  return <PortalLoginForm initialEmail={initialEmail} />;
}
