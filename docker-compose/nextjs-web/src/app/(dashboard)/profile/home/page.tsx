import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HomeSettingsForm } from "@/components/home/HomeSettingsForm";
import { readHomeSettings } from "@/lib/home-settings";

export const dynamic = "force-dynamic";

/** ホーム画面設定 — お気に入り・表示モード・カスタムグループ（本人のみ）。 */
export default async function HomeSettingsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const settings = await readHomeSettings(userId);
  return <HomeSettingsForm initial={settings} />;
}
