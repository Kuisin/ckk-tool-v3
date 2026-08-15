"use client";

/**
 * StepQuantityForm — 工程の数量・不良入力 (design.md §12.3)。
 *
 * 受入数は開始時に確定した値で**固定表示**（完了時は編集不可）。不良は
 * **1 本のリスト**で入力し、各行に 種別（半製品/廃棄/工程分岐）・理由（任意）・数
 * を持つ。区分ごとの合計はこのリストの合計として導出し、良品数 = 受入 − 総不良
 * も自動計算する（キオスクと同一モデル）。在庫連携は区分合計をそのまま使うので
 * 不変。「工程完了」で completeStep アクションを呼ぶ（サーバー側でも再検証）。
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCheck,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeStep } from "@/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/actions";
import type { SelectOption } from "@/components/production/step-execution/model";
import {
  checkDefectList,
  cleanReasonEntries,
  type DefectDisposition,
  type DefectReasonEntry,
  defectListTotal,
  deriveSuccessFromList,
  dispositionTotals,
  quantitiesFromList,
} from "@/lib/step-defects";
import {
  QUANTITY_LABELS,
  type QuantityTrackingMode,
} from "@/lib/workflow-core";

export function StepQuantityForm({
  workOrderNumber,
  stepId,
  inputQuantity,
  defectTypeOptions,
  disabled,
  mode = "FLOW",
}: {
  workOrderNumber: number;
  stepId: string;
  /** 受入数（開始時に確定した値。完了時は編集不可）。 */
  inputQuantity: number | null;
  /** 不良種類（理由の候補）。 */
  defectTypeOptions: SelectOption[];
  disabled?: boolean;
  mode?: QuantityTrackingMode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [defects, setDefects] = useState<DefectReasonEntry[]>([]);

  const input = inputQuantity ?? 0;
  const labels = QUANTITY_LABELS[mode];
  const issue = checkDefectList(defects, input, mode);
  const total = defectListTotal(defects);
  const success = deriveSuccessFromList(input, defects);
  const totals = dispositionTotals(defects);

  // 理由の候補は名称（value=label）で保持し、保存も名称文字列にする。
  const reasonData = defectTypeOptions.map((o) => ({
    value: o.label,
    label: o.label,
  }));

  const setRow = (index: number, patch: Partial<DefectReasonEntry>) =>
    setDefects((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );

  const handleComplete = () => {
    startTransition(async () => {
      const result = await completeStep(
        workOrderNumber,
        stepId,
        quantitiesFromList(input, defects),
        cleanReasonEntries(defects),
      );
      if (result.ok) {
        notifications.show({
          title: "工程を完了しました",
          message: `${labels.success} ${success} / ${labels.input} ${input}`,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.errors?.join(" / ") ?? "工程の完了に失敗しました",
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="lg" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>
          {mode === "INSPECTION" ? "検査数・合否" : "数量・不良"}
        </Title>

        {/* 受入（固定）+ 良品（自動計算）+ 総不良 */}
        <SimpleGrid cols={{ base: 3 }} spacing="md">
          <Paper p="sm" radius="sm" withBorder>
            <Text c="dimmed" size="xs">
              {labels.input}
            </Text>
            <Text fw={700} size="xl">
              {input}
            </Text>
            <Badge color="gray" mt={4} size="xs" variant="light">
              固定
            </Badge>
          </Paper>
          <Paper p="sm" radius="sm" withBorder>
            <Text c="dimmed" size="xs">
              {labels.success}
            </Text>
            <Text c="green" fw={700} size="xl">
              {success}
            </Text>
            <Badge color="green" mt={4} size="xs" variant="light">
              自動計算
            </Badge>
          </Paper>
          <Paper p="sm" radius="sm" withBorder>
            <Text c="dimmed" size="xs">
              総不良数
            </Text>
            <Text c={total > 0 ? "orange" : undefined} fw={700} size="xl">
              {total}
            </Text>
          </Paper>
        </SimpleGrid>

        <Group justify="space-between">
          <Text c="dimmed" fw={600} size="sm">
            不良内訳
          </Text>
          {total > 0 && (
            <Group gap="xs">
              {totals.semi > 0 && (
                <Badge color="orange" variant="light">
                  {labels.semi} {totals.semi}
                </Badge>
              )}
              {totals.scrap > 0 && (
                <Badge color="red" variant="light">
                  {labels.scrap} {totals.scrap}
                </Badge>
              )}
              {totals.rework > 0 && (
                <Badge color="yellow" variant="light">
                  {labels.rework} {totals.rework}
                </Badge>
              )}
            </Group>
          )}
        </Group>

        {defects.map((row, index) => (
          <Group
            align="flex-end"
            gap="sm"
            // biome-ignore lint/suspicious/noArrayIndexKey: 追記専用の行フォーム
            key={index}
            wrap="nowrap"
          >
            <Select
              aria-label="種別"
              data={[
                { value: "SEMI", label: labels.semi },
                { value: "SCRAP", label: labels.scrap },
                { value: "REWORK", label: labels.rework },
              ]}
              disabled={disabled}
              onChange={(v) =>
                v && setRow(index, { type: v as DefectDisposition })
              }
              style={{ width: 160, flexShrink: 0 }}
              value={row.type}
            />
            <Select
              aria-label="理由"
              clearable
              data={reasonData}
              disabled={disabled}
              onChange={(v) => setRow(index, { reason: v ?? "" })}
              placeholder="不良種類を選択"
              searchable
              style={{ flex: 1 }}
              value={row.reason || null}
            />
            <NumberInput
              allowDecimal={false}
              allowNegative={false}
              aria-label="本数"
              disabled={disabled}
              min={1}
              onChange={(v) =>
                setRow(index, {
                  count: typeof v === "number" ? v : Number(v) || 1,
                })
              }
              style={{ width: 120 }}
              value={row.count}
            />
            <ActionIcon
              aria-label="削除"
              color="red"
              disabled={disabled}
              onClick={() =>
                setDefects((prev) => prev.filter((_, i) => i !== index))
              }
              size={36}
              variant="light"
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        ))}

        <Button
          disabled={disabled}
          leftSection={<IconPlus size={18} />}
          onClick={() =>
            setDefects((prev) => [
              ...prev,
              { type: "SCRAP", reason: "", count: 1 },
            ])
          }
          variant="light"
        >
          不良を追加
        </Button>

        {issue && (
          <Alert
            color="orange"
            icon={<IconAlertTriangle size={16} />}
            variant="light"
          >
            {issue.kind === "NEGATIVE"
              ? "数量は 0 以上の整数で入力してください"
              : `不良の合計（${issue.sum}）が受入数（${issue.input}）を超えています`}
          </Alert>
        )}

        <Group justify="center" mt="sm">
          <Button
            color="green"
            disabled={disabled || issue != null}
            leftSection={<IconCheck size={20} />}
            loading={isPending}
            onClick={handleComplete}
            size="lg"
          >
            工程完了
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
