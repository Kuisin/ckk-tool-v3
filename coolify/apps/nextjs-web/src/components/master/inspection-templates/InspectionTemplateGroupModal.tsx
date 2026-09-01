"use client";

/**
 * InspectionTemplateGroupModal — 検査表テンプレートのグループ管理 (MS09)。
 *
 * グループは判定・PDF に影響しない**ナビゲーション用の表示軸**（例:
 * 「製品検査記録」「外観・コーティング検査」）。専用の一覧・詳細ページは
 * 持たず、MS09 一覧のツールバーから開くモーダル 1 枚で足す — 承認グループ
 * のような独立マスタを新設するほどの規模ではないため。
 *
 * 行ごとに 編集中フラグ を持ち、変更があるときだけ保存アイコンを出す
 * （自動保存にすると、まだ確定していない入力途中の値まで飛んでしまう）。
 * 削除はそのグループに属するテンプレートが 0 件のときだけ許可（サーバー側
 * でも二重に確認する）。並び替えは ▲▼ で 1 段ずつ入れ替える。
 */

import {
  ActionIcon,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconDeviceFloppy,
  IconFolders,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  createInspectionTemplateGroup,
  deleteInspectionTemplateGroup,
  fetchInspectionTemplateGroups,
  type InspectionTemplateGroupRow,
  reorderInspectionTemplateGroups,
  updateInspectionTemplateGroup,
} from "@/app/(dashboard)/master/inspection-templates/actions";
import { GhostButton, PrimaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModalShell } from "@/components/ui/modals";
import { LocalizedTextInput } from "@/components/ui/shells";

interface Draft {
  nameJa: string;
  nameTranslations: Record<string, string>;
  isActive: boolean;
}

function toDraft(r: InspectionTemplateGroupRow): Draft {
  return {
    nameJa: r.nameJa,
    nameTranslations: r.nameEn ? { en: r.nameEn } : {},
    isActive: r.isActive,
  };
}

function isDirty(r: InspectionTemplateGroupRow, d: Draft): boolean {
  return (
    r.nameJa !== d.nameJa ||
    (r.nameEn || "") !== (d.nameTranslations.en || "") ||
    r.isActive !== d.isActive
  );
}

