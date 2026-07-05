"use client";

/**
 * AppFooter.tsx — footer bar (_specs/design.md §4.3).
 *
 * Company name + version (+ DEV badge in development), iOS safe-area inset.
 */

import { AppShell, Badge, Group, Text } from "@mantine/core";

interface AppFooterProps {
  companyName?: string;
}

export function AppFooter({
  companyName = "シー・ケィ・ケー株式会社",
}: AppFooterProps) {
  const isDev = process.env.NODE_ENV === "development";
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

  return (
    <AppShell.Footer className="pb-[env(safe-area-inset-bottom,0px)]">
      <Group gap="lg" h="100%" justify="center" px="md">
        <Text c="dimmed" size="xs">
          {companyName}
        </Text>
        <Text c="dimmed" size="xs">
          v{version}
        </Text>
        {isDev && (
          <Badge color="orange" size="xs" variant="outline">
            DEV
          </Badge>
        )}
      </Group>
    </AppShell.Footer>
  );
}
