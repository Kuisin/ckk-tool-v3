'use client';

/**
 * HomeApps.tsx — Dashboard home page content
 *
 * ─── COMPONENT MAP ───────────────────────────────────────────────────────────
 *
 *  HomeApps
 *  ├── Card (user profile)                [Mantine]
 *  │   └── Group
 *  │       ├── Avatar (initials or image)  [Mantine]
 *  │       └── Stack
 *  │           ├── Title (display name)
 *  │           ├── Text (username)
 *  │           └── Text (department)
 *  └── Stack (app categories)
 *      └── [per category]
 *          ├── Group (category header)     [Mantine]
 *          │   ├── ThemeIcon + Title
 *          │   └── (optional count badge)
 *          ├── SimpleGrid cols={...}       [Mantine]
 *          │   └── UnstyledButton × N      [Mantine]
 *          │       └── Paper (app card)   [Mantine]
 *          │           └── Stack > ThemeIcon + Text
 *          └── Divider                    [Mantine]
 *
 * ─── CUSTOMIZATIONS ──────────────────────────────────────────────────────────
 *
 * [Mantine] Card for the user profile section — `withBorder` gives a clear visual
 *           separation. Uses standard Mantine Card (no customization needed).
 *
 * [Mantine] Avatar with color="blue" shows initials fallback when no image URL.
 *           To show a real image: <Avatar src={user.avatarUrl} size="xl" radius="xl" />
 *           with a fallback to initials if src is null.
 *
 * [Mantine] SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }}
 *           - 2 cols on mobile (stacked cards, touch-friendly)
 *           - 3 cols on tablet
 *           - 4 cols on desktop (matches the demo system's grid density)
 *
 * [Custom] App cards are larger on the home page than in the launcher (64px icon vs 40px).
 *          This is intentional: the home page is the primary navigation surface,
 *          so cards are more prominent and easier to tap on a tablet.
 *
 * [Custom] Category ThemeIcon in the section header: matches the color from CATEGORY_COLORS.
 *          This color-coding helps users quickly identify sections by color, not just text.
 *
 * [CSS module] Lift effect on hover (translateY + shadow) — see HomeApps.module.css.
 *              @media (prefers-reduced-motion) disables the animation.
 *
 * [NOT Tailwind] Demo system's home page used Tailwind grid + flex. Replaced with
 *                Mantine SimpleGrid (responsive, theme-aware) and Card/Paper components.
 *
 * [Custom] User profile section is the top "hero" area — replaces the demo's plain
 *          avatar + text layout with a Card for better visual hierarchy.
 */

import type { ComponentType } from 'react';
import {
  Avatar,
  Badge,
  Card,
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
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconAtom,
  IconBolt,
  IconBoxSeam,
  IconBuilding,
  IconBuildingFactory2,
  IconCalendarDue,
  IconClipboardCheck,
  IconClipboardList,
  IconCurrencyYen,
  IconCylinder,
  IconFileInvoice,
  IconFileText,
  IconGitBranch,
  IconListCheck,
  IconPackageImport,
  IconReceipt,
  IconRuler2,
  IconSettings2,
  IconShieldCheck,
  IconStack2,
  IconTruck,
  IconTruckDelivery,
  IconUsers,
  IconUsersGroup,
} from '@tabler/icons-react';
import classes from './HomeApps.module.css';
import { CATEGORY_COLORS, type AppCategory, getAppsByCategory } from '../lib/app-list';

// Icon lookup map (same as AppLauncher — extract to a shared util in production)
const ICON_MAP: Record<string, ComponentType<{ size?: number }>> = {
  IconCurrencyYen,
  IconFileText,
  IconClipboardCheck,
  IconRuler2,
  IconPackageImport,
  IconTruckDelivery,
  IconClipboardList,
  IconSettings2,
  IconShieldCheck,
  IconBoxSeam,
  IconStack2,
  IconTruck,
  IconReceipt,
  IconFileInvoice,
  IconCalendarDue,
  IconBuilding,
  IconUsers,
  IconCylinder,
  IconAtom,
  IconBolt,
  IconBuildingFactory2,
  IconGitBranch,
  IconListCheck,
  IconAlertTriangle,
  IconUsersGroup,
};

// Category section header icons
// [Custom] Each category has a representative "section icon" for the heading
const CATEGORY_SECTION_ICONS: Record<AppCategory, ComponentType<{ size?: number }>> = {
  '販売': IconCurrencyYen,
  '購買': IconPackageImport,
  '生産': IconSettings2,
  '出荷': IconTruck,
  '請求': IconFileInvoice,
  'マスタ': IconBuilding,
};

