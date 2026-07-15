"use client";

/**
 * AppHeader.tsx — topbar header inside AppShell.Header (_specs/design.md §4.1).
 *
 *   LEFT   : logo button → AppLauncher Popover (+ OperationCodeJump on mobile)
 *   CENTER : OperationCodeJump (compact, desktop)
 *   RIGHT  : notification bell Popover + user Menu
 *
 * Notifications are live (app.notifications → /api/notifications polling via
 * hooks/useNotifications). TODO(sse): swap the hook's polling for SSE.
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
  IconHistory,
  IconLogout,
  IconSettings,
  IconUser,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useRef, useState } from "react";
import { relativeTime, useNotifications } from "@/hooks/useNotifications";
import { AppLauncher } from "./AppLauncher";
import { markAllReadAction, markReadAction } from "./notification-actions";
import { OperationCodeJump } from "./OperationCodeJump";

const NOTIFICATION_POPUP_WIDTH = 280;
const PROFILE_MENU_WIDTH = 180;

function canHoverOpen(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

const MOCK_USER = {
  displayName: "山田 太郎",
  initials: "山田",
  department: "製造部",
};

export interface HeaderUser {
  displayName: string;
  username: string;
  initials: string;
}

export function AppHeader({ user }: { user?: HeaderUser | null }) {
  const sessionUser = user
    ? {
        displayName: user.displayName,
        initials: user.initials,
        department: user.username,
      }
    : MOCK_USER;
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const launcherCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const colorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: false,
  });
  const isDark = colorScheme === "dark";
  const router = useRouter();

  const { unreadCount, items: notifications, refresh } = useNotifications();

  async function handleNotificationClick(notif: {
    id: string;
    isRead: boolean;
    linkPath: string | null;
  }) {
    setNotifOpen(false);
    if (notif.linkPath) router.push(notif.linkPath);
    if (!notif.isRead) {
      await markReadAction(notif.id);
      void refresh();
    }
  }

  async function handleMarkAllRead() {
    await markAllReadAction();
    void refresh();
  }

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
                  onClick={handleMarkAllRead}
                  size="xs"
                  type="button"
                >
                  すべて既読
                </Text>
              </Group>
              <Divider />
              <ScrollArea mah={{ base: "min(360px, 50dvh)", md: 360 }}>
                <Stack gap={0}>
                  {notifications.length === 0 && (
                    <Text c="dimmed" px="sm" py="md" size="xs" ta="center">
                      通知はありません
                    </Text>
                  )}
                  {notifications.map((notif) => (
                    <UnstyledButton
                      className="notification-item block w-full text-left"
                      data-unread={notif.isRead ? undefined : true}
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
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
                          {notif.message && (
                            <Text c="dimmed" size="xs">
                              {notif.message}
                            </Text>
                          )}
                        </Stack>
                        <Text
                          c="dimmed"
                          className="whitespace-nowrap"
                          size="xs"
                        >
                          {relativeTime(notif.createdAt)}
                        </Text>
                      </Group>
                    </UnstyledButton>
                  ))}
                </Stack>
              </ScrollArea>
              <Divider />
              <UnstyledButton
                className="block w-full"
                component={Link}
                href="/notifications"
                onClick={() => setNotifOpen(false)}
                py="6px"
              >
                <Text c="blue" size="xs" ta="center">
                  すべて表示
                </Text>
              </UnstyledButton>
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
                {sessionUser.initials}
              </Avatar>
            </Menu.Target>
            <Menu.Dropdown px="xs">
              <Menu.Label px="0" py="xs">
                <Group align="center" gap="sm" wrap="nowrap">
                  <Avatar aria-hidden color="blue" radius="xl" size="md">
                    {sessionUser.initials}
                  </Avatar>
                  <Stack gap={0}>
                    <Text fw={600} size="sm">
                      {sessionUser.displayName}
                    </Text>
                    <Text c="dimmed" size="xs">
                      {sessionUser.department}
                    </Text>
                  </Stack>
                </Group>
              </Menu.Label>
              <Divider mb="5px" />
              <Menu.Item
                component={Link}
                href="/profile"
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
                href="/settings/notifications"
                leftSection={<IconBell size={14} />}
                py={{ base: "sm", md: "xs" }}
              >
                通知設定
              </Menu.Item>
              <Menu.Item
                component={Link}
                href="/admin/files"
                leftSection={<IconFolder size={14} />}
                py={{ base: "sm", md: "xs" }}
              >
                ファイル管理
              </Menu.Item>
              <Menu.Item
                component={Link}
                href="/admin/activity"
                leftSection={<IconHistory size={14} />}
                py={{ base: "sm", md: "xs" }}
              >
                操作履歴
              </Menu.Item>
              <Divider my="5px" />
              <Menu.Item
                color="red"
                leftSection={<IconLogout size={14} />}
                onClick={() => signOut({ callbackUrl: "/login" })}
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
