"use client";

/**
 * HomeSettingsForm — ホーム画面設定（本人のみ）。
 *
 * - お気に入りアプリ: カードをタップで ON/OFF（選択順 = ホーム上部の表示順）
 * - 表示モード: 標準（カテゴリ別） / カスタム（グループ別）
 * - カスタムグループ: 追加・名称変更・並べ替え（上下）・削除・アプリ割当
 *   （1 アプリは最大 1 グループ — 他グループ割当済みは選択肢で無効化）
 *
 * 保存は saveHomeSettingsAction（app.user_home_settings へ upsert）。
 */

import {
  ActionIcon,
  Badge,
  Divider,
  Group,
  MultiSelect,
  Paper,
  Radio,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconStarFilled,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveHomeSettingsAction } from "@/app/(dashboard)/profile/home/actions";
import { useHiddenApps } from "@/components/layout/AppFlags";
import { PrimaryButton } from "@/components/ui/buttons";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormActions } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  type AppEntry,
  appLabel,
  appList,
  CATEGORY_COLORS,
  categoryLabel,
} from "@/lib/app-list";
import {
  type HomeMode,
  type HomeSettings,
  MAX_GROUP_NAME_LENGTH,
  MAX_HOME_GROUPS,
} from "@/lib/home-settings-core";
import type { Locale } from "@/lib/i18n";
import { resolveAppIcon } from "@/lib/icons";

interface EditableGroup {
  /** クライアント側の安定キー（並べ替え・入力フォーカス維持用） */
  id: string;
  name: string;
  apps: string[];
}

let groupSeq = 0;
function nextGroupId(): string {
  groupSeq += 1;
  return `g${groupSeq}`;
}

/** お気に入り選択カード（トグル）。 */
function StarToggleCard({
  app,
  starred,
  onToggle,
}: {
  app: AppEntry;
  starred: boolean;
  onToggle: () => void;
}) {
  const locale = useLocale() as Locale;
  const IconComponent = resolveAppIcon(app.icon);
  return (
    <UnstyledButton
      aria-pressed={starred}
      className="app-card"
      onClick={onToggle}
    >
      <Paper
        h="100%"
        p="sm"
        pos="relative"
        radius="md"
        style={
          starred ? { borderColor: "var(--mantine-color-yellow-5)" } : undefined
        }
        withBorder
      >
        {starred && (
          <ThemeIcon
            color="yellow"
            pos="absolute"
            radius="xl"
            right={6}
            size="sm"
            top={6}
            variant="light"
          >
            <IconStarFilled size={12} />
          </ThemeIcon>
        )}
        <Stack align="center" gap={6}>
          <ThemeIcon
            color={CATEGORY_COLORS[app.category]}
            radius="md"
            size={40}
            variant="light"
          >
            <IconComponent size={22} />
          </ThemeIcon>
          <Text fw={500} lh={1.3} size="xs" ta="center">
            {appLabel(app, locale)}
          </Text>
        </Stack>
      </Paper>
    </UnstyledButton>
  );
}

