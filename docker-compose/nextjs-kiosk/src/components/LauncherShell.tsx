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
    <Box mih="calc(100dvh - 48px)">
      <ActivityMonitor />

      <Paper px="lg" py="sm" radius={0} withBorder>
        <Group justify="space-between">
          <Group gap="sm">
            <Avatar color="blue" radius="xl" size="md">
              {displayName.slice(0, 1)}
            </Avatar>
            <Text fw={600} size="lg">
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

      <Stack gap="lg" maw={960} mx="auto" p="lg">
        <Title order={3}>アプリ</Title>

        {apps.length === 0 ? (
          <Center py={80}>
            <Stack align="center" gap="sm">
              <ThemeIcon color="gray" radius="md" size={64} variant="light">
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
