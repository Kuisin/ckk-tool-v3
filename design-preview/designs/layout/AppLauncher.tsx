'use client';

import type { ComponentType } from 'react';
import {
  Box,
  Divider,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
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
  IconHome,
  IconListCheck,
  IconPackageImport,
  IconReceipt,
  IconRuler2,
  IconSearch,
  IconSettings2,
  IconShieldCheck,
  IconStack2,
  IconTruck,
  IconTruckDelivery,
  IconUsers,
  IconUsersGroup,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CATEGORY_COLORS, appList, getAppsByCategory } from '../lib/app-list';
import classes from './AppLauncher.module.css';

// Map icon string names to actual components
// [Custom] This lookup is needed because app-list.ts stores icon names as strings
// (for JSON-serializable config). In production, you can import directly instead.
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

interface AppLauncherProps {
  /** Called when the user clicks an app link — used to close the Popover */
  onNavigate?: () => void;
}

export function AppLauncher({ onNavigate }: AppLauncherProps) {
  const [search, setSearch] = useState('');
  const categories = getAppsByCategory();

  // Filter for search mode
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return appList.filter((app) => app.label.toLowerCase().includes(q));
  }, [search]);

  return (
    <Stack gap="sm" w={520}>
      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      {/* [Mantine] TextInput — size="sm" matches global theme default */}
      <TextInput
        placeholder="アプリを検索..."
        leftSection={<IconSearch size={14} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        autoFocus
      />

      {/* ── Home shortcut ──────────────────────────────────────────────────── */}
      {/* [Custom] Quick link back to home page, always visible above the grid */}
      <Box
        component={Link}
        href="/"
        onClick={onNavigate}
        p="xs"
        className={classes.homeLink}
      >
        <Group gap="xs">
          <ThemeIcon variant="light" color="blue" size="sm" radius="sm">
            <IconHome size={14} />
          </ThemeIcon>
          <Text size="sm" c="dimmed">ホーム</Text>
        </Group>
      </Box>

      <Divider />

      {/* ── App grid or search results ─────────────────────────────────────── */}
      {/* [Custom] ScrollArea caps height at 420px so the popover doesn't overflow viewport */}
      <ScrollArea mah={420} offsetScrollbars>
        {searchResults ? (
          /* Search results: flat list */
          /* [Custom] Flat list replaces the grid when searching, with category label as hint */
          <Stack gap={2}>
            {searchResults.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                該当するアプリが見つかりません
              </Text>
            ) : (
              searchResults.map((app) => {
                const IconComponent = ICON_MAP[app.icon] ?? IconFileText;
                return (
                  <UnstyledButton
                    key={app.key}
                    component={Link}
                    href={app.href}
                    onClick={onNavigate}
                    className={classes.searchRow}
                    px="xs"
                    py={6}
                  >
                    <Group gap="sm">
                      <ThemeIcon
                        variant="light"
                        color={CATEGORY_COLORS[app.category]}
                        size="sm"
                        radius="sm"
                      >
                        <IconComponent size={13} />
                      </ThemeIcon>
                      <Text size="sm">{app.label}</Text>
                      {/* [Custom] Category shown as a subtle secondary label in search results */}
                      <Text size="xs" c="dimmed">{app.category}</Text>
                    </Group>
                  </UnstyledButton>
                );
              })
            )}
          </Stack>
        ) : (
          /* Default: categorized grid */
          <Stack gap="md">
            {categories.map((cat) => (
              <Box key={cat.category}>
                {/* [Mantine] Title order={6} for category label — small, de-emphasized */}
                <Title order={6} c="dimmed" tt="uppercase" fz={10} mb="xs" px="xs">
                  {cat.category}
                </Title>
                {/* [Mantine] SimpleGrid cols={3} */}
                {/* [Custom] spacing="xs" keeps cards compact in the 520px popover */}
                <SimpleGrid cols={3} spacing="xs">
                  {cat.apps.map((app) => {
                    const IconComponent = ICON_MAP[app.icon] ?? IconFileText;
                    return (
                      <UnstyledButton
                        key={app.key}
                        component={Link}
                        href={app.href}
                        onClick={onNavigate}
                        className={classes.appCard}
                        p="sm"
                      >
                        <Stack align="center" gap={6}>
                          {/* [Mantine] ThemeIcon — color from CATEGORY_COLORS */}
                          {/* [Custom] size="xl" radius="md" for a rounded-square icon look */}
                          <ThemeIcon
                            variant="light"
                            color={cat.color}
                            size="xl"
                            radius="md"
                          >
                            <IconComponent size={20} />
                          </ThemeIcon>
                          <Text size="xs" ta="center" lh={1.3}>
                            {app.label}
                          </Text>
                        </Stack>
                      </UnstyledButton>
                    );
                  })}
                </SimpleGrid>
              </Box>
            ))}
          </Stack>
        )}
      </ScrollArea>
    </Stack>
  );
}
