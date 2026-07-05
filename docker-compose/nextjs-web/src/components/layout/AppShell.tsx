"use client";

/**
 * AppShell.tsx — dashboard shell (_specs/design.md §3).
 *
 * Header (60) + footer (40), no sidebar. Navigation happens via the
 * AppLauncher popover and the dashboard home grid.
 */

import { AppShell } from "@mantine/core";
import type { ReactNode } from "react";
import { AppFooter } from "./AppFooter";
import { AppHeader } from "./AppHeader";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <AppShell footer={{ height: 40 }} header={{ height: 60 }} padding="md">
      <AppHeader />

      {/*
       * Subtle inner shadow + off-white background on the main area
       * (design.md §1.5). light-dark() keeps both color schemes correct.
       */}
      <AppShell.Main className="app-shell-main">{children}</AppShell.Main>

      <AppFooter />
    </AppShell>
  );
}
