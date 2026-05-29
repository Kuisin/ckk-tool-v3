/**
 * layout.tsx — Dashboard layout (Server Component)
 * Replaces the old sidebar AppShell with a topbar-only layout.
 *
 * ─── COMPONENT MAP ───────────────────────────────────────────────────────────
 *
 *  MantineProvider (in root layout.tsx — not shown here)
 *  └── AppShell (header + footer only, NO navbar)
 *      ├── AppHeader                  'use client'
 *      │   ├── Popover → AppLauncher  'use client'
 *      │   ├── Indicator > bell       (notifications)
 *      │   └── Menu > Avatar          (user)
 *      ├── AppShell.Main
 *      │   └── {children}             (page content)
 *      └── AppFooter                  'use client'
 *
 * ─── KEY DESIGN DECISIONS ────────────────────────────────────────────────────
 *
 * [Mantine] AppShell with header={{ height: 60 }} and footer={{ height: 40 }}.
 *           NO `navbar` prop — this removes the 260px sidebar entirely, giving
 *           pages the full viewport width.
 *
 * [Mantine] padding="md" on AppShell applies uniform padding to AppShell.Main.
 *           All page content automatically gets breathing room without needing
 *           individual padding on every page.
 *
 * [Custom] This layout is a pure Server Component. Client-side interactivity
 *          (app launcher open/close, notifications) is encapsulated in AppHeader.
 *
 * [NOT Tailwind] The demo system used `h-dvh min-w-dvw` on a <div>.
 *                Mantine AppShell handles full-height layout internally via CSS variables
 *                (--app-shell-header-height, --app-shell-footer-height).
 *                No Tailwind or custom CSS needed for the shell structure.
 *
 * [Custom] The main content area has a subtle box shadow to visually separate it
 *          from the header/footer, matching the demo system's aesthetic.
 *          Uses inline style (single rule) — not worth a CSS module.
 */

import { AppShell } from '@mantine/core';
import { AppFooter } from '@/components/layout/AppFooter';
import { AppHeader } from '@/components/layout/AppHeader';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <AppShell
      header={{ height: 60 }}
      footer={{ height: 40 }}
      // [Mantine] padding="md" → all page content gets 16px inset from AppShell edges
      padding="md"
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
