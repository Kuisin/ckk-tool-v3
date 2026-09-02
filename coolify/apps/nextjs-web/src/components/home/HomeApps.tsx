"use client";

/**
 * HomeApps.tsx — dashboard home content (_specs/design.md §7).
 *
 * User profile card + app card grid. 表示は ホーム画面設定
 * （app.user_home_settings — /profile/home）に従う: お気に入りを上部に固定し、
 * 残りをカテゴリ別（標準）またはカスタムグループ別に表示する。
 * 工程絞り込み（?wp=）中は従来どおりカテゴリ表示のみ。App cards are Links.
 */

import {
  Badge,
  Card,
  CloseButton,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
  useComputedColorScheme,
} from "@mantine/core";
import { IconLayoutDashboard, IconStarFilled } from "@tabler/icons-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useHiddenApps, useUnreleasedApps } from "@/components/layout/AppFlags";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useIsMobile } from "@/hooks/useViewport";
import {
  type AppEntry,
  appLabel,
  appList,
  CATEGORY_COLORS,
  categoryLabel,
  isAppCategory,
  WORKPROCESS_PARAM,
} from "@/lib/app-list";
import {
  DEFAULT_HOME_SETTINGS,
  type HomeSettings,
  organizeHomeApps,
  UNGROUPED_SECTION_TITLE,
} from "@/lib/home-settings-core";
import {
  type AppIcon,
  CATEGORY_SECTION_ICONS,
  resolveAppIcon,
} from "@/lib/icons";

export interface HomeUser {
  displayName: string;
  initials: string;
  username: string;
  department: string | null;
  title: string | null;
  email: string | null;
  office: string | null;
  company: string | null;
  avatarUrl: string | null;
  avatarThumbUrl: string | null;
}

interface HomeAppsProps {
  /** Passed from the Server Component parent — avoids client-side session fetch. */
  user?: HomeUser;
  /** ホーム画面設定（app.user_home_settings — サーバー側で読んで渡す）。 */
  settings?: HomeSettings;
  /** Shows Skeleton placeholders while permissions resolve. */
  isLoading?: boolean;
}