export function InspectionTemplateGroupModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<InspectionTemplateGroupRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");

  const load = () => {
    setLoading(true);
    fetchInspectionTemplateGroups()
      .then((r) => {
        setRows(r);
        setDrafts(Object.fromEntries(r.map((g) => [g.id, toDraft(g)])));
      })
      .finally(() => setLoading(false));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: 開くたびに読み直すだけでよい（load は毎回作り直される）
  useEffect(() => {
    if (opened) load();
  }, [opened]);

  const notifyError = (message: string) =>
    notifications.show({ title: tr("common.error2"), message, color: "red" });

  const add = () => {
    if (!newName.trim()) return;
    startTransition(async () => {
      const result = await createInspectionTemplateGroup({
        nameJa: newName.trim(),
        nameTranslations: {},
        isActive: true,
      });
      if (result.ok) {
        setNewName("");
        load();
        router.refresh();
      } else {
        notifyError(result.error);
      }
    });
  };

  const save = (row: InspectionTemplateGroupRow) => {
    const draft = drafts[row.id];
    if (!draft) return;
    startTransition(async () => {
      const result = await updateInspectionTemplateGroup(row.id, draft);
      if (result.ok) {
        load();
        router.refresh();
      } else {
        notifyError(result.error);
      }
    });
  };

  const remove = (row: InspectionTemplateGroupRow) => {
    startTransition(async () => {
      const result = await deleteInspectionTemplateGroup(row.id);
      if (result.ok) {
        load();
        router.refresh();
      } else {
        notifyError(result.error);
      }
    });
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
    startTransition(async () => {
      const result = await reorderInspectionTemplateGroups(
        next.map((r) => r.id),
      );
      if (result.ok) {
        router.refresh();
      } else {
        notifyError(result.error);
        load();
      }
    });
  };

  return (
    <ModalShell
      hideFooter
      onClose={onClose}
      opened={opened}
      size="lg"
      title={tr("master.inspectionTemplates.inspectionSheetGroups")}
    >
      <Stack gap="sm">
        <Text c="dimmed" size="xs">
          {tr("master.inspectionTemplates.groupsAreUsedOnlyForFiltering")}
        </Text>

        {!loading && rows.length === 0 && (
          <EmptyState
            icon={<IconFolders size={24} />}
            message={tr("master.inspectionTemplates.thereAreNoGroups")}
          />
        )}

        <Stack gap="xs">
          {rows.map((row, i) => {
            const draft = drafts[row.id] ?? toDraft(row);
            const dirty = isDirty(row, draft);
            return (
              <Paper key={row.id} p="sm" radius="sm" withBorder>
                <Group align="flex-start" wrap="nowrap">
                  <Stack gap={2}>
                    <ActionIcon
                      aria-label={tr("common.moveUp")}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      size="sm"
                      variant="subtle"
                    >
                      <IconArrowUp size={14} />
                    </ActionIcon>
                    <ActionIcon
                      aria-label={tr("common.moveDown")}
                      disabled={i === rows.length - 1}
                      onClick={() => move(i, 1)}
                      size="sm"
                      variant="subtle"
                    >
                      <IconArrowDown size={14} />
                    </ActionIcon>
                  </Stack>
                  <Stack className="min-w-0" gap={6} style={{ flex: 1 }}>
                    <LocalizedTextInput
                      jaProps={{
                        value: draft.nameJa,
                        onChange: (e: { currentTarget: { value: string } }) =>
                          setDrafts((d) => ({
                            ...d,
                            [row.id]: {
                              ...draft,
                              nameJa: e.currentTarget.value,
                            },
                          })),
                      }}
                      label={tr("common.groupName")}
                      translationsProps={{
                        value: draft.nameTranslations,
                        onChange: (v: Record<string, string>) =>
                          setDrafts((d) => ({
                            ...d,
                            [row.id]: { ...draft, nameTranslations: v },
                          })),
                      }}
                    />
                    <Group gap="md" justify="space-between">
                      <Switch
                        checked={draft.isActive}
                        label="有効"
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [row.id]: {
                              ...draft,
                              isActive: e.currentTarget.checked,
                            },
                          }))
                        }
                        size="sm"
                      />
                      <Text c="dimmed" size="xs">
                        {row.templateCount}件の検査表
                      </Text>
                    </Group>
                  </Stack>
                  <Stack gap={4}>
                    <Tooltip label={tr("common.save2")} withinPortal>
                      <ActionIcon
                        aria-label={tr(
                          "master.inspectionTemplates.saveTheGroup",
                        )}
                        color="blue"
                        disabled={!dirty}
                        loading={isPending}
                        onClick={() => save(row)}
                        variant="subtle"
                      >
                        {dirty ? (
                          <IconDeviceFloppy size={16} />
                        ) : (
                          <IconCheck size={16} />
                        )}
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip
                      label={
                        row.templateCount > 0
                          ? tr(
                              "master.inspectionTemplates.itCannotBeDeletedWhileInspection",
                            )
                          : "削除"
                      }
                      withinPortal
                    >
                      <ActionIcon
                        aria-label={tr("common.deleteTheGroup")}
                        color="red"
                        disabled={row.templateCount > 0}
                        onClick={() => remove(row)}
                        variant="subtle"
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Stack>
                </Group>
              </Paper>
            );
          })}
        </Stack>

        <Group align="flex-end" gap="xs">
          <TextInput
            label={tr("common.newGroup")}
            onChange={(e) => setNewName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={tr(
              "master.inspectionTemplates.eGProductInspectionRecord",
            )}
            style={{ flex: 1 }}
            value={newName}
          />
          <PrimaryButton
            disabled={!newName.trim()}
            leftSection={<IconPlus size={14} />}
            loading={isPending}
            onClick={add}
          >
            {tr("common.add")}
          </PrimaryButton>
        </Group>

        <Group justify="flex-end">
          <GhostButton onClick={onClose}>{tr("common.close2")}</GhostButton>
        </Group>
      </Stack>
    </ModalShell>
  );
}
