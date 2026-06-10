'use client';

import type { ComponentType } from 'react';
import {
  Divider,
  Group,
  Paper,
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
import { useMemo, useState } from 'react';
import { CATEGORY_COLORS, type AppCategory, appList, getAppsByCategory } from '../lib/app-list';
import { resolveOperationCode, searchOperationCodes, navigateByOperationCode, sanitizeOperationCodeInput, formatOperationCodeDisplay } from '../lib/operation-codes';
import classes from './AppLauncher.module.css';

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

const CATEGORY_SECTION_ICONS: Record<AppCategory, ComponentType<{ size?: number }>> = {
  '販売': IconCurrencyYen,
  '購買': IconPackageImport,
  '生産': IconSettings2,
  '出荷': IconTruck,
  '請求': IconFileInvoice,
  'マスタ': IconBuilding,
};

interface AppLauncherProps {
  /** Called when the user clicks an app link — used to close the Popover */
  onNavigate?: () => void;
}

function jumpToCode(code: string, onNavigate?: () => void) {
  navigateByOperationCode(code, {
    onNavigate: (href) => {
      onNavigate?.();
      if (typeof window !== 'undefined') {
        window.location.assign(href);
      }
    },
  });
}

export function AppLauncher({ onNavigate }: AppLauncherProps) {
  const [search, setSearch] = useState('');
  const categories = getAppsByCategory();

  const searchResults = useMemo(() => {
    const q = search.trim();
    if (!q) return null;

    const codeMatch = resolveOperationCode(q);
    if (codeMatch) return [codeMatch];

    const codeResults = searchOperationCodes(q, 12);
    const cleaned = sanitizeOperationCodeInput(q);
    if (cleaned && codeResults.length > 0) return codeResults;

    const labelResults = appList.filter((app) =>
      app.label.toLowerCase().includes(q.toLowerCase())
        || app.operationCode.toUpperCase().startsWith(cleaned),
    );

    if (labelResults.length > 0) {
      return labelResults.flatMap((app) => {
        const resolved = resolveOperationCode(app.operationCode);
        return resolved ? [resolved] : [];
      });
    }

    return codeResults;
  }, [search]);

  return (
    <Stack gap="sm" w="100%" miw={0}>
      <Group gap="0" wrap="nowrap" align="stretch" px="xs" py="2xs">
        <UnstyledButton
          onClick={onNavigate}
          className={classes.homeLink}
          px="xs"
          aria-label="ホームへ移動"
        >
          <IconHome size={24} stroke={1.5} />
        </UnstyledButton>
        <TextInput
          flex={1}
          placeholder="操作コード / アプリ名..."
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && search.trim()) {
              jumpToCode(search.trim(), onNavigate);
            }
          }}
          autoFocus
        />
      </Group>

      <Divider mx="xs" />

      <ScrollArea.Autosize mah={420} type="auto" w="100%" miw={0}>
        {searchResults ? (
          <Stack gap={2} mx="xs">
            {searchResults.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                該当するアプリが見つかりません
              </Text>
            ) : (
              searchResults.map((entry) => {
                const app = appList.find((a) => a.href === entry.href);
                const IconComponent = app ? (ICON_MAP[app.icon] ?? IconFileText) : IconFileText;
                const jumpCode = entry.code;
                return (
                  <UnstyledButton
                    key={entry.code}
                    onClick={() => jumpToCode(jumpCode, onNavigate)}
                    className={classes.searchRow}
                    px="xs"
                    py={6}
                  >
                    <Group gap="sm">
                      <ThemeIcon
                        variant="light"
                        color={entry.category === '共通' ? 'gray' : CATEGORY_COLORS[entry.category as AppCategory]}
                        size="md"
                        radius="sm"
                      >
                        <IconComponent size={14} />
                      </ThemeIcon>
                      <Text size="sm" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatOperationCodeDisplay(entry)}
                      </Text>
                      <Text size="sm">{entry.label}</Text>
                      <Text size="xs" c="dimmed">{entry.category}</Text>
                    </Group>
                  </UnstyledButton>
                );
              })
            )}
          </Stack>
        ) : (
          <Stack gap="md" mx="xs">
            {categories.map((cat, catIndex) => {
              const SectionIcon = CATEGORY_SECTION_ICONS[cat.category];

              return (
                <Stack key={cat.category} gap="sm">
                  <Group gap="xs">
                    <ThemeIcon variant="light" color={cat.color} size="md" radius="sm">
                      <SectionIcon size={14} />
                    </ThemeIcon>
                    <Title order={5} c="dimmed">{cat.category}</Title>
                  </Group>

                  <SimpleGrid cols={3} spacing="sm">
                    {cat.apps.map((app) => {
                      const IconComponent = ICON_MAP[app.icon] ?? IconFileText;
                      return (
                        <UnstyledButton
                          key={app.key}
                          onClick={onNavigate}
                          className={classes.appCard}
                        >
                          <Paper withBorder radius="md" p="md" h="100%">
                            <Stack align="center" gap="sm">
                              <ThemeIcon
                                variant="light"
                                color={cat.color}
                                size="xl"
                                radius="md"
                              >
                                <IconComponent size={28} />
                              </ThemeIcon>
                              <Text size="sm" ta="center" fw={500} lh={1.3}>
                                {app.label}
                              </Text>
                              <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
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
        )}
      </ScrollArea.Autosize>
    </Stack>
  );
}
