import { redirect } from "next/navigation";
import { auth, isSsoEnabled } from "@/auth";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeCallbackPath } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";

/**
 * ログイン (Auth.js v5 — credentials + 任意で Authentik SSO)。
 *
 * 未ログインで保護ページを開くと、Proxy が `?callbackUrl=<元の URL>` を付けて
 * ここへ送る。ログインしたら**その画面へ戻す** — 共有された `/f/<code>` を
 * 開いた人が、ログインのあとホームに放り出されて URL を貼り直す、という往復を
 * 無くすため。戻り先は必ず safeCallbackPath でアプリ内のパスに畳む。
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const next = safeCallbackPath(callbackUrl);
  const session = await auth();
  // ログイン済みで来た場合も、戻り先が分かっているならそこへ。
  if (session?.user) redirect(next);
  return <LoginForm callbackUrl={next} ssoEnabled={isSsoEnabled} />;
}
