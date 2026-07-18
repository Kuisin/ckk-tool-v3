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
import { AppHeader, DEV_BAR_HEIGHT, type HeaderUser } from "./AppHeader";

export function DashboardShell({
  children,
  user,
  isDev = false,
}: {
  children: ReactNode;
  user?: HeaderUser | null;
  /** dev 環境なら true — ヘッダー最上部にオレンジの開発環境バーを表示。 */
  isDev?: boolean;
}) {
  return (
    <AppShell
      footer={{ height: 40 }}
      header={{ height: isDev ? 60 + DEV_BAR_HEIGHT : 60 }}
      padding="md"
    >
      <AppHeader isDev={isDev} user={user} />

      {/*
       * Subtle inner shadow + off-white background on the main area
       * (design.md §1.5). light-dark() keeps both color schemes correct.
       */}
      <AppShell.Main className="app-shell-main">{children}</AppShell.Main>

      <AppFooter />
    </AppShell>
  );
}