/** ホーム画面設定の編集フォーム（EditablePanel の edit）。 */
function HomeSettingsEditor({
  initial,
  onCancel,
  onSaved,
}: {
  initial: HomeSettings;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const locale = useLocale() as Locale;
  const hiddenApps = useHiddenApps();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<HomeMode>(initial.mode);
  const [starred, setStarred] = useState<string[]>(initial.starred);
  const [groups, setGroups] = useState<EditableGroup[]>(
    initial.groups.map((g) => ({ id: nextGroupId(), ...g })),
  );
  const [newGroupName, setNewGroupName] = useState("");

  // 環境フラグで無効化されたアプリは選択肢に出さない
  const apps = appList.filter((a) => !hiddenApps.has(a.key));

  const toggleStar = (key: string) => {
    setStarred((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name || groups.length >= MAX_HOME_GROUPS) return;
    setGroups((prev) => [...prev, { id: nextGroupId(), name, apps: [] }]);
    setNewGroupName("");
  };

  const moveGroup = (index: number, delta: -1 | 1) => {
    setGroups((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [
        next[target] as EditableGroup,
        next[index] as EditableGroup,
      ];
      return next;
    });
  };

  const save = () => {
    if (mode === "custom" && groups.some((g) => !g.name.trim())) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("home.homeSettingsForm.enterAGroupName"),
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const res = await saveHomeSettingsAction({
        mode,
        starred,
        groups: groups.map((g) => ({ name: g.name.trim(), apps: g.apps })),
      });
      if (res.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr("home.homeSettingsForm.theHomeLayoutWasUpdated"),
          color: "green",
        });
        router.refresh();
        onSaved();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error,
          color: "red",
        });
      }
    });
  };

  return (
    <Stack gap="md">
      {/* ── お気に入りアプリ ─────────────────────────────────────────── */}
      <Paper p="md" radius="md" shadow="xs">
        <Title mb="xs" order={4}>
          {tr("home.homeSettingsForm.favoriteApps")}
        </Title>
        <Divider mb="md" />
        <Text c="dimmed" mb="md" size="sm">
          {tr("home.homeSettingsForm.theAppsYouPickArePinned")}
        </Text>
        <SimpleGrid cols={isMobile ? 2 : 4} spacing="sm">
          {apps.map((app) => (
            <StarToggleCard
              app={app}
              key={app.key}
              onToggle={() => toggleStar(app.key)}
              starred={starred.includes(app.key)}
            />
          ))}
        </SimpleGrid>
      </Paper>

      {/* ── 表示モード ───────────────────────────────────────────────── */}
      <Paper p="md" radius="md" shadow="xs">
        <Title mb="xs" order={4}>
          {tr("home.homeSettingsForm.displayMode")}
        </Title>
        <Divider mb="md" />
        <Radio.Group
          onChange={(value) =>
            setMode(value === "custom" ? "custom" : "default")
          }
          value={mode}
        >
          <Stack gap="sm">
            <Radio
              description={tr(
                "home.homeSettingsForm.showsAppsGroupedByCategorySales",
              )}
              label={tr("home.homeSettingsForm.standardByCategory")}
              value="default"
            />
            <Radio
              description={tr("home.homeSettingsForm.showsAppsByTheGroupsYou")}
              label={tr("home.homeSettingsForm.customByGroup")}
              value="custom"
            />
          </Stack>
        </Radio.Group>
      </Paper>

      {/* ── カスタムグループ ─────────────────────────────────────────── */}
      {mode === "custom" && (
        <Paper p="md" radius="md" shadow="xs">
          <Title mb="xs" order={4}>
            {tr("home.homeSettingsForm.customGroup")}
          </Title>
          <Divider mb="md" />
          <Stack gap="sm">
            <Group align="flex-end" gap="xs" wrap="nowrap">
              <TextInput
                flex={1}
                label={tr("common.newGroup")}
                maxLength={MAX_GROUP_NAME_LENGTH}
                onChange={(e) => setNewGroupName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addGroup();
                  }
                }}
                placeholder={tr("common.groupName")}
                value={newGroupName}
              />
              <PrimaryButton
                disabled={
                  !newGroupName.trim() || groups.length >= MAX_HOME_GROUPS
                }
                leftSection={<IconPlus size={16} />}
                onClick={addGroup}
              >
                {tr("common.add")}
              </PrimaryButton>
            </Group>

            {groups.length === 0 ? (
              <Text c="dimmed" size="sm">
                {tr("home.homeSettingsForm.thereAreNoGroupsEnterA")}
              </Text>
            ) : (
              groups.map((group, index) => {
                // 他グループへ割当済みのアプリは選択不可（1 アプリ 1 グループ）
                const assignedElsewhere = new Set(
                  groups
                    .filter((g) => g.id !== group.id)
                    .flatMap((g) => g.apps),
                );
                return (
                  <Paper key={group.id} p="sm" radius="sm" withBorder>
                    <Stack gap="xs">
                      <Group gap="xs" wrap="nowrap">
                        <TextInput
                          aria-label={tr("common.groupName")}
                          flex={1}
                          maxLength={MAX_GROUP_NAME_LENGTH}
                          onChange={(e) => {
                            const name = e.currentTarget.value;
                            setGroups((prev) =>
                              prev.map((g) =>
                                g.id === group.id ? { ...g, name } : g,
                              ),
                            );
                          }}
                          value={group.name}
                        />
                        <ActionIcon
                          aria-label={tr("home.homeSettingsForm.moveUp")}
                          disabled={index === 0}
                          onClick={() => moveGroup(index, -1)}
                          variant="subtle"
                        >
                          <IconArrowUp size={16} />
                        </ActionIcon>
                        <ActionIcon
                          aria-label={tr("home.homeSettingsForm.moveDown")}
                          disabled={index === groups.length - 1}
                          onClick={() => moveGroup(index, 1)}
                          variant="subtle"
                        >
                          <IconArrowDown size={16} />
                        </ActionIcon>
                        <ActionIcon
                          aria-label={tr("common.deleteTheGroup")}
                          color="red"
                          onClick={() =>
                            setGroups((prev) =>
                              prev.filter((g) => g.id !== group.id),
                            )
                          }
                          variant="subtle"
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                      <MultiSelect
                        clearable
                        data={apps.map((a) => ({
                          value: a.key,
                          label: tr("home.homeSettingsForm.labelCategory", {
                            label: appLabel(a, locale),
                            category: categoryLabel(a.category, locale),
                          }),
                          disabled: assignedElsewhere.has(a.key),
                        }))}
                        onChange={(value) =>
                          setGroups((prev) =>
                            prev.map((g) =>
                              g.id === group.id ? { ...g, apps: value } : g,
                            ),
                          )
                        }
                        placeholder={
                          group.apps.length === 0 ? "アプリを選択" : undefined
                        }
                        searchable
                        value={group.apps}
                      />
                    </Stack>
                  </Paper>
                );
              })
            )}
          </Stack>
        </Paper>
      )}

      <FormActions loading={isPending} onCancel={onCancel} onSave={save} />
    </Stack>
  );
}

