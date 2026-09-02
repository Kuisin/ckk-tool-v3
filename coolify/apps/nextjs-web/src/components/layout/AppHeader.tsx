"use client";

/**
 * AppHeader.tsx — topbar header inside AppShell.Header (_specs/design.md §4.1).
 *
 *   LEFT   : back (非ホーム) + logo button → AppLauncher Popover
 *   CENTER : OperationCodeJump (compact) — **デスクトップのみ**
 *   RIGHT  : notification bell Popover + user Menu
 *
 * Notifications are live (app.notifications → /api/notifications polling via
 * hooks/useNotifications). TODO(sse): swap the hook's polling for SSE.
 */

import {
  ActionIcon,
  AppShell,
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
  IconBug,
  IconChevronLeft,
  IconLanguage,
  IconLayoutDashboard,
  IconLogout,
  IconShare2,
  IconShieldCheck,
  IconUser,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { relativeTime, useNotifications } from "@/hooks/useNotifications";
import { appLabel, appList } from "@/lib/app-list";
import { installBugReportCapture } from "@/lib/bug-report";
import type { Locale } from "@/lib/i18n";
import { appKeyForPath } from "./AppFlags";
import { AppLauncher } from "./AppLauncher";
import { BugReportModal } from "./BugReportModal";
import { useNavigationGuard } from "./NavigationGuard";
import { markAllReadAction, markReadAction } from "./notification-actions";
import { OperationCodeJump } from "./OperationCodeJump";

import { SharePageModal } from "./SharePageModal";

const NOTIFICATION_POPUP_WIDTH = 280;
/**
 * アバターメニューの幅。項目名（ホーム画面設定 / 通知設定 …）とアイコン・
 * 余白が 1 行に収まる幅を取る — 折り返すと行の高さが揃わず読みにくい。
 * 英語の "Notification settings" が最長なのでそれに合わせている。
 */
const PROFILE_MENU_WIDTH = 260;

/** 開発環境バーの高さ（dev のみ表示。ヘッダー最上部に重ねる）。 */
export const DEV_BAR_HEIGHT = 28;

function canHoverOpen(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

export interface HeaderUser {
  displayName: string;
  username: string;
  initials: string;
  department: string | null;
  title: string | null;
  /** プロフィール写真の URL（未設定なら null → イニシャル表示）。 */
  avatarUrl: string | null;
  /** 同・小サイズ（ヘッダーはこちらを読む）。 */
  avatarThumbUrl: string | null;
}

export function AppHeader({
  user,
  isDev = false,
}: {
  user?: HeaderUser | null;
  isDev?: boolean;
}) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;
  /** 未ログイン時のフォールバック（デモ ID は出さない）。 */
  const guestUser = {
    displayName: tr("common.guest"),
    initials: "—",
    department: "",
    avatarUrl: null as string | null,
    avatarThumbUrl: null as string | null,
  };
  const sessionUser = user
    ? {
        displayName: user.displayName,
        initials: user.initials,
        // 所属（無ければ役職 → ユーザー名の順でフォールバック）。
        department: user.department || user.title || user.username,
        avatarUrl: user.avatarUrl,
        avatarThumbUrl: user.avatarThumbUrl,
      }
    : guestUser;
  const t = useTranslations("shell");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);

  // バグ報告用のコンソール・エラー捕捉（1 回だけ有効化される）
  useEffect(() => {
    installBugReportCapture();
  }, []);
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

  // ヘッダーの「戻る」= ブラウザの戻るボタンと同じ（実際の履歴を 1 つ戻る）。
  // 直接アクセス等で戻り先の履歴が無いときはブラウザの戻るボタン同様に隠す
  // （history はクライアントでのみ判定 — SSR とのミスマッチ回避）。
  const [canGoBack, setCanGoBack] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname re-triggers this on route change (history.length grows/shrinks), it isn't read in the body.
  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, [pathname]);
  const goBack = () => {
    guard(() => router.back());
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
          {tr("layout.appHeader.developmentDev")}
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
          {!isHome && canGoBack && (
            <Tooltip label={tr("common.back2")} withinPortal>
              <ActionIcon
                aria-label={tr("common.backToThePreviousPage")}
                className="header-action"
                color="gray"
                onClick={goBack}
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
                aria-label={tr("layout.appHeader.openTheAppList")}
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
                      {appLabel(currentApp, locale)}
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

          {/*
            操作コード入力はモバイルには置かない（デスクトップのみ）。
            携帯の幅ではアプリ名とアイコン列で埋まってしまい、置くと
            アプリ名が省略されて「いまどこにいるか」が読めなくなる。
            同じ検索はロゴから開くアプリ一覧の中にある。
          */}
        </Group>

        {/* ── Right: Code jump (desktop) + Notifications + User ──────────── */}
        <Group gap="xs" wrap="nowrap">
          <Box visibleFrom="md">
            <OperationCodeJump
              compact
              onNavigate={() => setLauncherOpen(false)}
            />
          </Box>
          {/* ページ共有（tools/demo-system 参照 — 現在の URL を通知として送る） */}
          <Tooltip label={tr("common.shareThisPage")} withinPortal>
            <ActionIcon
              aria-label={tr("common.shareThisPage")}
              className="header-action"
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
          {/* バグ報告（ページ状態・コンソールログを添付して管理者へ） */}
          <Tooltip label={tr("common.reportABug")} withinPortal>
            <ActionIcon
              aria-label={tr("common.reportABug")}
              className="header-action"
              color="gray"
              onClick={() => setBugOpen(true)}
              size="lg"
              variant="subtle"
            >
              <IconBug size={20} />
            </ActionIcon>
          </Tooltip>
          <BugReportModal onClose={() => setBugOpen(false)} opened={bugOpen} />
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
                aria-label={t("notifications")}
                className="header-action"
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
                <Title order={6}>{t("notifications")}</Title>
                <Text
                  c="blue"
                  className="cursor-pointer border-0 bg-transparent p-0"
                  component="button"
                  onClick={handleMarkAllRead}
                  size="xs"
                  type="button"
                >
                  {t("markAllRead")}
                </Text>
              </Group>
              <Divider />
              <ScrollArea mah={{ base: "min(360px, 50dvh)", md: 360 }}>
                <Stack gap={0}>
                  {notifications.length === 0 && (
                    <Text c="dimmed" px="sm" py="md" size="xs" ta="center">
                      {t("noNotifications")}
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
                          {relativeTime(notif.createdAt, tr)}
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
                  {tr("layout.appHeader.showAll")}
                </Text>
              </UnstyledButton>
            </Popover.Dropdown>
          </Popover>

          {/* User menu */}
          <Menu position="bottom-end" shadow="md" width={PROFILE_MENU_WIDTH}>
            <Menu.Target>
              <UserAvatar
                aria-label={tr("layout.appHeader.userMenu")}
                className="cursor-pointer"
                initials={sessionUser.initials}
                name={sessionUser.displayName}
                size="sm"
                src={sessionUser.avatarUrl}
                thumbSrc={sessionUser.avatarThumbUrl}
              />
            </Menu.Target>
            <Menu.Dropdown px="xs">
              <Menu.Label px="0" py="xs">
                <Group align="center" gap="sm" wrap="nowrap">
                  <UserAvatar
                    aria-hidden
                    initials={sessionUser.initials}
                    name={sessionUser.displayName}
                    size="md"
                    src={sessionUser.avatarUrl}
                    thumbSrc={sessionUser.avatarThumbUrl}
                  />
                  {/* 長い氏名・所属でも折り返さない（幅で足りない分は省略）。 */}
                  <Stack className="min-w-0" gap={0}>
                    <Text fw={600} size="sm" truncate>
                      {sessionUser.displayName}
                    </Text>
                    <Text c="dimmed" size="xs" truncate>
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
                {t("profile")}
              </Menu.Item>
              <Menu.Item
                component={Link}
                href="/profile/notifications"
                leftSection={<IconBell size={14} />}
                py={{ base: "sm", md: "xs" }}
              >
                {t("notificationSettings")}
              </Menu.Item>
              <Menu.Item
                component={Link}
                href="/profile/home"
                leftSection={<IconLayoutDashboard size={14} />}
                py={{ base: "sm", md: "xs" }}
              >
                {t("homeSettings")}
              </Menu.Item>
              <Menu.Item
                component={Link}
                href="/profile/preferences"
                leftSection={<IconLanguage size={14} />}
                py={{ base: "sm", md: "xs" }}
              >
                {t("preferences")}
              </Menu.Item>
              <Menu.Item
                component={Link}
                href="/profile/permissions"
                leftSection={<IconShieldCheck size={14} />}
                py={{ base: "sm", md: "xs" }}
              >
                {t("myPermissions")}
              </Menu.Item>
              <Divider my="5px" />
              <Menu.Item
                color="red"
                leftSection={<IconLogout size={14} />}
                onClick={() => signOut({ callbackUrl: "/login" })}
                py={{ base: "sm", md: "xs" }}
              >
                {t("logout")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </AppShell.Header>
  );
}
