"use client";

/**
 * AddBranchModal — 完了工程からの分岐系列追加 (§7 手直し・半製品再投入)。
 *
 * 分岐元（COMPLETED の工程）を起点に、カタログ工程の系列 + 分岐数量 +
 * 任意の合流先（PENDING の工程）を指定して addBranch アクションを呼ぶ。
 * 分岐数量の既定値は分岐元の手直し数（無ければ 1）。
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
}: {
  opened: boolean;
  onClose: () => void;
  workOrderNumber: number;
  /** 分岐元（COMPLETED の工程）。 */
  sourceStep: WorkOrderStepView | null;
  /** 工程カタログ options（value = String(catalog id)）。 */
  catalogOptions: { value: string; label: string }[];
  /** 合流先候補（PENDING の工程）。 */
  mergeTargets: WorkOrderStepView[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [catalogStepIds, setCatalogStepIds] = useState<string[]>([]);
  const [routedQuantity, setRoutedQuantity] = useState<number | string>(1);
  const [mergeTargetStepId, setMergeTargetStepId] = useState<string | null>(
    null,
  );

  // 分岐元が変わったら既定値へリセット（既定数量 = 手直し数 or 1）
  useEffect(() => {
    if (sourceStep) {
      setCatalogStepIds([]);
      setRoutedQuantity(sourceStep.outputDefectRework || 1);
      setMergeTargetStepId(null);
    }
  }, [sourceStep]);

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
          label="分岐数量"
          min={1}
          onChange={setRoutedQuantity}
          value={routedQuantity}
          withAsterisk
        />
        <Select
          clearable
          data={mergeTargets.map((s) => ({ value: s.id, label: s.name }))}
          label="合流先（未着手の工程）"
          onChange={setMergeTargetStepId}
          placeholder="合流しない"
          value={mergeTargetStepId}
        />
        <Text c="dimmed" size="xs">
          分岐元の完了後に、指定数量を追加工程の系列へ流します。
          ワークフロー変更承認は §6 本実装まで履歴記録のみです。
        </Text>
      </Stack>
    </ModalShell>
  );
}
