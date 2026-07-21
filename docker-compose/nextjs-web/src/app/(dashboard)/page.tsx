import { HomeApps } from "@/components/home/HomeApps";
import { getCurrentProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

/** ダッシュボード (CM00) — app navigation home. ログイン中の実ユーザーを表示。 */
export default async function DashboardPage() {
  const profile = await getCurrentProfile();
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
      }
    : undefined;
  return <HomeApps user={user} />;
}
