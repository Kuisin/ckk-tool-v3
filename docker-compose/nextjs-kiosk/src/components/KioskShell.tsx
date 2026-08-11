"use client";

/**
 * KioskShell.tsx — Mantine AppShell（nextjs-web の DashboardShell と同型:
 * ヘッダー + フッター、サイドバーなし。design.md §3/§4 準拠のキオスク版）。
 *
 * ヘッダー: 左 = アプリ識別 / 右 = **端末名**（常時表示、layout がサーバー解決）
 * フッター: 会社名 + バージョン（web の AppFooter と同じ構成）
 * Main は flex column — 各ページは style={{flex:1}} の Center で縦中央に置ける。
 */

import { AppShell, Badge, Box, Group, Text } from "@mantine/core";
import { IconDeviceTablet } from "@tabler/icons-react";
import type { ReactNode } from "react";

const HEADER_HEIGHT = 56;
const FOOTER_HEIGHT = 36;

type Props = {
  deviceName: string | null;
  registered: boolean;
  children: ReactNode;
};

export function KioskShell({ deviceName, registered, children }: Props) {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

  return (
    <AppShell
      footer={{ height: FOOTER_HEIGHT }}
      header={{ height: HEADER_HEIGHT }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" justify="space-between" px="lg" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <IconDeviceTablet color="var(--mantine-color-blue-4)" size={24} />
            <Text fw={700} size="md">
              CKK 専用端末
            </Text>
          </Group>
          <Group gap={8} wrap="nowrap">
            <Box
              h={8}
              style={{
                borderRadius: "50%",
                background: registered
                  ? "var(--mantine-color-teal-5)"
                  : "var(--mantine-color-gray-6)",
              }}
              w={8}
            />
            {registered ? (
              <Text fw={600} maw={360} size="md" truncate>
                {deviceName ?? "（名称未設定）"}
              </Text>
            ) : (
              <Badge color="gray" variant="outline">
                未登録端末
              </Badge>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100dvh",
        }}
      >
        {children}
      </AppShell.Main>

      <AppShell.Footer
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <Group gap="lg" h="100%" justify="center" px="md">
          <Text c="dimmed" size="xs">
            シー・ケィ・ケー株式会社
          </Text>
          <Text c="dimmed" size="xs">
            v{version}
          </Text>
        </Group>
      </AppShell.Footer>
    </AppShell>
  );
}