export function HomeApps({
  user,
  settings = DEFAULT_HOME_SETTINGS,
  isLoading = false,
}: HomeAppsProps) {
  const locale = useLocale();
  const t = useTranslations("home");
  /** 未ログイン時のフォールバック（デモ ID は出さない）。 */
  const guestUser: HomeUser = {
    displayName: t("guest"),
    initials: "—",
    username: "",
    department: null,
    title: null,
    email: null,
    office: null,
    company: null,
    avatarUrl: null,
    avatarThumbUrl: null,
  };
  const effectiveUser = user ?? guestUser;
  const displayName = effectiveUser.username
    ? effectiveUser.displayName
    : t("guest");
  const hiddenApps = useHiddenApps();
  const unreleasedApps = useUnreleasedApps();
  const searchParams = useSearchParams();
  // 工程（カテゴリ）絞り込み。パンくずの工程リンクから遷移してくる。
  const rawWp = searchParams.get(WORKPROCESS_PARAM);
  const workprocess = rawWp && isAppCategory(rawWp) ? rawWp : null;
  // 環境別フラグで無効化されたアプリはカードを出さない。
  const visibleApps = appList.filter((a) => !hiddenApps.has(a.key));
  // 工程絞り込み中はカスタマイズを適用せず、その工程のカテゴリ表示のみ。
  const organized = workprocess
    ? organizeHomeApps(
        visibleApps.filter((a) => a.category === workprocess),
        DEFAULT_HOME_SETTINGS,
      )
    : organizeHomeApps(visibleApps, settings);
  const colorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: false,
  });
  const isDark = colorScheme === "dark";
  const isMobile = useIsMobile();

  const renderAppCard = (app: AppEntry) => {
    const IconComponent = resolveAppIcon(app.icon);
    return isLoading ? (
      <Skeleton height={110} key={app.key} radius="md" />
    ) : (
      <UnstyledButton
        className="app-card"
        component={Link}
        href={app.href}
        key={app.key}
      >
        <Paper h="100%" p="md" pos="relative" radius="md" withBorder>
          {unreleasedApps.has(app.key) && (
            <Badge
              color="orange"
              pos="absolute"
              right={6}
              size="xs"
              style={{ pointerEvents: "none" }}
              top={6}
              variant="filled"
            >
              DEV
            </Badge>
          )}
          <Stack align="center" gap="sm">
            <ThemeIcon
              color={CATEGORY_COLORS[app.category]}
              radius="md"
              size={56}
              variant="light"
            >
              <IconComponent size={28} />
            </ThemeIcon>
            <Text fw={500} lh={1.3} size="sm" ta="center">
              {appLabel(app, locale)}
            </Text>
            <Text c="dimmed" className="tabular-nums" size="xs">
              {app.operationCode}
            </Text>
          </Stack>
        </Paper>
      </UnstyledButton>
    );
  };

  return (
    <Stack gap="xl" maw={1200} mx="auto" w="100%">
      {/* ── User profile card ──────────────────────────────────────────── */}
      <Card padding="sm" radius="md" shadow="xs" withBorder>
        <Group align="center" justify="space-between" wrap="nowrap">
          <Group align="center" gap="sm" wrap="nowrap">
            <UserAvatar
              initials={effectiveUser.initials}
              name={displayName}
              size={44}
              src={effectiveUser.avatarUrl}
              thumbSrc={effectiveUser.avatarThumbUrl}
            />
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Group align="center" gap="xs" wrap="wrap">
                <Text fw={600} size="sm" truncate>
                  {displayName}
                </Text>
                {effectiveUser.department && (
                  <Badge color="blue" size="xs" variant="light">
                    {effectiveUser.department}
                  </Badge>
                )}
                {effectiveUser.title && (
                  <Badge color="gray" size="xs" variant="light">
                    {effectiveUser.title}
                  </Badge>
                )}
              </Group>
              {(effectiveUser.username ||
                effectiveUser.email ||
                effectiveUser.company ||
                effectiveUser.office) && (
                <Text c="dimmed" size="xs" truncate>
                  {[
                    effectiveUser.username,
                    effectiveUser.email,
                    effectiveUser.company,
                    effectiveUser.office,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              )}
            </Stack>
          </Group>

          {/* biome-ignore lint/performance/noImgElement: static SVG logo — next/image adds no value */}
          <img
            alt="シー・ケィ・ケー株式会社"
            className="h-8 w-8 shrink-0 opacity-75"
            src={
              isDark
                ? "/design-assets/dark_logo-with-label.svg"
                : "/design-assets/logo-with-label.svg"
            }
          />
        </Group>
      </Card>

      {/*
        工程での絞り込み表示（パンくずの工程リンクから）。絞り込み中だけ出す。
        ホーム画面設定への導線はここには置かない — 設定系はアバターメニューに
        まとめてあり、ホームはアプリを選ぶ場所に徹する。
      */}
      {workprocess && (
        <Group gap="xs" wrap="nowrap">
          <Text c="dimmed" size="sm">
            {t("workprocessFilter")}
          </Text>
          <Badge color={CATEGORY_COLORS[workprocess]} size="lg" variant="light">
            {categoryLabel(workprocess, locale)}
          </Badge>
          <CloseButton
            aria-label={t("clearFilter")}
            component={Link}
            href="/"
            size="sm"
          />
        </Group>
      )}

      {/* ── お気に入り（ホーム画面設定で選択・上部固定） ─────────────────── */}
      {organized.starred.length > 0 && (
        <Stack gap="sm">
          <Group gap="xs">
            <ThemeIcon color="yellow" radius="sm" size="sm" variant="light">
              <IconStarFilled size={14} />
            </ThemeIcon>
            <Title c="dimmed" order={5}>
              {t("favorites")}
            </Title>
          </Group>
          <SimpleGrid cols={isMobile ? 2 : 4} spacing="sm">
            {organized.starred.map(renderAppCard)}
          </SimpleGrid>
          <Divider mt="xs" />
        </Stack>
      )}

      {/* ── App sections（カテゴリ別 or カスタムグループ別） ─────────────── */}
      {organized.sections.map((section, index) => {
        const SectionIcon: AppIcon = section.category
          ? CATEGORY_SECTION_ICONS[section.category]
          : IconLayoutDashboard;
        const sectionColor = section.category
          ? CATEGORY_COLORS[section.category]
          : "blue";

        return (
          <Stack gap="sm" key={section.key}>
            <Group gap="xs">
              <ThemeIcon
                color={sectionColor}
                radius="sm"
                size="sm"
                variant="light"
              >
                <SectionIcon size={14} />
              </ThemeIcon>
              <Title c="dimmed" order={5}>
                {section.category
                  ? categoryLabel(section.category, locale)
                  : section.title === UNGROUPED_SECTION_TITLE
                    ? t("other")
                    : section.title}
              </Title>
            </Group>

            <SimpleGrid cols={isMobile ? 2 : 4} spacing="sm">
              {section.apps.map(renderAppCard)}
            </SimpleGrid>

            {index < organized.sections.length - 1 && <Divider mt="xs" />}
          </Stack>
        );
      })}
    </Stack>
  );
}
