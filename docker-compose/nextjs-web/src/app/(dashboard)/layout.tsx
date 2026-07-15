import type { ReactNode } from "react";
import { auth } from "@/auth";
import {
  AppAvailabilityGuard,
  AppFlagsProvider,
} from "@/components/layout/AppFlags";
import { DashboardShell } from "@/components/layout/AppShell";
import { PwaRegister } from "@/components/layout/PwaRegister";
import { currentAppEnv, getDisabledAppKeys } from "@/lib/app-flags";

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
  const [disabledKeys, unreleasedKeys, session] = await Promise.all([
    getDisabledAppKeys(),
    isDevEnv ? getDisabledAppKeys("main") : Promise.resolve([]),
    auth(),
  ]);
  const su = session?.user as
    | { name?: string | null; username?: string }
    | undefined;
  const headerUser = su?.name
    ? {
        displayName: su.name,
        username: su.username ?? "",
        initials: su.name.slice(0, 2),
      }
    : null;
  return (
    <AppFlagsProvider
      disabledKeys={disabledKeys}
      unreleasedKeys={unreleasedKeys}
    >
      <PwaRegister />
      <DashboardShell user={headerUser}>
        <AppAvailabilityGuard>{children}</AppAvailabilityGuard>
      </DashboardShell>
    </AppFlagsProvider>
  );
}
