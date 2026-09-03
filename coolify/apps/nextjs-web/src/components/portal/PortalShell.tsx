"use client";

/**
 * PortalShell — 取引先ポータルの外枠。
 *
 * 社内の AppShell とは別物にしてある。ランチャー・操作コード・通知・
 * プロフィールメニューは社内の道具で、社外の人には出さない。
 * 出すのは会社名とログアウトだけ。
 */

import { AppShell, Container, Group, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export function PortalShell({ children }: { children: ReactNode }) {
  const tr = useTranslations();
  return (
    <AppShell footer={{ height: 40 }} header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" justify="space-between" px="md" wrap="nowrap">
          <Text fw={600} size="sm">
            {tr("portal.portalShell.cKKPartnerPortal")}
          </Text>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container px={0} size="md">
          {children}
        </Container>
      </AppShell.Main>

      <AppShell.Footer>
        <Group gap="lg" h="100%" justify="center" px="md">
          <Text c="dimmed" size="xs">
            {tr("portal.portalShell.chuetsuToolWorks")}
          </Text>
        </Group>
      </AppShell.Footer>
    </AppShell>
  );
}
