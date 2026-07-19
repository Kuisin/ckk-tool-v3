"use client";

/**
 * HomeApps.tsx — dashboard home content (_specs/design.md §7).
 *
 * User profile card + category-grouped app card grid. App cards are Links.
 * TODO(auth): pass the real user from the Server Component parent (Auth.js
 * session) and filter apps by permission (user_permissions view).
 */

import {
  Avatar,
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
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useDisabledApps,
  useUnreleasedApps,
} from "@/components/layout/AppFlags";
import { useIsMobile } from "@/hooks/useViewport";
import {
  CATEGORY_COLORS,
  getAppsByCategory,
  isAppCategory,
  WORKPROCESS_PARAM,
} from "@/lib/app-list";
import { CATEGORY_SECTION_ICONS, resolveAppIcon } from "@/lib/icons";

export interface HomeUser {
  displayName: string;
  initials: string;
  username: string;
  department: string;
  avatarUrl: string | null;
}

const MOCK_USER: HomeUser = {
  displayName: "山田 太郎",
  initials: "山田",
  username: "yamada.taro",
  department: "製造部",
  avatarUrl: null,
};

interface HomeAppsProps {
  /** Passed from the Server Component parent — avoids client-side session fetch. */
  user?: HomeUser;
  /** Shows Skeleton placeholders while permissions resolve. */
  isLoading?: boolean;
}

export function HomeApps({
  user = MOCK_USER,
  isLoading = false,
}: HomeAppsProps) {
  const disabledApps = useDisabledApps();
  const unreleasedApps = useUnreleasedApps();
  const searchParams = useSearchParams();
  // 工程（カテゴリ）絞り込み。パンくずの工程リンクから遷移してくる。
  const rawWp = searchParams.get(WORKPROCESS_PARAM);
  const workprocess = rawWp && isAppCategory(rawWp) ? rawWp : null;
  // 環境別フラグで無効化されたアプリはカードを出さない（空カテゴリも消す）。
  const categories = getAppsByCategory()
    .map((c) => ({
      ...c,
      apps: c.apps.filter((a) => !disabledApps.has(a.key)),
    }))
    .filter((c) => c.apps.length > 0)
    // 工程が指定されていれば、その工程だけに絞り込む。
    .filter((c) => !workprocess || c.category === workprocess);
  const colorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: false,
  });
  const isDark = colorScheme === "dark";
  const isMobile = useIsMobile();

  return (
    <Stack gap="xl" maw={1200} mx="auto" p="md" w="100%">
      {/* ── User profile card ──────────────────────────────────────────── */}
      <Card padding="lg" radius="md" shadow="xs" withBorder>
        <Group align="flex-start" justify="space-between" wrap="nowrap">
          <Group>
            <Avatar
              color="blue"
              radius="xl"
              size={72}
              src={user.avatarUrl ?? undefined}
            >
              {user.initials}
            </Avatar>
            <Stack gap={4}>
              <Title order={3}>{user.displayName}</Title>
              <Text c="dimmed" size="sm">
                {user.username}
              </Text>
              <Badge color="blue" size="sm" variant="light">
                {user.department}
              </Badge>
            </Stack>
          </Group>

          {/* biome-ignore lint/performance/noImgElement: static SVG logo — next/image adds no value */}
          <img
            alt="シー・ケィ・ケー株式会社"
            className="h-14 w-14 shrink-0 opacity-75"
            src={
              isDark
                ? "/design-assets/dark_logo-with-label.svg"
                : "/design-assets/logo-with-label.svg"
            }
          />
        </Group>
      </Card>

      {/* ── 工程での絞り込み表示（パンくずの工程リンクから） ──────────────── */}
      {workprocess && (
        <Group gap="xs" wrap="nowrap">
          <Text c="dimmed" size="sm">
            工程で絞り込み中:
          </Text>
          <Badge color={CATEGORY_COLORS[workprocess]} size="lg" variant="light">
            {workprocess}
          </Badge>
          <CloseButton
            aria-label="絞り込みを解除"
            component={Link}
            href="/"
            size="sm"
          />
        </Group>
      )}

      {/* ── App categories ─────────────────────────────────────────────── */}
      {categories.map((cat, catIndex) => {
        const SectionIcon = CATEGORY_SECTION_ICONS[cat.category];

        return (
          <Stack gap="sm" key={cat.category}>
            <Group gap="xs">
              <ThemeIcon
                color={cat.color}
                radius="sm"
                size="sm"
                variant="light"
              >
                <SectionIcon size={14} />
              </ThemeIcon>
              <Title c="dimmed" order={5}>
                {cat.category}
              </Title>
            </Group>

            <SimpleGrid cols={isMobile ? 2 : 4} spacing="sm">
              {cat.apps.map((app) => {
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
                    <Paper
                      h="100%"
                      p="md"
                      pos="relative"
                      radius="md"
                      withBorder
                    >
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
                          color={cat.color}
                          radius="md"
                          size={56}
                          variant="light"
                        >
                          <IconComponent size={28} />
                        </ThemeIcon>
                        <Text fw={500} lh={1.3} size="sm" ta="center">
                          {app.label}
                        </Text>
                        <Text c="dimmed" className="tabular-nums" size="xs">
                          {app.operationCode}
                        </Text>
                      </Stack>
                    </Paper>
                  </UnstyledButton>
                );
              })}
            </SimpleGrid>

            {catIndex < categories.length - 1 && <Divider mt="xs" />}
          </Stack>
        );
      })}
    </Stack>
  );
}
