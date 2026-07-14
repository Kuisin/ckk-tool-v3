"use client";

/**
 * DefectRecordForm — 不良記録（任意）の入力・表示 (design.md §12.6)。
 *
 * タブレット最優先（size="lg"、§20.1）。不良種類 Select + 内容 Textarea の
 * 行を「追加」で増やし、まとめて saveDefectRecords へ渡す。
 * 既存記録は読み取り専用で一覧表示。
 */

import {
  ActionIcon,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveDefectRecords } from "@/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/actions";
import { GhostButton, PrimaryButton } from "@/components/ui/buttons";
import { formatDateTime } from "@/lib/format";
import type {
  SelectOption,
  StepDefectRecordView,
} from "./step-execution/model";

interface DefectRow {
  key: number;
  defectTypeId: string | null;
  description: string;
}

export function DefectRecordForm({
  workOrderNumber,
  stepId,
  defectTypeOptions,
  records,
  canRecord,
}: {
  workOrderNumber: number;
  stepId: string;
  defectTypeOptions: SelectOption[];
  /** この工程の既存不良記録。 */
  records: StepDefectRecordView[];
  canRecord: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nextKey, setNextKey] = useState(1);
  const [rows, setRows] = useState<DefectRow[]>([]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { key: nextKey, defectTypeId: null, description: "" },
    ]);
    setNextKey((k) => k + 1);
  };

  const updateRow = (key: number, patch: Partial<DefectRow>) =>
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );

  const removeRow = (key: number) =>
    setRows((prev) => prev.filter((r) => r.key !== key));

  const handleSave = () => {
    if (rows.length === 0) return;
    // 不良種類を選択した行は内容必須（design.md §12.6）
    const invalid = rows.some((r) => !r.defectTypeId || !r.description.trim());
    if (invalid) {
      notifications.show({
        title: "入力不足",
        message: "各行の不良種類と内容を入力してください",
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const result = await saveDefectRecords({
        workOrderNumber,
        stepId,
        records: rows.map((r) => ({
          defectTypeId: Number(r.defectTypeId),
          description: r.description.trim(),
        })),
      });
      if (result.ok) {
        notifications.show({
          title: "不良記録を保存しました",
          message: `${rows.length} 件を追加しました`,
          color: "green",
        });
        setRows([]);
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.errors?.join(" / ") ?? "不良記録の保存に失敗しました",
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="lg" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>不良記録（任意）</Title>

        {records.length > 0 && (
          <Stack gap="xs">
            {records.map((r) => (
              <Paper key={r.id} p="sm" radius="sm" withBorder>
                <Group gap="sm" wrap="wrap">
                  <Text fw={600} size="sm">
                    {r.defectTypeName}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {formatDateTime(r.recordedAt)}
                    {r.recordedByName ? `（${r.recordedByName}）` : ""}
                  </Text>
                </Group>
                <Text mt={4} size="sm" style={{ whiteSpace: "pre-wrap" }}>
                  {r.description}
                </Text>
              </Paper>
            ))}
          </Stack>
        )}

        {canRecord && (
          <>
            {rows.map((row) => (
              <Group align="flex-start" gap="sm" key={row.key} wrap="nowrap">
                <Select
                  aria-label="不良種類"
                  data={defectTypeOptions}
                  onChange={(v) => updateRow(row.key, { defectTypeId: v })}
                  placeholder="不良種類"
                  searchable
                  size="lg"
                  value={row.defectTypeId}
                  w={220}
                />
                <Textarea
                  aria-label="不良内容"
                  autosize
                  minRows={2}
                  onChange={(e) =>
                    updateRow(row.key, { description: e.currentTarget.value })
                  }
                  placeholder="不良内容"
                  size="lg"
                  style={{ flex: 1 }}
                  value={row.description}
                />
                <ActionIcon
                  aria-label="行を削除"
                  color="red"
                  mt={8}
                  onClick={() => removeRow(row.key)}
                  size="lg"
                  variant="subtle"
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
            ))}
            <Group justify="space-between">
              <GhostButton
                leftSection={<IconPlus size={16} />}
                onClick={addRow}
                size="lg"
              >
                追加
              </GhostButton>
              {rows.length > 0 && (
                <PrimaryButton
                  loading={isPending}
                  onClick={handleSave}
                  size="lg"
                >
                  不良記録を保存
                </PrimaryButton>
              )}
            </Group>
          </>
        )}

        {!canRecord && records.length === 0 && (
          <Text c="dimmed" size="sm">
            不良記録はありません
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
