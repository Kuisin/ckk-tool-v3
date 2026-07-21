import type { ReactNode } from "react";
import {
  AppAvailabilityGuard,
  AppFlagsProvider,
} from "@/components/layout/AppFlags";
import { DashboardShell } from "@/components/layout/AppShell";
import { NavigationGuardProvider } from "@/components/layout/NavigationGuard";
import { PwaRegister } from "@/components/layout/PwaRegister";
import { currentAppEnv, getDisabledAppKeys } from "@/lib/app-flags";
import { getCurrentProfile } from "@/lib/profile";

// feature_flags はリクエスト毎に読む（静的プリレンダだとビルド時の値で固まり、
// アプリ ON/OFF・DEV リボンが反映されない）。ダッシュボード配下は全て動的。
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // アプリの環境別 ON/OFF（feature_flags）。行が無ければ有効・失敗時は全表示。
  // main 無効 = 未リリース。DEV リボンは dev 環境のみ（main では未リリース
  // アプリ自体が非表示になるため、リボン情報は配布しない）。
  const isDevEnv = currentAppEnv() === "dev";
  const [disabledKeys, unreleasedKeys, profile] = await Promise.all([
    getDisabledAppKeys(),
    isDevEnv ? getDisabledAppKeys("main") : Promise.resolve([]),
    getCurrentProfile(),
  ]);
  const headerUser = profile
    ? {
        displayName: profile.displayName,
        username: profile.username,
        initials: profile.initials,
        department: profile.department,
        title: profile.title,
      }
    : null;
  return (
    <AppFlagsProvider
      disabledKeys={disabledKeys}
      unreleasedKeys={unreleasedKeys}
    >
      <PwaRegister />
      <NavigationGuardProvider>
        <DashboardShell isDev={isDevEnv} user={headerUser}>
          <AppAvailabilityGuard>{children}</AppAvailabilityGuard>
        </DashboardShell>
      </NavigationGuardProvider>
    </AppFlagsProvider>
  );
}
