"use client";

/**
 * AppFooter.tsx — footer bar (_specs/design.md §4.3).
 *
 * Company name + version (+ DEV badge in development) centered, iOS safe-area
 * inset. Right corner shows the current app's operation code (resolved from
 * the pathname via app-list); pages outside any app (home, profile, …) show
 * nothing.
 */

import { AppShell, Badge, Box, Group, Text } from "@mantine/core";
import { usePathname } from "next/navigation";
import { appList } from "@/lib/app-list";
import { appKeyForPath } from "./AppFlags";

interface AppFooterProps {
  companyName?: string;
}

export function AppFooter({
  companyName = "シー・ケィ・ケー株式会社",
}: AppFooterProps) {
  const isDev = process.env.NODE_ENV === "development";
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

  const pathname = usePathname();
  const appKey = appKeyForPath(pathname);
  const operationCode = appKey
    ? (appList.find((a) => a.key === appKey)?.operationCode ?? null)
    : null;

  return (
    <AppShell.Footer className="pb-[env(safe-area-inset-bottom,0px)]">
      <Box h="100%" pos="relative">
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
        {operationCode && (
          <Text
            c="dimmed"
            className="tabular-nums"
            ff="mono"
            size="xs"
            style={{
              position: "absolute",
              right: "var(--mantine-spacing-md)",
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            {operationCode}
          </Text>
        )}
      </Box>
    </AppShell.Footer>
  );
}