// Mock user — in production, this comes from the Auth.js session server-side,
// then passed as props to this 'use client' component
const MOCK_USER = {
  displayName: '山田 太郎',
  initials: '山田',
  username: 'yamada.taro',
  department: '製造部',
  avatarUrl: null as string | null, // null = show initials
};

interface HomeAppsProps {
  /** Passed from the Server Component parent — avoids client-side session fetch */
  user?: typeof MOCK_USER;
  /** Loading state — shows Skeleton placeholders while permissions resolve */
  isLoading?: boolean;
}

export function HomeApps({ user = MOCK_USER, isLoading = false }: HomeAppsProps) {
  const categories = getAppsByCategory();

  return (
    <Stack gap="xl" p="md" maw={1200}>

      {/* ── User profile card ─────────────────────────────────────────────── */}
      {/*
       * [Mantine] Card with withBorder + shadow="xs" — standard detail container.
       * [Custom] This replaces the demo system's plain centered avatar+text.
       *          A Card provides clearer visual hierarchy and looks more polished.
       */}
      <Card withBorder shadow="xs" radius="md" padding="lg">
        <Group>
          {/*
           * [Mantine] Avatar size="xl" radius="xl" color="blue"
           * - Shows initials as fallback when src is null
           * - In production: <Avatar src={user.avatarUrl} ...>{user.initials}</Avatar>
           */}
          <Avatar
            size={72}
            radius="xl"
            color="blue"
            src={user.avatarUrl ?? undefined}
          >
            {user.initials}
          </Avatar>
          <Stack gap={4}>
            <Title order={3}>{user.displayName}</Title>
            <Text size="sm" c="dimmed">{user.username}</Text>
            {/* [Mantine] Badge for department — more prominent than plain Text */}
            {/* [Custom] variant="light" keeps it subtle; outline would be too noisy */}
            <Badge variant="light" color="blue" size="sm">
              {user.department}
            </Badge>
          </Stack>
        </Group>
      </Card>

      {/* ── App categories ────────────────────────────────────────────────── */}
      {categories.map((cat, catIndex) => {
        const SectionIcon = CATEGORY_SECTION_ICONS[cat.category];

        return (
          <Stack key={cat.category} gap="sm">
            {/* Category header */}
            {/*
             * [Mantine] Group with ThemeIcon + Title for the section heading.
             * [Custom] ThemeIcon uses the same category color as the app cards —
             *          consistent color-coding throughout the page.
             */}
            <Group gap="xs">
              <ThemeIcon variant="light" color={cat.color} size="sm" radius="sm">
                <SectionIcon size={14} />
              </ThemeIcon>
              <Title order={5} c="dimmed">{cat.category}</Title>
            </Group>

            {/* App card grid */}
            {/*
             * [Mantine] SimpleGrid responsive columns:
             *   - base=2: mobile (2 cards per row, ~160px each on 375px screen)
             *   - sm=3: tablet (768px+)
             *   - lg=4: desktop (1024px+)
             * [Custom] spacing="sm" — tighter than the default "md" for a denser grid
             *          that doesn't feel too airy on large screens.
             */}
            <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="sm">
              {cat.apps.map((app) => {
                const IconComponent = ICON_MAP[app.icon] ?? IconFileText;

                return isLoading ? (
                  // [Mantine] Skeleton placeholder while permissions are loading
                  <Skeleton key={app.key} height={110} radius="md" />
                ) : (
                  <UnstyledButton
                    key={app.key}
                    className={classes.appCard}
                  >
                    {/*
                     * [Mantine] Paper withBorder radius="md" p="md" — the card container.
                     * [Custom] Paper chosen over Card here because we want a simpler
                     *          structure (no header/section slots). withBorder gives a
                     *          clear edge without shadow; the hover shadow comes from CSS module.
                     */}
                    <Paper withBorder radius="md" p="md" h="100%">
                      <Stack align="center" gap="sm">
                        {/*
                         * [Mantine] ThemeIcon size={56} radius="md"
                         * [Custom] size=56 (3.5rem) — larger than launcher (40px) for
                         *          better visual impact on the home page.
                         * [Custom] variant="light" keeps the icon area pastel/soft.
                         *          variant="filled" would be too bold for many cards on screen.
                         */}
                        <ThemeIcon
                          variant="light"
                          color={cat.color}
                          size={56}
                          radius="md"
                        >
                          <IconComponent size={28} />
                        </ThemeIcon>
                        <Text size="sm" ta="center" fw={500} lh={1.3}>
                          {app.label}
                        </Text>
                      </Stack>
                    </Paper>
                  </UnstyledButton>
                );
              })}
            </SimpleGrid>

            {/* Divider between categories (not after the last one) */}
            {/* [Mantine] Divider mt="xs" — subtle separator */}
            {catIndex < categories.length - 1 && <Divider mt="xs" />}
          </Stack>
        );
      })}
    </Stack>
  );
}
