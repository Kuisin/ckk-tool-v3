import type { ReactNode } from "react";
import {
  AppAvailabilityGuard,
  AppFlagsProvider,
} from "@/components/layout/AppFlags";
import { DashboardShell } from "@/components/layout/AppShell";
import { getDisabledAppKeys } from "@/lib/app-flags";

// feature_flags はリクエスト毎に読む（静的プリレンダだとビルド時の値で固まり、
// アプリ ON/OFF・DEV リボンが反映されない）。ダッシュボード配下は全て動的。
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // アプリの環境別 ON/OFF（feature_flags）。行が無ければ有効・失敗時は全表示。
  // main 無効 = 未リリース（dev のホームカードに DEV リボンを出す）。
  const [disabledKeys, unreleasedKeys] = await Promise.all([
    getDisabledAppKeys(),
    getDisabledAppKeys("main"),
  ]);
  return (
    <AppFlagsProvider
      disabledKeys={disabledKeys}
      unreleasedKeys={unreleasedKeys}
    >
      <DashboardShell>
        <AppAvailabilityGuard>{children}</AppAvailabilityGuard>
      </DashboardShell>
    </AppFlagsProvider>
  );
}
