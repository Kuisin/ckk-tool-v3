"use client";

/**
 * AddBranchModal — 完了工程からの分岐系列追加 (§7 手直し・半製品再投入)。
 *
 * 分岐元（COMPLETED の工程）を起点に、カタログ工程の系列 + 分岐数量 +
 * 任意の合流先（PENDING のメインライン工程）を指定して addBranch を呼ぶ。
 * 分岐数量は分岐可能数（maxQuantity — 手直しの未割当分。終端工程のみ
 * 良品+手直し）まで。既定値は 手直し数 と分岐可能数の小さい方。
 */

import { MultiSelect, NumberInput, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addBranch } from "@/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/actions";
import { ModalShell } from "@/components/ui/modals";
import type { WorkOrderStepView } from "./work-orders/model";

export function AddBranchModal({
  opened,
  onClose,
  workOrderNumber,
  sourceStep,
  catalogOptions,
  mergeTargets,
  maxQuantity,
}: {
  opened: boolean;
  onClose: () => void;
  workOrderNumber: number;
  /** 分岐元（COMPLETED の工程）。 */
  sourceStep: WorkOrderStepView | null;
  /** 工程カタログ options（value = String(catalog id)）。 */
  catalogOptions: { value: string; label: string }[];
  /** 合流先候補（PENDING のメインライン工程）。 */
  mergeTargets: WorkOrderStepView[];
  /** 分岐可能数量（branchableQuantity — サーバーでも再検証される）。 */
  maxQuantity?: number | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [catalogStepIds, setCatalogStepIds] = useState<string[]>([]);
  const [routedQuantity, setRoutedQuantity] = useState<number | string>(1);
  const [mergeTargetStepId, setMergeTargetStepId] = useState<string | null>(
    null,
  );
  const max = maxQuantity ?? null;

  // 分岐元が変わったら既定値へリセット（既定数量 = min(手直し数 or 1, 分岐可能数)）
  useEffect(() => {
    if (sourceStep) {
      setCatalogStepIds([]);
      const base = sourceStep.outputDefectRework || 1;
      setRoutedQuantity(max != null && max > 0 ? Math.min(base, max) : base);
      setMergeTargetStepId(null);
    }
  }, [sourceStep, max]);

  const handleConfirm = () => {
    if (!sourceStep) return;
    startTransition(async () => {
      const result = await addBranch({
        workOrderNumber,
        sourceStepId: sourceStep.id,
        catalogStepIds: catalogStepIds.map(Number),
        routedQuantity: Number(routedQuantity) || 0,
        mergeTargetStepId,
      });
      if (result.ok) {
        notifications.show({
          title: "分岐を追加しました",
          message: `${sourceStep.name} から ${catalogStepIds.length} 工程`,
          color: "green",
        });
        onClose();
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.errors?.join(" / ") ?? "分岐の追加に失敗しました",
          color: "red",
        });
      }
    });
  };

  return (
    <ModalShell
      confirmLabel="分岐を追加"
      loading={isPending}
      onClose={onClose}
      onConfirm={handleConfirm}
      opened={opened}
      size="md"
      title={`分岐追加 — ${sourceStep?.name ?? ""}`}
    >
      <Stack gap="sm">
        <MultiSelect
          data={catalogOptions}
          label="追加する工程（実行順）"
          onChange={setCatalogStepIds}
          placeholder="工程を選択"
          searchable
          value={catalogStepIds}
          withAsterisk
        />
        <NumberInput
          description={
            max != null ? `分岐可能: ${max}（手直しの未割当分）` : undefined
          }
          label="分岐数量"
          max={max ?? undefined}
          min={1}
          onChange={setRoutedQuantity}
          value={routedQuantity}
          withAsterisk
        />
        <Select
          clearable
          data={mergeTargets.map((s) => ({ value: s.id, label: s.name }))}
          label="合流先（未着手のメインライン工程）"
          onChange={setMergeTargetStepId}
          placeholder="合流しない"
          value={mergeTargetStepId}
        />
        <Text c="dimmed" size="xs">
          分岐元の完了後に、指定数量を追加工程の系列へ流します。系列内の
          受入数は前工程の良品数に自動で追従します。ワークフロー変更承認は §6
          本実装まで履歴記録のみです。
        </Text>
      </Stack>
    </ModalShell>
  );
}
