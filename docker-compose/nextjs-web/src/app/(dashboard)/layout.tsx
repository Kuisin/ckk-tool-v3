import type { ReactNode } from "react";
import {
  AppAvailabilityGuard,
  AppFlagsProvider,
} from "@/components/layout/AppFlags";
import { DashboardShell } from "@/components/layout/AppShell";
import { getDisabledAppKeys } from "@/lib/app-flags";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // アプリの環境別 ON/OFF（feature_flags）。行が無ければ有効・失敗時は全表示。
  const disabledKeys = await getDisabledAppKeys();
  return (
    <AppFlagsProvider disabledKeys={disabledKeys}>
      <DashboardShell>
        <AppAvailabilityGuard>{children}</AppAvailabilityGuard>
      </DashboardShell>
    </AppFlagsProvider>
  );
}
