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
       */}
      <AppShell.Main
        style={{
          boxShadow: '0 0 5px 0 rgba(0, 0, 0, 0.15)',
          backgroundColor: 'var(--mantine-color-gray-0)',
        }}
      >
        {children}
      </AppShell.Main>

      {/* Footer bar — version + company name + iOS safe area */}
      <AppFooter />
    </AppShell>
  );
}
