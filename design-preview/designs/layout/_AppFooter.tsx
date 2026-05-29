'use client';

/**
 * AppFooter.tsx
 * Footer bar — rendered inside AppShell.Footer.
 *
 * ─── COMPONENT MAP ───────────────────────────────────────────────────────────
 *
 *  AppShell.Footer
 *  └── Group (h="100%", px="md", justify="center", gap="lg")
 *      ├── Text — company name
 *      ├── Text — version string
 *      └── [dev only] Badge — "DEV" indicator
 *
 * ─── CUSTOMIZATIONS ──────────────────────────────────────────────────────────
 *
 * [Mantine] AppShell.Footer — standard wrapper. Height set in layout.tsx (40px).
 *
 * [Custom] Version string pulled from NEXT_PUBLIC_APP_VERSION env var.
 *          Show/hide "DEV" badge based on NODE_ENV.
 *
 * [Custom] iOS safe-area inset: The demo system used Tailwind's `pb-safe` utility
 *          (which maps to `env(safe-area-inset-bottom)`).
 *          Here we use an inline style instead — no Tailwind needed for a single CSS env var.
 *          This prevents content from being hidden behind the iPhone home indicator.
 *
 * [NOT Tailwind] No Tailwind classes used here. All spacing via Mantine props.
 */

import { AppShell, Badge, Group, Text } from '@mantine/core';

interface AppFooterProps {
  companyName?: string;
}

export function AppFooter({ companyName = '株式会社CKK' }: AppFooterProps) {
  const isDev = process.env.NODE_ENV === 'development';
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';

  return (
    <AppShell.Footer
      // [Custom] iOS PWA safe area — avoids content behind home indicator
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <Group h="100%" px="md" justify="center" gap="lg">
        {/* [Mantine] Text size="xs" c="dimmed" — subtle footer text */}
        <Text size="xs" c="dimmed">{companyName}</Text>
        <Text size="xs" c="dimmed">v{version}</Text>
        {/* [Mantine] Badge — visible only in development */}
        {isDev && (
          <Badge size="xs" color="orange" variant="outline">
            DEV
          </Badge>
        )}
      </Group>
    </AppShell.Footer>
  );
}
