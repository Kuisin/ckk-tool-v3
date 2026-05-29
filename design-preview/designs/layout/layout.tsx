import type { ReactNode } from 'react';
import { AppShell } from '@mantine/core';
import { AppFooter } from './_AppFooter';
import { AppHeader } from './_AppHeader';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <AppShell
      header={{ height: 60 }}
      footer={{ height: 40 }}
      // [Mantine] padding="md" → all page content gets 16px inset from AppShell edges
      padding="md"
      // [Custom] height: 100% fills the BrowserWindow preview container (600px) exactly.
      // minHeight: 0 overrides Mantine's default min-height: 100dvh, which would otherwise
      // cause the shell to overflow the preview box and make the outer container scroll.
      // overflowY: auto lets page content scroll inside the shell while header/footer stay sticky.
      style={{ height: '100%', minHeight: 0, overflowY: 'auto' }}
    >
      {/* Topbar — 'use client', contains launcher Popover, notifications, user Menu */}
      <AppHeader />

      {/* Page content */}
      {/*
       * [Custom] Subtle inner box shadow on the main area to match demo system style.
       * The demo used: style={{ boxShadow: "0 0 5px 0 rgba(0, 0, 0, 0.2)" }}
       * Mantine Paper has shadow presets (xs/sm/md) but they add a border-radius we
       * don't want here. Inline style is the simplest solution for a single-property override.
       *
       * [Dark mode] backgroundColor uses Mantine's light-dark() CSS function so the main
       * area is a subtle off-white in light mode (gray-0) and a slightly-darker-than-body
       * shade in dark mode (dark-8), instead of a fixed light gray that breaks dark mode.
       * The shadow alpha is bumped in dark mode (light-dark) since a 0.15 black shadow is
       * invisible against a dark surface.
       */}
      <AppShell.Main
        style={{
          boxShadow: '0 0 5px 0 light-dark(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.5))',
          backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))',
        }}
      >
        {children}
      </AppShell.Main>

      {/* Footer bar — version + company name + iOS safe area */}
      <AppFooter />
    </AppShell>
  );
}
