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
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
} from "@mantine/core";
import {
  IconBell,
  IconChevronLeft,
  IconFolder,
  IconHistory,
  IconLogout,
  IconSettings,
  IconShare2,
  IconUser,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useRef, useState } from "react";
import { relativeTime, useNotifications } from "@/hooks/useNotifications";
import { appList } from "@/lib/app-list";
import { appKeyForPath } from "./AppFlags";
import { AppLauncher } from "./AppLauncher";
import { useNavigationGuard } from "./NavigationGuard";
import { markAllReadAction, markReadAction } from "./notification-actions";
import { OperationCodeJump } from "./OperationCodeJump";
import { SharePageModal } from "./SharePageModal";

const NOTIFICATION_POPUP_WIDTH = 280;
const PROFILE_MENU_WIDTH = 180;

/** 開発環境バーの高さ（dev のみ表示。ヘッダー最上部に重ねる）。 */
export const DEV_BAR_HEIGHT = 28;

// ページを持たない工程カテゴリのパス先頭セグメント（戻る先はホームにする）。
const CATEGORY_ROOTS = new Set([
  "sales",
  "purchase",
  "production",
  "shipping",
  "billing",
  "master",
]);

function canHoverOpen(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

/** 未ログイン時のフォールバック（デモ ID は出さない）。 */
const GUEST_USER = {
  displayName: "ゲスト",
  initials: "—",
  department: "",
};

export interface HeaderUser {
  displayName: string;
  username: string;
  initials: string;
  department: string | null;
  title: string | null;
}

export function AppHeader({
  user,
  isDev = false,
}: {
  user?: HeaderUser | null;
  isDev?: boolean;
}) {
  const sessionUser = user
    ? {
        displayName: user.displayName,
        initials: user.initials,
        // 所属（無ければ役職 → ユーザー名の順でフォールバック）。
        department: user.department || user.title || user.username,
      }
    : GUEST_USER;
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const launcherCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const colorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: false,
  });
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const pathname = usePathname();
  const { guard } = useNavigationGuard();

  // 開いているアプリ名（ランチャーのトリガーに表示）。ホームや未登録画面では null。
  const currentApp = (() => {
    const key = appKeyForPath(pathname);
    return key ? (appList.find((a) => a.key === key) ?? null) : null;
  })();
  const isHome = pathname === "/";

  // ヘッダーの「戻る」= ブラウザ履歴ではなくページ階層を1段上がる。
  // 末尾セグメントを外した親パスへ遷移。工程カテゴリ（ページ無し）のみホームへ。
  const goUpOneLevel = () => {
    const segs = pathname.split("/").filter(Boolean);
    const parent = segs.slice(0, -1);
    const target =
      parent.length === 0 ||
      (parent.length === 1 && CATEGORY_ROOTS.has(parent[0]))
        ? "/"
        : `/${parent.join("/")}`;
    guard(() => router.push(target));
  };

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
      {/* 開発環境バー（dev のみ）。本番と取り違えないための警告帯。 */}
      {isDev && (
        <Box
          bg="orange.6"
          c="white"
          fw={700}
          fz="xs"
          h={DEV_BAR_HEIGHT}
          style={{ lineHeight: `${DEV_BAR_HEIGHT}px`, letterSpacing: 1 }}
          ta="center"
        >
          開発環境 — DEV
        </Box>
      )}
      <Group
        h={isDev ? `calc(100% - ${DEV_BAR_HEIGHT}px)` : "100%"}
        justify="space-between"
        px={{ base: "xs", md: "md" }}
        py="xs"
        wrap="nowrap"
      >
        {/* ── Left: back (非ホーム時) + App Launcher (+ code jump on mobile) ── */}
        <Group className="min-w-0" gap="xs" wrap="nowrap">
          {!isHome && (
            <Tooltip label="戻る" withinPortal>
              <ActionIcon
                aria-label="1つ上の階層へ戻る"
                color="gray"
                onClick={goUpOneLevel}
                size="lg"
                variant="subtle"
              >
                <IconChevronLeft size={20} />
              </ActionIcon>
            </Tooltip>
          )}
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
                  {currentApp ? (
                    // 開いているアプリ名を表示（モバイルでも表示）。
                    <Text className="truncate" fw={600} size="md">
                      {currentApp.label}
                    </Text>
                  ) : (
                    <Text
                      className="whitespace-nowrap"
                      fw={400}
                      size="lg"
                      visibleFrom="md"
                    >
                      シー・ケィ・ケー株式会社
                    </Text>
                  )}
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
          {/* ページ共有（_demo-system 参照 — 現在の URL を通知として送る） */}
          <Tooltip label="ページを共有" withinPortal>
            <ActionIcon
              aria-label="ページを共有"
              color="gray"
              onClick={() => setShareOpen(true)}
              size="lg"
              variant="subtle"
            >
              <IconShare2 size={20} />
            </ActionIcon>
          </Tooltip>
          <SharePageModal
            onClose={() => setShareOpen(false)}
            opened={shareOpen}
          />
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