/** ホーム画面設定の閲覧表示（EditablePanel の view）。 */
function HomeSettingsView({ initial }: { initial: HomeSettings }) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;
  const hiddenApps = useHiddenApps();
  const apps = appList.filter((a) => !hiddenApps.has(a.key));
  const appByKey = new Map(apps.map((a) => [a.key, a]));
  const starredApps = initial.starred
    .map((k) => appByKey.get(k))
    .filter((a): a is AppEntry => a != null);

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text fw={600} size="sm">
          {tr("home.homeSettingsForm.favoriteApps")}
        </Text>
        {starredApps.length === 0 ? (
          <Text c="dimmed" size="sm">
            {tr("common.none2")}
          </Text>
        ) : (
          <Group gap="xs">
            {starredApps.map((a) => (
              <Badge
                color={CATEGORY_COLORS[a.category]}
                key={a.key}
                leftSection={<IconStarFilled size={10} />}
                variant="light"
              >
                {appLabel(a, locale)}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>

      <Stack gap="xs">
        <Text fw={600} size="sm">
          {tr("home.homeSettingsForm.displayMode")}
        </Text>
        <Badge variant="light">
          {initial.mode === "custom"
            ? tr("home.homeSettingsForm.customByGroup")
            : tr("home.homeSettingsForm.standardByCategory")}
        </Badge>
      </Stack>

      {initial.mode === "custom" && (
        <Stack gap="xs">
          <Text fw={600} size="sm">
            {tr("home.homeSettingsForm.customGroup")}
          </Text>
          {initial.groups.length === 0 ? (
            <Text c="dimmed" size="sm">
              {tr("home.homeSettingsForm.thereAreNoGroupsEnterA")}
            </Text>
          ) : (
            initial.groups.map((g) => (
              <Paper key={g.name} p="sm" radius="sm" withBorder>
                <Stack gap={6}>
                  <Text fw={500} size="sm">
                    {g.name}
                  </Text>
                  {g.apps.length === 0 ? (
                    <Text c="dimmed" size="xs">
                      {tr("common.none2")}
                    </Text>
                  ) : (
                    <Group gap="xs">
                      {g.apps.map((key) => {
                        const app = appByKey.get(key);
                        return (
                          <Badge key={key} variant="light">
                            {app ? appLabel(app, locale) : key}
                          </Badge>
                        );
                      })}
                    </Group>
                  )}
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * ホーム画面設定（本人のみ）。既定は閲覧、編集は「編集」ボタンから
 * （design.md §10.10）。
 */
export function HomeSettingsForm({ initial }: { initial: HomeSettings }) {
  const tr = useTranslations();

  return (
    <Stack gap="md" maw={960} mx="auto" w="100%">
      <PageHeader
        breadcrumbs={[
          { label: tr("common.profile"), href: "/profile" },
          { label: tr("home.homeSettingsForm.homeLayout") },
        ]}
        title={tr("home.homeSettingsForm.homeLayout")}
      />
      <Paper p="md" radius="md" shadow="xs">
        <EditablePanel
          canEdit
          edit={({ close }) => (
            <HomeSettingsEditor
              initial={initial}
              onCancel={close}
              onSaved={close}
            />
          )}
          view={<HomeSettingsView initial={initial} />}
        />
      </Paper>
    </Stack>
  );
}
