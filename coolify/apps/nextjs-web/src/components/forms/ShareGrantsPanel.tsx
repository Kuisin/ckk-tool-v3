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
  Paper,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import {
  searchPlantOptions,
  searchUserOptions,
} from "@/app/(dashboard)/_shared/option-search";
import { GhostButton } from "@/components/ui/buttons";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormActions } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import type { ShareGrantView } from "@/lib/share-grants";
import {
  SHARE_LEVEL_LABEL,
  SHARE_SUBJECT_LABEL,
  type ShareLevel,
  type ShareSubjectType,
} from "@/lib/share-grants-core";
import {
  type ConditionFieldOption,
  type ConditionValue,
  EMPTY_CONDITION,
  ShareConditionEditor,
} from "./ShareConditionEditor";

export interface RoleOption {
  value: string;
  label: string;
}

interface Draft {
  subjectType: ShareSubjectType;
  subjectId: string | null;
  subjectLabel: string;
  level: ShareLevel;
  condition: ConditionValue;
}

const SUBJECT_TYPES: ShareSubjectType[] = ["EVERYONE", "PLANT", "ROLE", "USER"];

export function ShareGrantsPanel({
  conditionFields = [],
  grants,
  roleOptions,
  levels,
  canManage,
  onCancel,
  onSaved,
  onSave,
}: {
  grants: ShareGrantView[];
  roleOptions: RoleOption[];
  /** このオーナー種別で選べる権限（フォームは RESPOND を含む）。 */
  levels: ShareLevel[];
  /**
   * 「この条件に当てはまる回答だけ見せる」に使える項目。フォームでだけ渡す
   * （社内文書には回答が無いので条件も無い）。
   */
  conditionFields?: ConditionFieldOption[];
  canManage: boolean;
  /** キャンセル。EditablePanel に埋め込むときに閲覧モードへ戻す。 */
  onCancel?: () => void;
  /** 保存が成功したあとに呼ぶ（閲覧モードへ戻すため）。 */
  onSaved?: () => void;
  onSave: (
    grants: {
      subjectType: ShareSubjectType;
      subjectId: string | null;
      level: ShareLevel;
      conditionFieldKey: string | null;
      conditionValues: string[];
      conditionLabels: string[];
    }[],
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<Draft[]>(
    grants.map((g) => ({
      subjectType: g.subjectType,
      subjectId: g.subjectId,
      subjectLabel: g.subjectLabel,
      level: g.level,
      condition: {
        fieldKey: g.conditionFieldKey ?? null,
        values: g.conditionValues ?? [],
        labels: g.conditionLabels ?? [],
      },
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
        condition: EMPTY_CONDITION,
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
          conditionFieldKey: r.condition.fieldKey,
          conditionValues: r.condition.values,
          conditionLabels: r.condition.labels,
        })),
      );
      if (result.ok) {
        notifications.show({
          message: "共有設定を保存しました",
          color: "green",
        });
        router.refresh();
        onSaved?.();
      } else {
        notifications.show({
          title: "エラー",
          message: result.error ?? "保存に失敗しました",
          color: "red",
        });
      }
    });

  // 対象種別ごとの「相手」入力。表（PC）とカード（スマホ）で同じものを使う。
  const subjectInput = (row: Draft, i: number) => (
    <>
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
              subjectLabel: roleOptions.find((o) => o.value === v)?.label ?? "",
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
            update(i, { subjectId: v, subjectLabel: option?.label ?? "" })
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
            update(i, { subjectId: v, subjectLabel: option?.label ?? "" })
          }
          onSearch={searchUserOptions}
          placeholder="ユーザーを検索"
          storageKey="share-user"
          value={row.subjectId}
        />
      )}
    </>
  );

  const typeSelect = (row: Draft, i: number) => (
    <Select
      data={SUBJECT_TYPES.map((t) => ({
        value: t,
        label: SHARE_SUBJECT_LABEL[t],
      }))}
      disabled={!canManage}
      label={isMobile ? "対象" : undefined}
      onChange={(v) =>
        update(i, {
          subjectType: (v as ShareSubjectType) ?? "EVERYONE",
          subjectId: null,
          subjectLabel: "",
        })
      }
      value={row.subjectType}
    />
  );

  // 条件は READ にだけ効く（EDIT/MANAGE はフォームを預かる側なので絞らない）。
  const conditionBlock = (row: Draft, i: number) =>
    conditionFields.length > 0 && row.level === "READ" ? (
      <ShareConditionEditor
        disabled={!canManage}
        fields={conditionFields}
        onChange={(condition) => update(i, { condition })}
        value={row.condition}
      />
    ) : null;

  const levelSelect = (row: Draft, i: number) => (
    <Select
      data={levels.map((l) => ({ value: l, label: SHARE_LEVEL_LABEL[l] }))}
      disabled={!canManage}
      label={isMobile ? "権限" : undefined}
      onChange={(v) => update(i, { level: (v as ShareLevel) ?? levels[0] })}
      value={row.level}
    />
  );

  const removeButton = (i: number) => (
    <ActionIcon
      aria-label="共有先を削除"
      color="red"
      disabled={!canManage}
      onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
      variant="subtle"
    >
      <IconTrash size={16} />
    </ActionIcon>
  );

  return (
    <Stack gap="sm">
      <Alert color="gray" icon={<IconInfoCircle size={16} />} variant="light">
        共有先を 1
        つも設定していないフォームは、作成者と管理者にしか見えません。 URL
        を知っていても開けません。
      </Alert>

      {isMobile ? (
        // スマホは 4 列の表を諦めてカードに積む。Select が 1 列 40px になると
        // 何を選んでいるのか読めないため。
        <Stack gap="sm">
          {rows.length === 0 && (
            <Text c="dimmed" size="sm">
              共有先がありません（非公開）
            </Text>
          )}
          {rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 並び順が同一性
            <Paper key={i} p="sm" radius="sm" withBorder>
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text c="dimmed" size="xs">
                    共有先 {i + 1}
                  </Text>
                  {removeButton(i)}
                </Group>
                {typeSelect(row, i)}
                {row.subjectType !== "EVERYONE" && (
                  <Stack gap={4}>
                    <Text fw={500} size="sm">
                      相手
                    </Text>
                    {subjectInput(row, i)}
                  </Stack>
                )}
                {levelSelect(row, i)}
                {conditionBlock(row, i)}
              </Stack>
            </Paper>
          ))}
        </Stack>
      ) : (
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
            {rows.map((row, i) => {
              const condition = conditionBlock(row, i);
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: 並び順が同一性
                <Fragment key={i}>
                  <Table.Tr>
                    <Table.Td>{typeSelect(row, i)}</Table.Td>
                    <Table.Td>{subjectInput(row, i)}</Table.Td>
                    <Table.Td>{levelSelect(row, i)}</Table.Td>
                    <Table.Td>{removeButton(i)}</Table.Td>
                  </Table.Tr>
                  {condition && (
                    // 条件は行に収めず、その行の下に全幅で敷く（4 列の表に
                    // 押し込むと選択肢が読めない）。
                    <Table.Tr>
                      <Table.Td colSpan={4}>
                        <Stack gap={4} pl="md">
                          <Text c="dimmed" size="xs">
                            見せる回答を絞る（この共有先だけに効きます）
                          </Text>
                          {condition}
                        </Stack>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Fragment>
              );
            })}
          </Table.Tbody>
        </Table>
      )}

      {canManage && (
        <>
          <GhostButton
            fullWidth={isMobile}
            leftSection={<IconPlus size={14} />}
            onClick={add}
          >
            共有先を追加
          </GhostButton>
          {/* 保存 / キャンセルは共有の FormActions に任せる — PC の sticky と
              スマホの全幅積みがそれで揃う（design.md §8.3）。 */}
          <FormActions loading={isPending} onCancel={onCancel} onSave={save} />
        </>
      )}
    </Stack>
  );
}
