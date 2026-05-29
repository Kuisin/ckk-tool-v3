'use client';

/**
 * AppHeader.tsx
 * Topbar header — rendered inside AppShell.Header.
 *
 * ─── COMPONENT MAP ───────────────────────────────────────────────────────────
 *
 *  AppShell.Header
 *  └── Group (h="100%", px="md", justify="space-between")
 *      ├── LEFT: Popover (app launcher)
 *      │   ├── Popover.Target → ActionIcon (grid icon)
 *      │   └── Popover.Dropdown → AppLauncher
 *      ├── CENTER: Text "CKK" (brand)
 *      └── RIGHT: Group
 *          ├── Indicator > ActionIcon (notifications bell)
 *          │   └── Popover.Dropdown → notification list (see below)
 *          └── Menu (user avatar)
 *              ├── Menu.Target → Avatar
 *              └── Menu.Dropdown
 *                  ├── Menu.Item profile
 *                  ├── Menu.Item settings
 *                  ├── Divider
 *                  └── Menu.Item logout (red)
 *
 * ─── CUSTOMIZATIONS ──────────────────────────────────────────────────────────
 *
 * [Custom] App Launcher trigger: the leftmost button opens AppLauncher in a
 *          Popover. This pattern (logo-button → app grid) replaces the old sidebar
 *          NavLink list. The brand text "CKK" is a non-clickable label in the center.
 *
 * [Mantine] Popover width={540} — sized to fit AppLauncher's 3-column grid (520px content + padding).
 *           position="bottom-start" aligns the dropdown to the left edge of the trigger button.
 *
 * [Mantine] Indicator wraps the notification bell ActionIcon to show an unread count badge.
 *           Set `disabled={true}` when unreadCount === 0 to hide the badge cleanly.
 *
 * [Mantine] Menu for the user avatar dropdown — standard Mantine pattern.
 *           The Avatar shows user initials; in production, swap for an <Image> if
 *           an avatar URL is available.
 *
 * [Custom] Notification Popover: clicking the bell opens a list of recent notifications.
 *          This is custom-assembled; Mantine doesn't provide a notification center component.
 *          The list uses ScrollArea + Stack. Each item is a Paper with Text (title + time).
 *
 * [NOT Tailwind] The demo system used absolute positioning + Tailwind for the dropdown.
 *                Replaced entirely with Mantine Popover (handles z-index, portal, arrow).
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
  Paper,
  Popover,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconApps,
  IconBell,
  IconLogout,
  IconSettings,
  IconUser,
} from '@tabler/icons-react';
import { useState } from 'react';
import { AppLauncher } from './comp_AppLauncher';

// Mock data — in production, fetch from /api/sse/approvals or a DB query
const MOCK_NOTIFICATIONS = [
  {
    id: 1,
    title: '承認リクエスト',
    message: '指示書 #1042 の第一承認が必要です',
    time: '5分前',
    isRead: false,
  },
  {
    id: 2,
    title: '工程完了',
    message: '指示書 #1038 の円筒加工が完了しました',
    time: '1時間前',
    isRead: false,
  },
  {
    id: 3,
    title: '承認完了',
    message: '指示書 #1035 が承認されました',
    time: '昨日',
    isRead: true,
  },
];

// Mock user — in production, comes from Auth.js session
const MOCK_USER = {
  displayName: '山田 太郎',
  initials: '山田',
  department: '製造部',
};

export function AppHeader() {
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => !n.isRead).length;

  return (
    <AppShell.Header>
      <Group h="100%" px="md" justify="space-between" wrap="nowrap">

        {/* ── Left: App Launcher ────────────────────────────────────────────── */}
        {/*
         * [Custom] Clicking this button opens the app launcher grid (not a route).
         * IconApps is the "9-dot grid" icon from Tabler — standard launcher metaphor.
         */}
        <Popover
          opened={launcherOpen}
          onClose={() => setLauncherOpen(false)}
          width={540}
          position="bottom-start"
          shadow="md"
          withinPortal
          // [Custom] trapFocus ensures keyboard navigation stays inside the popover
          trapFocus
        >
          <Popover.Target>
            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={() => setLauncherOpen((o) => !o)}
              aria-label="アプリ一覧を開く"
              color="gray"
            >
              <IconApps size={22} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown p="sm">
            <AppLauncher onNavigate={() => setLauncherOpen(false)} />
          </Popover.Dropdown>
        </Popover>

        {/* ── Center: Brand ─────────────────────────────────────────────────── */}
        {/*
         * [Custom] Brand text is centered between left and right groups.
         * In the demo system this was positioned with flex. Here, Group justify="space-between"
         * with equal-width left/right groups achieves the same without Tailwind.
         * NOTE: If the logo becomes an image, wrap in <Box w={60}> to fix the width.
         */}
        <Text fw={700} size="lg" c="blue" style={{ letterSpacing: 1 }}>
          CKK
        </Text>

        {/* ── Right: Notifications + User ───────────────────────────────────── */}
        <Group gap="xs" wrap="nowrap">

          {/* Notification bell */}
          {/*
           * [Mantine] Indicator shows the unread count badge.
           *   - `disabled` hides the badge when count is 0
           *   - `processing` adds a pulsing animation for urgent notifications
           *     (Mantine built-in, no Tailwind animate-ping needed)
           * [Custom] The Popover dropdown below is a custom notification panel.
           */}
          <Popover
            opened={notifOpen}
            onClose={() => setNotifOpen(false)}
            width={320}
            position="bottom-end"
            shadow="md"
            withinPortal
          >
            <Popover.Target>
              <Indicator
                label={unreadCount > 9 ? '9+' : String(unreadCount)}
                size={16}
                color="red"
                disabled={unreadCount === 0}
                // [Mantine] processing=true adds a pulsing ring — use for urgent items
                processing={unreadCount > 0}
              >
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  onClick={() => setNotifOpen((o) => !o)}
                  aria-label="通知"
                  color="gray"
                >
                  <IconBell size={20} />
                </ActionIcon>
              </Indicator>
            </Popover.Target>
            <Popover.Dropdown p={0}>
              {/* Notification panel */}
              {/* [Custom] Header row with title + "mark all read" action */}
              <Group px="md" py="sm" justify="space-between">
                <Title order={6}>通知</Title>
                <Text size="xs" c="blue" style={{ cursor: 'pointer' }}>
                  すべて既読
                </Text>
              </Group>
              <Divider />
              <ScrollArea mah={360}>
                <Stack gap={0}>
                  {MOCK_NOTIFICATIONS.map((notif) => (
                    <Box
                      key={notif.id}
                      px="md"
                      py="sm"
                      style={{
                        borderBottom: '1px solid var(--mantine-color-default-border)',
                        // [Custom] Unread items get a subtle left accent border
                        borderLeft: notif.isRead
                          ? undefined
                          : '3px solid var(--mantine-color-blue-5)',
                        cursor: 'pointer',
                      }}
                    >
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Stack gap={2}>
                          <Text size="sm" fw={notif.isRead ? 400 : 600}>
                            {notif.title}
                          </Text>
                          <Text size="xs" c="dimmed">{notif.message}</Text>
                        </Stack>
                        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
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
          {/*
           * [Mantine] Menu — standard dropdown pattern.
           * [Custom] Avatar shows user initials (2 kanji). In production, conditionally
           *          render an <Image> if the user has an avatar URL.
           */}
          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <Avatar
                size="sm"
                radius="xl"
                color="blue"
                style={{ cursor: 'pointer' }}
                aria-label="ユーザーメニュー"
              >
                {MOCK_USER.initials}
              </Avatar>
            </Menu.Target>
            <Menu.Dropdown>
              {/* [Mantine] Menu.Label used as user info header (not interactive) */}
              <Menu.Label>
                <Stack gap={0}>
                  <Text size="sm" fw={600}>{MOCK_USER.displayName}</Text>
                  <Text size="xs" c="dimmed">{MOCK_USER.department}</Text>
                </Stack>
              </Menu.Label>
              <Divider />
              <Menu.Item leftSection={<IconUser size={14} />}>
                プロフィール
              </Menu.Item>
              <Menu.Item leftSection={<IconSettings size={14} />}>
                設定
              </Menu.Item>
              <Divider />
              {/* [Mantine] color="red" applies danger styling to the logout item */}
              <Menu.Item
                leftSection={<IconLogout size={14} />}
                color="red"
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
