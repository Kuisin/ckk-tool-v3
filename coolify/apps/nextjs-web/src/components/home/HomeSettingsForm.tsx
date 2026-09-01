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
import { useState, useTransition } from "react";
import { saveHomeSettingsAction } from "@/app/(dashboard)/profile/home/actions";
import { useHiddenApps } from "@/components/layout/AppFlags";
import {
  CancelButton,
  PrimaryButton,
  SaveButton,
} from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormActions } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";
import { type AppEntry, appList, CATEGORY_COLORS } from "@/lib/app-list";
import {
  type HomeMode,
  type HomeSettings,
  MAX_GROUP_NAME_LENGTH,
  MAX_HOME_GROUPS,
} from "@/lib/home-settings-core";
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
            {app.label}
          </Text>
        </Stack>
      </Paper>
    </UnstyledButton>
  );
}

export function HomeSettingsForm({ initial }: { initial: HomeSettings }) {
  const tr = useTr();
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
        title: tr("エラー"),
        message: tr("グループ名を入力してください"),
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
          title: tr("保存しました"),
          message: tr("ホーム画面の設定を更新しました"),
          color: "green",
        });
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(res.error),
          color: "red",
        });
      }
    });
  };

  return (
    <Stack gap="md" maw={960} mx="auto" w="100%">
      <PageHeader
        breadcrumbs={[
          { label: tr("プロフィール"), href: "/profile" },
          { label: tr("ホーム画面設定") },
        ]}
        title={tr("ホーム画面設定")}
      />

      {/* ── お気に入りアプリ ─────────────────────────────────────────── */}
      <Paper p="md" radius="md" shadow="xs">
        <Title mb="xs" order={4}>
          {tr("お気に入りアプリ")}
        </Title>
        <Divider mb="md" />
        <Text c="dimmed" mb="md" size="sm">
          {tr(
            tr(
              "選択したアプリはホーム画面の上部に固定表示されます（選択した順に並びます）。",
            ),
          )}
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
          {tr("表示モード")}
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
                tr("カテゴリ（販売・購買・生産…）ごとにアプリを表示します"),
              )}
              label={tr("標準（カテゴリ別）")}
              value="default"
            />
            <Radio
              description={tr(
                tr(
                  "自分で作ったグループごとにアプリを表示します。未所属のアプリは「その他」にまとまります",
                ),
              )}
              label={tr("カスタム（グループ別）")}
              value="custom"
            />
          </Stack>
        </Radio.Group>
      </Paper>

      {/* ── カスタムグループ ─────────────────────────────────────────── */}
      {mode === "custom" && (
        <Paper p="md" radius="md" shadow="xs">
          <Title mb="xs" order={4}>
            {tr("カスタムグループ")}
          </Title>
          <Divider mb="md" />
          <Stack gap="sm">
            <Group align="flex-end" gap="xs" wrap="nowrap">
              <TextInput
                flex={1}
                label={tr("新しいグループ")}
                maxLength={MAX_GROUP_NAME_LENGTH}
                onChange={(e) => setNewGroupName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addGroup();
                  }
                }}
                placeholder={tr("グループ名")}
                value={newGroupName}
              />
              <PrimaryButton
                disabled={
                  !newGroupName.trim() || groups.length >= MAX_HOME_GROUPS
                }
                leftSection={<IconPlus size={16} />}
                onClick={addGroup}
              >
                {tr("追加")}
              </PrimaryButton>
            </Group>

            {groups.length === 0 ? (
              <Text c="dimmed" size="sm">
                {tr(
                  tr(
                    "グループがありません。グループ名を入力して追加してください。",
                  ),
                )}
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
                          aria-label={tr("グループ名")}
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
                          aria-label={tr("上へ移動")}
                          disabled={index === 0}
                          onClick={() => moveGroup(index, -1)}
                          variant="subtle"
                        >
                          <IconArrowUp size={16} />
                        </ActionIcon>
                        <ActionIcon
                          aria-label={tr("下へ移動")}
                          disabled={index === groups.length - 1}
                          onClick={() => moveGroup(index, 1)}
                          variant="subtle"
                        >
                          <IconArrowDown size={16} />
                        </ActionIcon>
                        <ActionIcon
                          aria-label={tr("グループを削除")}
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
                          label: `${a.label}（${a.category}）`,
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

      {/* ── 保存 ─────────────────────────────────────────────────────── */}
      <FormActions>
        {isMobile ? (
          <Stack gap="xs">
            <SaveButton
              fullWidth
              loading={isPending}
              onClick={save}
              type="button"
            />
            <CancelButton fullWidth href="/" />
          </Stack>
        ) : (
          <Group justify="flex-end">
            <CancelButton href="/" />
            <SaveButton loading={isPending} onClick={save} type="button" />
          </Group>
        )}
      </FormActions>
    </Stack>
  );
}
