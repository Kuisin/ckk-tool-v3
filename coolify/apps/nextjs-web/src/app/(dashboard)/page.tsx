import { auth } from "@/auth";
import { HomeApps } from "@/components/home/HomeApps";
import { readHomeSettings } from "@/lib/home-settings";
import { getCurrentProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

/** ダッシュボード (CM00) — app navigation home. ログイン中の実ユーザーを表示。 */
export default async function DashboardPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const [profile, settings] = await Promise.all([
    getCurrentProfile(),
    readHomeSettings(userId),
  ]);
  const user = profile
    ? {
        displayName: profile.displayName,
        initials: profile.initials,
        username: profile.username,
        department: profile.department,
        title: profile.title,
        email: profile.email,
        office: profile.office,
        company: profile.company,
        avatarUrl: profile.avatarUrl,
        avatarThumbUrl: profile.avatarThumbUrl,
      }
    : undefined;
  return <HomeApps settings={settings} user={user} />;
}
