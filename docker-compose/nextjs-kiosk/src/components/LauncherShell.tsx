"use client";

/**
 * LauncherShell.tsx — ランチャー画面（ヘッダー + アプリグリッド + アイドル監視）。
 * 現リリースはシェルのみ — アプリは後続 PR で app-list.ts に追加される。
 * 文言はユーザー言語（useI18n — ja/en/zh）。言語切替はここで行い users.locale
 * に保存 → router.refresh() でサーバー側から新しい辞書が流れてくる。
 */

import {
  Avatar,
  Box,
  Button,
  Center,
  Group,
  Paper,
  SegmentedControl,
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
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n";
import { ActivityMonitor } from "./ActivityMonitor";
import { useI18n } from "./I18nProvider";

type LauncherApp = { key: string; label: string; href: string };

type Props = {
  displayName: string;
  apps: LauncherApp[];
};

export function LauncherShell({ displayName, apps }: Props) {
  const router = useRouter();
  const { locale, m } = useI18n();
  const [loggingOut, setLoggingOut] = useState(false);
  const [switching, setSwitching] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/kiosk/session", { method: "DELETE" });
    } finally {
      router.replace("/login");
    }
  };

  const changeLocale = async (value: string) => {
    if (value === locale || switching) return;
    setSwitching(true);
    try {
      await fetch("/api/kiosk/locale", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: value }),
      });
      router.refresh(); // サーバーが users.locale を再読込 → 新しい辞書で再描画
    } finally {
      setSwitching(false);
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
                {m.launcher.greeting(displayName)}
              </Text>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <SegmentedControl
                aria-label={m.launcher.language}
                data={LOCALES.map((l) => ({
                  value: l,
                  label: LOCALE_LABELS[l],
                }))}
                disabled={switching}
                onChange={changeLocale}
                value={locale}
              />
              <Button
                color="red"
                leftSection={<IconLogout size={20} />}
                loading={loggingOut}
                onClick={logout}
                variant="default"
              >
                {m.launcher.logout}
              </Button>
            </Group>
          </Group>
        </Paper>

        <Title order={3}>{m.launcher.appsTitle}</Title>

        {apps.length === 0 ? (
          <Center style={{ flex: 1 }}>
            <Stack align="center" gap="sm">
              <ThemeIcon color="blue" radius="md" size={64} variant="light">
                <IconApps size={36} />
              </ThemeIcon>
              <Text c="dimmed">{m.launcher.noApps}</Text>
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
