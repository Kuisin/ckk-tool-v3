"use client";

/**
 * AppLauncher.tsx — app grid popover content (_specs/design.md §5).
 *
 * Home shortcut + operation-code/app-name search + category app grid.
 * Cards are real Next.js Links; `onNavigate` closes the parent Popover.
 */

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
} from "@mantine/core";
import { IconHome, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AppCategory,
  appList,
  CATEGORY_COLORS,
  getAppsByCategory,
} from "@/lib/app-list";
import { CATEGORY_SECTION_ICONS, resolveAppIcon } from "@/lib/icons";
import {
  formatOperationCodeDisplay,
  navigateByOperationCode,
  resolveOperationCode,
  sanitizeOperationCodeInput,
  searchOperationCodes,
} from "@/lib/operation-codes";

interface AppLauncherProps {
  /** Called after navigation — used to close the Popover. */
  onNavigate?: () => void;
}

export function AppLauncher({ onNavigate }: AppLauncherProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  // Index of the keyboard-highlighted search result (Arrow Up/Down).
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const categories = getAppsByCategory();

  function jumpToCode(code: string) {
    navigateByOperationCode(code, {
      onNavigate: (href) => {
        router.push(href);
        onNavigate?.();
      },
    });
  }

  const searchResults = useMemo(() => {
    const q = search.trim();
    if (!q) return null;

    const codeMatch = resolveOperationCode(q);
    if (codeMatch) return [codeMatch];

    const codeResults = searchOperationCodes(q, 12);
    const cleaned = sanitizeOperationCodeInput(q);
    if (cleaned && codeResults.length > 0) return codeResults;

    const labelResults = appList.filter(
      (app) =>
        app.label.toLowerCase().includes(q.toLowerCase()) ||
        app.operationCode.toUpperCase().startsWith(cleaned),
    );

    if (labelResults.length > 0) {
      return labelResults.flatMap((app) => {
        const resolved = resolveOperationCode(app.operationCode);
        return resolved ? [resolved] : [];
      });
    }

    return codeResults;
  }, [search]);

  // Keep the highlighted result scrolled into view as it moves.
  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <Stack gap="sm" miw={0} w="100%">
      <Group align="center" gap={4} px="xs" wrap="nowrap">
        <UnstyledButton
          aria-label="ホームへ移動"
          className="home-link"
          component={Link}
          href="/"
          onClick={onNavigate}
          px={8}
          py={4}
        >
          <IconHome size={24} stroke={1.5} />
        </UnstyledButton>
        <TextInput
          aria-activedescendant={
            searchResults?.length
              ? `app-search-option-${activeIndex}`
              : undefined
          }
          aria-autocomplete="list"
          aria-controls="app-search-listbox"
          aria-expanded={Boolean(searchResults?.length)}
          autoFocus
          flex={1}
          leftSection={<IconSearch size={14} />}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setActiveIndex(0);
          }}
          onKeyDown={(e) => {
            // Let the IME own keystrokes while composing (Japanese app names).
            if (e.nativeEvent.isComposing) return;

            const results = searchResults;
            if (!results || results.length === 0) {
              if (e.key === "Enter" && search.trim()) {
                jumpToCode(search.trim());
              }
              return;
            }

            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => (i - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              jumpToCode((results[activeIndex] ?? results[0]).code);
            }
          }}
          placeholder="操作コード / アプリ名..."
          role="combobox"
          value={search}
        />
      </Group>

      <Divider mx="xs" />

      <ScrollArea.Autosize
        mah={{ base: "min(420px, 60dvh)", md: 420 }}
        miw={0}
        type="auto"
        w="100%"
      >
        {searchResults ? (
          <Stack
            aria-label="検索結果"
            gap={2}
            id="app-search-listbox"
            mx="xs"
            role="listbox"
          >
            {searchResults.length === 0 ? (
              <Text c="dimmed" py="md" size="sm" ta="center">
                該当するアプリが見つかりません
              </Text>
            ) : (
              searchResults.map((entry, index) => {
                const app = appList.find((a) => a.href === entry.href);
                const IconComponent = resolveAppIcon(app?.icon ?? "");
                return (
                  <UnstyledButton
                    aria-selected={index === activeIndex}
                    className="search-row"
                    data-active={index === activeIndex ? true : undefined}
                    id={`app-search-option-${index}`}
                    key={entry.code}
                    onClick={() => jumpToCode(entry.code)}
                    onMouseMove={() => setActiveIndex(index)}
                    px="xs"
                    py={6}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    role="option"
                  >
                    <Group className="flex-wrap md:flex-nowrap" gap="sm">
                      <ThemeIcon
                        color={
                          entry.category === "共通"
                            ? "gray"
                            : CATEGORY_COLORS[entry.category as AppCategory]
                        }
                        radius="sm"
                        size="md"
                        variant="light"
                      >
                        <IconComponent size={14} />
                      </ThemeIcon>
                      <Text className="tabular-nums" fw={600} size="sm">
                        {formatOperationCodeDisplay(entry)}
                      </Text>
                      <Text size="sm">{entry.label}</Text>
                      <Text c="dimmed" size="xs" visibleFrom="md">
                        {entry.category}
                      </Text>
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
                <Stack gap="sm" key={cat.category}>
                  <Group gap="xs">
                    <ThemeIcon
                      color={cat.color}
                      radius="sm"
                      size="md"
                      variant="light"
                    >
                      <SectionIcon size={14} />
                    </ThemeIcon>
                    <Title c="dimmed" order={5}>
                      {cat.category}
                    </Title>
                  </Group>

                  <SimpleGrid cols={{ base: 2, md: 3 }} spacing="sm">
                    {cat.apps.map((app) => {
                      const IconComponent = resolveAppIcon(app.icon);
                      return (
                        <UnstyledButton
                          className="app-card"
                          component={Link}
                          href={app.href}
                          key={app.key}
                          onClick={onNavigate}
                        >
                          <Paper
                            className="launcher-app-card"
                            h="100%"
                            radius="md"
                            withBorder
                          >
                            <Stack align="center" gap="sm">
                              <ThemeIcon
                                color={cat.color}
                                radius="md"
                                size="xl"
                                variant="light"
                              >
                                <IconComponent size={24} />
                              </ThemeIcon>
                              <Text fw={500} lh={1.3} size="sm" ta="center">
                                {app.label}
                              </Text>
                              <Text
                                c="dimmed"
                                className="tabular-nums"
                                size="xs"
                              >
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
