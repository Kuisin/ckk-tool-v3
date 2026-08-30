import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MyPermissionsView } from "@/components/profile/MyPermissionsView";
import { getMyPermissions } from "@/lib/my-permissions";

export const dynamic = "force-dynamic";

/**
 * 自分の権限 — 本人が「何を持っていて、何を持っていないか」を確かめる画面。
 *
 * SY01 は system 側の画面で、見るのに権限が要る。ここは**本人ぶんだけ**なので
 * ログインだけで開ける（アプリ一覧にも載せない — プロフィール配下の設定と同じ
 * 扱い）。
 */
export default async function MyPermissionsPage() {
  const session = await auth();
  if (!(session?.user as { id?: string } | undefined)?.id) redirect("/login");

  const view = await getMyPermissions();
  if (!view) redirect("/login");
  return <MyPermissionsView view={view} />;
}
