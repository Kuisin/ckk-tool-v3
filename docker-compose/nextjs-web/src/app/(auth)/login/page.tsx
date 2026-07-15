import { redirect } from "next/navigation";
import { auth, isSsoEnabled } from "@/auth";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

/** ログイン (Auth.js v5 — credentials + 任意で Authentik SSO)。 */
export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  return <LoginForm ssoEnabled={isSsoEnabled} />;
}
