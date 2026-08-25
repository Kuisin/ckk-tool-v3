"use client";

/**
 * ShareGrantsPanel — フォーム / 社内文書の共有設定。
 *
 * 既定は非公開（行が 1 つも無ければ作成者と system:ADMIN 以外には見えない）。
 * 「回答のみ」は閲覧を含まない — アンケートで、答えられるが他人の回答は
 * 見えない、という一番よく要る形を作れるようにしてある。
 */

import {
  ActionIcon,
  Alert,
  Group,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  searchPlantOptions,
  searchUserOptions,
} from "@/app/(dashboard)/_shared/option-search";
import { GhostButton, SaveButton } from "@/components/ui/buttons";
import { SearchSelect } from "@/components/ui/SearchSelect";
import type { ShareGrantView } from "@/lib/share-grants";
import {
  SHARE_LEVEL_LABEL,
  SHARE_SUBJECT_LABEL,
  type ShareLevel,
  type ShareSubjectType,
} from "@/lib/share-grants-core";

export interface RoleOption {
  value: string;
  label: string;
}

interface Draft {
  subjectType: ShareSubjectType;
  subjectId: string | null;
  subjectLabel: string;
  level: ShareLevel;
}

const SUBJECT_TYPES: ShareSubjectType[] = ["EVERYONE", "PLANT", "ROLE", "USER"];

export function ShareGrantsPanel({
  grants,
  roleOptions,
  levels,
  canManage,
  onSave,
}: {
  grants: ShareGrantView[];
  roleOptions: RoleOption[];
  /** このオーナー種別で選べる権限（フォームは RESPOND を含む）。 */
  levels: ShareLevel[];
  canManage: boolean;
  onSave: (
    grants: {
      subjectType: ShareSubjectType;
      subjectId: string | null;
      level: ShareLevel;
    }[],
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<Draft[]>(
    grants.map((g) => ({
      subjectType: g.subjectType,
      subjectId: g.subjectId,
      subjectLabel: g.subjectLabel,
      level: g.level,
    })),
  );

  const add = () =>
    setRows([
      ...rows,
      {
        subjectType: "EVERYONE",
        subjectId: null,
        subjectLabel: "全社（ログインユーザー全員）",
        level: levels[0],
      },
    ]);

  const update = (i: number, patch: Partial<Draft>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = () =>
    startTransition(async () => {
      const result = await onSave(
        rows.map((r) => ({
          subjectType: r.subjectType,
          subjectId: r.subjectId,
          level: r.level,
        })),
      );
      if (result.ok) {
        notifications.show({
          message: "共有設定を保存しました",
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.error ?? "保存に失敗しました",
          color: "red",
        });
      }
    });

  return (
    <Stack gap="sm">
      <Alert color="gray" icon={<IconInfoCircle size={16} />} variant="light">
        共有先を 1
        つも設定していないフォームは、作成者と管理者にしか見えません。 URL
        を知っていても開けません。
      </Alert>

      <Table withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: 140 }}>対象</Table.Th>
            <Table.Th>相手</Table.Th>
            <Table.Th style={{ width: 160 }}>権限</Table.Th>
            <Table.Th style={{ width: 48 }} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text c="dimmed" size="sm">
                  共有先がありません（非公開）
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
          {rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 並び順が同一性
            <Table.Tr key={i}>
              <Table.Td>
                <Select
                  data={SUBJECT_TYPES.map((t) => ({
                    value: t,
                    label: SHARE_SUBJECT_LABEL[t],
                  }))}
                  disabled={!canManage}
                  onChange={(v) =>
                    update(i, {
                      subjectType: (v as ShareSubjectType) ?? "EVERYONE",
                      subjectId: null,
                      subjectLabel: "",
                    })
                  }
                  value={row.subjectType}
                />
              </Table.Td>
              <Table.Td>
                {row.subjectType === "EVERYONE" && (
                  <Text c="dimmed" size="sm">
                    ログインユーザー全員
                  </Text>
                )}
                {row.subjectType === "ROLE" && (
                  <Select
                    data={roleOptions}
                    disabled={!canManage}
                    onChange={(v) =>
                      update(i, {
                        subjectId: v,
                        subjectLabel:
                          roleOptions.find((o) => o.value === v)?.label ?? "",
                      })
                    }
                    placeholder="ロールを選択"
                    searchable
                    value={row.subjectId}
                  />
                )}
                {row.subjectType === "PLANT" && (
                  <SearchSelect
                    disabled={!canManage}
                    initialOption={
                      row.subjectId
                        ? { value: row.subjectId, label: row.subjectLabel }
                        : null
                    }
                    onChange={(v, option) =>
                      update(i, {
                        subjectId: v,
                        subjectLabel: option?.label ?? "",
                      })
                    }
                    onSearch={searchPlantOptions}
                    placeholder="拠点を検索"
                    storageKey="share-plant"
                    value={row.subjectId}
                  />
                )}
                {row.subjectType === "USER" && (
                  <SearchSelect
                    disabled={!canManage}
                    initialOption={
                      row.subjectId
                        ? { value: row.subjectId, label: row.subjectLabel }
                        : null
                    }
                    onChange={(v, option) =>
                      update(i, {
                        subjectId: v,
                        subjectLabel: option?.label ?? "",
                      })
                    }
                    onSearch={searchUserOptions}
                    placeholder="ユーザーを検索"
                    storageKey="share-user"
                    value={row.subjectId}
                  />
                )}
              </Table.Td>
              <Table.Td>
                <Select
                  data={levels.map((l) => ({
                    value: l,
                    label: SHARE_LEVEL_LABEL[l],
                  }))}
                  disabled={!canManage}
                  onChange={(v) =>
                    update(i, { level: (v as ShareLevel) ?? levels[0] })
                  }
                  value={row.level}
                />
              </Table.Td>
              <Table.Td>
                <ActionIcon
                  aria-label="共有先を削除"
                  color="red"
                  disabled={!canManage}
                  onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                  variant="subtle"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {canManage && (
        <Group justify="space-between">
          <GhostButton leftSection={<IconPlus size={14} />} onClick={add}>
            共有先を追加
          </GhostButton>
          <SaveButton loading={isPending} onClick={save} type="button" />
        </Group>
      )}
    </Stack>
  );
}
