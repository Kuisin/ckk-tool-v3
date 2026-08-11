"use client";

/**
 * LauncherShell.tsx — ランチャー画面（ヘッダー + アプリグリッド + アイドル監視）。
 * 現リリースはシェルのみ — アプリは後続 PR で app-list.ts に追加される。
 */

import {
  Avatar,
  Box,
  Button,
  Center,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { IconApps, IconLayoutGrid, IconLogout } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActivityMonitor } from "./ActivityMonitor";

type LauncherApp = { key: string; label: string; href: string };

type Props = {
  displayName: string;
  apps: LauncherApp[];
};

export function LauncherShell({ displayName, apps }: Props) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/kiosk/session", { method: "DELETE" });
    } finally {
      router.replace("/login");
    }
  };

  return (
    <Box p="lg" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <ActivityMonitor />

      <Stack
        gap="lg"
        maw={960}
        mx="auto"
        style={{ flex: 1, width: "100%", display: "flex" }}
      >
        <Paper p="md" radius="md" withBorder>
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Avatar color="blue" radius="xl" size="md">
                {displayName.slice(0, 1)}
              </Avatar>
              <Text fw={600} size="lg" truncate>
                {displayName} さん
              </Text>
            </Group>
            <Button
              color="red"
              leftSection={<IconLogout size={20} />}
              loading={loggingOut}
              onClick={logout}
              variant="default"
            >
              ログアウト
            </Button>
          </Group>
        </Paper>

        <Title order={3}>アプリ</Title>

        {apps.length === 0 ? (
          <Center style={{ flex: 1 }}>
            <Stack align="center" gap="sm">
              <ThemeIcon color="blue" radius="md" size={64} variant="light">
                <IconApps size={36} />
              </ThemeIcon>
              <Text c="dimmed">利用できるアプリは準備中です</Text>
            </Stack>
          </Center>
        ) : (
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
            {apps.map((app) => (
              <UnstyledButton
                key={app.key}
                onClick={() => router.push(app.href)}
              >
                <Paper h="100%" p="lg" radius="md" withBorder>
                  <Stack align="center" gap="sm">
                    <ThemeIcon
                      color="blue"
                      radius="md"
                      size={64}
                      variant="light"
                    >
                      <IconLayoutGrid size={32} />
                    </ThemeIcon>
                    <Text fw={500} ta="center">
                      {app.label}
                    </Text>
                  </Stack>
                </Paper>
              </UnstyledButton>
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Box>
  );
}
