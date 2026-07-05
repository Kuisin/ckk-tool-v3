import { HomeApps } from "@/components/home/HomeApps";

/**
 * ダッシュボード (CM00) — app navigation home.
 * TODO(auth): fetch the session user server-side and pass via `user`.
 */
export default function DashboardPage() {
  return <HomeApps />;
}
