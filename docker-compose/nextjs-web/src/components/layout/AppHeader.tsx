"use client";

/**
 * AppHeader.tsx — topbar header inside AppShell.Header (_specs/design.md §4.1).
 *
 *   LEFT   : logo button → AppLauncher Popover (+ OperationCodeJump on mobile)
 *   CENTER : OperationCodeJump (compact, desktop)
 *   RIGHT  : notification bell Popover + user Menu
 *
 * Notifications / user are mock data for now —
 * TODO(auth): source from Auth.js session; TODO(sse): /api/sse/approvals.
 */

import {
  ActionIcon,
  AppShell,
  Avatar,
  Box,
  Divider,
  Group,
  Indicator,
  Menu,
  Popover,
  ScrollArea,
  Stack,
  Text,
  Title,
  UnstyledButton,
  useComputedColorScheme,
} from "@mantine/core";
import {
  IconBell,
  IconFolder,
  IconLogout,
  IconSettings,
  IconUser,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { AppLauncher } from "./AppLauncher";
import { OperationCodeJump } from "./OperationCodeJump";

const NOTIFICATION_POPUP_WIDTH = 280;
const PROFILE_MENU_WIDTH = 180;

function canHoverOpen(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

const MOCK_NOTIFICATIONS = [
  {
    id: 1,
    title: "承認リクエスト",
    message: "指示書 #1042 の第一承認が必要です",
    time: "5分前",
    isRead: false,
  },
  {
    id: 2,
    title: "工程完了",
    message: "指示書 #1038 の円筒加工が完了しました",
    time: "1時間前",
    isRead: false,
  },
  {
    id: 3,
    title: "承認完了",
    message: "指示書 #1035 が承認されました",
    time: "昨日",
    isRead: true,
  },
];

const MOCK_USER = {
  displayName: "山田 太郎",
  initials: "山田",
  department: "製造部",
};

export function AppHeader() {
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const launcherCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const colorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: false,
  });
  const isDark = colorScheme === "dark";

  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => !n.isRead).length;

  function openLauncher() {
    if (launcherCloseTimeoutRef.current) {
      clearTimeout(launcherCloseTimeoutRef.current);
      launcherCloseTimeoutRef.current = null;
    }
    setLauncherOpen(true);
  }

  function scheduleCloseLauncher() {
    launcherCloseTimeoutRef.current = setTimeout(() => {
      setLauncherOpen(false);
      launcherCloseTimeoutRef.current = null;
    }, 120);
  }

  return (
    <AppShell.Header className="overflow-visible">
      <Group
        h="100%"
        justify="space-between"
        px={{ base: "xs", md: "md" }}
        py="xs"
        wrap="nowrap"
      >
        {/* ── Left: App Launcher (+ code jump on mobile) ─────────────────── */}
        <Group className="min-w-0" gap="xs" wrap="nowrap">
          <Popover
            classNames={{ dropdown: "app-launcher-dropdown" }}
            onDismiss={() => setLauncherOpen(false)}
            opened={launcherOpen}
            position="bottom-start"
            shadow="md"
            trapFocus
            width={544}
            withinPortal
          >
            <Popover.Target>
              <UnstyledButton
                aria-label="アプリ一覧を開く"
                className="launcher-trigger"
                onClick={() => setLauncherOpen((o) => !o)}
                onMouseEnter={() => {
                  if (canHoverOpen()) openLauncher();
                }}
                onMouseLeave={() => {
                  if (canHoverOpen()) scheduleCloseLauncher();
                }}
                px="xs"
                py={4}
              >
                <Group gap="xs" wrap="nowrap">
                  {/* biome-ignore lint/performance/noImgElement: static SVG logo — next/image adds no value */}
                  <img
                    alt="CKK"
                    className="block h-7 w-7"
                    src={
                      isDark
                        ? "/design-assets/dark_logo.svg"
                        : "/design-assets/logo.svg"
                    }
                  />
                  <Text
                    className="whitespace-nowrap"
                    fw={400}
                    size="lg"
                    visibleFrom="md"
                  >
                    シー・ケィ・ケー株式会社
                  </Text>
                </Group>
              </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown
              onMouseEnter={() => {
                if (canHoverOpen()) openLauncher();
              }}
              onMouseLeave={() => {
                if (canHoverOpen()) scheduleCloseLauncher();
              }}
              px="0"
              py="sm"
            >
              <AppLauncher onNavigate={() => setLauncherOpen(false)} />
            </Popover.Dropdown>
          </Popover>

          <Box hiddenFrom="md">
            <OperationCodeJump
              compact
              onNavigate={() => setLauncherOpen(false)}
            />
          </Box>
        </Group>

        {/* ── Right: Code jump (desktop) + Notifications + User ──────────── */}
        <Group gap="xs" wrap="nowrap">
          <Box visibleFrom="md">
            <OperationCodeJump
              compact
              onNavigate={() => setLauncherOpen(false)}
            />
          </Box>
          <Popover
            onDismiss={() => setNotifOpen(false)}
            opened={notifOpen}
            position="bottom-end"
            shadow="md"
            trapFocus
            width={NOTIFICATION_POPUP_WIDTH}
            withinPortal
          >
            <Popover.Target>
              <ActionIcon
                aria-label="通知"
                color="gray"
                onClick={() => setNotifOpen((o) => !o)}
                size="lg"
                styles={{
                  root: { overflow: "visible" },
                  icon: { overflow: "visible" },
                }}
                variant="subtle"
              >
                <Indicator
                  color="red"
                  disabled={unreadCount === 0}
                  label={unreadCount > 9 ? "9+" : String(unreadCount)}
                  processing={unreadCount > 0}
                  size={16}
                >
                  <IconBell size={20} />
                </Indicator>
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown p={0}>
              <Group justify="space-between" px="xs" py="5px">
                <Title order={6}>通知</Title>
                <Text
                  c="blue"
                  className="cursor-pointer border-0 bg-transparent p-0"
                  component="button"
                  size="xs"
                  type="button"
                >
                  すべて既読
                </Text>
              </Group>
              <Divider />
              <ScrollArea mah={{ base: "min(360px, 50dvh)", md: 360 }}>
                <Stack gap={0}>
                  {MOCK_NOTIFICATIONS.map((notif) => (
                    <Box
                      className="notification-item"
                      data-unread={notif.isRead ? undefined : true}
                      key={notif.id}
                      px="sm"
                      py={{ base: "sm", md: "xs" }}
                    >
                      <Group
                        align="flex-start"
                        justify="space-between"
                        wrap="nowrap"
                      >
                        <Stack gap={2}>
                          <Text fw={notif.isRead ? 400 : 600} size="sm">
                            {notif.title}
                          </Text>
                          <Text c="dimmed" size="xs">
                            {notif.message}
                          </Text>
                        </Stack>
                        <Text
                          c="dimmed"
                          className="whitespace-nowrap"
                          size="xs"
                        >
                          {notif.time}
                        </Text>
                      </Group>
                    </Box>
                  ))}
                </Stack>
              </ScrollArea>
            </Popover.Dropdown>
          </Popover>

          {/* User menu */}
          <Menu position="bottom-end" shadow="md" width={PROFILE_MENU_WIDTH}>
            <Menu.Target>
              <Avatar
                aria-label="ユーザーメニュー"
                className="cursor-pointer"
                color="blue"
                radius="xl"
                size="sm"
              >
                {MOCK_USER.initials}
              </Avatar>
            </Menu.Target>
            <Menu.Dropdown px="xs">
              <Menu.Label px="0" py="xs">
                <Group align="center" gap="sm" wrap="nowrap">
                  <Avatar aria-hidden color="blue" radius="xl" size="md">
                    {MOCK_USER.initials}
                  </Avatar>
                  <Stack gap={0}>
                    <Text fw={600} size="sm">
                      {MOCK_USER.displayName}
                    </Text>
                    <Text c="dimmed" size="xs">
                      {MOCK_USER.department}
                    </Text>
                  </Stack>
                </Group>
              </Menu.Label>
              <Divider mb="5px" />
              <Menu.Item
                leftSection={<IconUser size={14} />}
                py={{ base: "sm", md: "xs" }}
              >
                プロフィール
              </Menu.Item>
              <Menu.Item
                component={Link}
                href="/settings"
                leftSection={<IconSettings size={14} />}
                py={{ base: "sm", md: "xs" }}
              >
                設定
              </Menu.Item>
              <Menu.Item
                component={Link}
                href="/admin/files"
                leftSection={<IconFolder size={14} />}
                py={{ base: "sm", md: "xs" }}
              >
                ファイル管理
              </Menu.Item>
              <Divider my="5px" />
              <Menu.Item
                color="red"
                leftSection={<IconLogout size={14} />}
                py={{ base: "sm", md: "xs" }}
              >
                ログアウト
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </AppShell.Header>
  );
}
