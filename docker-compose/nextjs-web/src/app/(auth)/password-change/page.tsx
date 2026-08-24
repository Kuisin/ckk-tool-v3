import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ForcedPasswordChangeForm } from "@/components/auth/ForcedPasswordChangeForm";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * パスワード変更の強制画面。
 *
 * 初期管理者（既定パスワード `admin`）のように
 * `users.password_change_required` が立っているユーザーは、ダッシュボード側の
 * レイアウトがここへ飛ばす。(auth) グループに置いてあるのは、そのガードの
 * 外側 ＝ リダイレクトループにならない場所だから。
 */
export default async function PasswordChangePage() {
  const session = await auth();
  const username = (session?.user as { username?: string } | undefined)
    ?.username;
  if (!username) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { username },
    select: { passwordChangeRequired: true },
  });
  // 変更済み（or 元々不要）なら用は無い。
  if (!user?.passwordChangeRequired) redirect("/");

  return <ForcedPasswordChangeForm />;
}
