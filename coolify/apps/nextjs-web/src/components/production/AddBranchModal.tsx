"use client";

/**
 * AddBranchModal — 分岐系列の追加 / 更新 (§7 工程分岐・半製品再投入)。
 *
 * 追加（mode="add"）: 分岐元（COMPLETED の工程）を起点に、カタログ工程の系列 +
 * 分岐数量 + **終端** を指定して addBranch を呼ぶ。分岐数量は分岐可能数
 * （maxQuantity — 工程分岐の未割当分。終端工程のみ 良品+工程分岐）まで。
 *
 * 更新（mode="edit"）: 既存系列の **分岐数量** と **終端** を付け替える
 * （updateBranch）。工程の入れ替えは削除して作り直す。
 *
 * **終端は必須** — 分岐は必ず「本流へ合流」か「在庫へ」で終わる。行き場の無い
 * 分岐を作らせないため、どちらかを選ぶまで確定できない。
 */

import {
  Alert,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  addBranch,
  updateBranch,
} from "@/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/actions";
import { ModalShell } from "@/components/ui/modals";
import { useTr } from "@/hooks/useTr";
import type { WorkOrderStepView } from "./work-orders/model";

/** 終端の選び方（画面の state）。 */
type TerminationKind = "MERGE" | "STOCK";
type StockKind = "SEMI_FINISHED" | "PRODUCT";

const STOCK_OPTIONS = [
  { value: "SEMI_FINISHED", label: "半製品在庫" },
  { value: "PRODUCT", label: "製品在庫" },
];

export interface BranchEditTarget {
  /** 系列の先頭工程 id。 */
  headId: string;
  /** 現在の分岐数量。 */
  routedQuantity: number;
  /** 現在の合流先（在庫で終わる系列は null）。 */
  mergeTargetId: string | null;
  /** 現在の在庫行き先（合流する系列は null）。 */
  stockDisposition: StockKind | null;
  /** 系列の工程名（見出し用）。 */
  stepNames: string[];
  /** 数量を変更できるか（全工程が未着手）。 */
  canEditQuantity: boolean;
  /** 終端を変更できるか（終端工程が未着手）。 */
  canEditTermination: boolean;
}

export function AddBranchModal({
  opened,
  onClose,
  workOrderNumber,
  sourceStep,
  catalogOptions,
  mergeTargets,
  maxQuantity,
  editTarget = null,
}: {
  opened: boolean;
  onClose: () => void;
  workOrderNumber: number;
  /** 分岐元（COMPLETED の工程）。編集時は系列の分岐元。 */
  sourceStep: WorkOrderStepView | null;
  /** 工程カタログ options（value = String(catalog id)）。 */
  catalogOptions: { value: string; label: string }[];
  /** 合流先候補（PENDING のメインライン工程）。 */
  mergeTargets: WorkOrderStepView[];
  /** 分岐可能数量（branchableQuantity — サーバーでも再検証される）。 */
  maxQuantity?: number | null;
  /** 指定すると編集モード。 */
  editTarget?: BranchEditTarget | null;
}) {
  const tr = useTr();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [catalogStepIds, setCatalogStepIds] = useState<string[]>([]);
  const [routedQuantity, setRoutedQuantity] = useState<number | string>(1);
  const [terminationKind, setTerminationKind] =
    useState<TerminationKind>("MERGE");
  const [mergeTargetStepId, setMergeTargetStepId] = useState<string | null>(
    null,
  );
  const [stockKind, setStockKind] = useState<StockKind>("SEMI_FINISHED");
  const isEdit = editTarget != null;
  const max = maxQuantity ?? null;

  // 開くたびに初期値へ。追加は既定数量 = min(工程分岐数 or 1, 分岐可能数)、
  // 編集は現在値をそのまま出す。
  useEffect(() => {
    if (!opened) return;
    if (editTarget) {
      setCatalogStepIds([]);
      setRoutedQuantity(editTarget.routedQuantity);
      setTerminationKind(editTarget.mergeTargetId ? "MERGE" : "STOCK");
      setMergeTargetStepId(editTarget.mergeTargetId);
      setStockKind(editTarget.stockDisposition ?? "SEMI_FINISHED");
      return;
    }
    if (sourceStep) {
      setCatalogStepIds([]);
      const base = sourceStep.outputDefectRework || 1;
      setRoutedQuantity(max != null && max > 0 ? Math.min(base, max) : base);
      setTerminationKind("MERGE");
      setMergeTargetStepId(null);
      setStockKind("SEMI_FINISHED");
    }
  }, [opened, sourceStep, max, editTarget]);

  // 終端が決まっていなければ確定させない（行き場の無い分岐を作らせない）。
  const terminationReady =
    terminationKind === "STOCK" || mergeTargetStepId != null;
  const canConfirm = terminationReady && (isEdit || catalogStepIds.length > 0);

  const termination = () =>
    terminationKind === "MERGE" && mergeTargetStepId
      ? ({ kind: "MERGE", mergeTargetStepId } as const)
      : ({ kind: "STOCK", disposition: stockKind } as const);

  const handleConfirm = () => {
    if (!canConfirm) return;
    startTransition(async () => {
      const result = isEdit
        ? await updateBranch({
            workOrderNumber,
            headStepId: editTarget.headId,
            routedQuantity: editTarget.canEditQuantity
              ? Number(routedQuantity) || 0
              : undefined,
            termination: termination(),
          })
        : sourceStep
          ? await addBranch({
              workOrderNumber,
              sourceStepId: sourceStep.id,
              catalogStepIds: catalogStepIds.map(Number),
              routedQuantity: Number(routedQuantity) || 0,
              termination: termination(),
            })
          : null;
      if (result == null) return;
      if (result.ok) {
        notifications.show({
          title: isEdit ? "分岐を更新しました" : tr("分岐を追加しました"),
          message: isEdit
            ? editTarget.stepNames.join(" → ")
            : tr("{v0} から {v1} 工程", {
                v0: sourceStep?.name ?? "",
                v1: catalogStepIds.length,
              }),
          color: "green",
        });
        onClose();
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message:
            result.errors?.join(" / ") ??
            (isEdit
              ? tr("分岐の更新に失敗しました")
              : tr("分岐の追加に失敗しました")),
          color: "red",
        });
      }
    });
  };

  return (
    <ModalShell
      confirmDisabled={!canConfirm}
      confirmLabel={isEdit ? "分岐を更新" : tr("分岐を追加")}
      loading={isPending}
      onClose={onClose}
      onConfirm={handleConfirm}
      opened={opened}
      size="md"
      title={
        isEdit
          ? tr("分岐の編集 — {v0}", { v0: editTarget.stepNames.join(" → ") })
          : tr("分岐追加 — {v0}", { v0: sourceStep?.name ?? "" })
      }
    >
      <Stack gap="sm">
        {!isEdit && (
          <MultiSelect
            data={catalogOptions}
            label={tr("追加する工程（実行順）")}
            onChange={setCatalogStepIds}
            placeholder={tr("工程を選択")}
            searchable
            value={catalogStepIds}
            withAsterisk
          />
        )}
        <NumberInput
          description={
            isEdit && !editTarget.canEditQuantity
              ? tr("着手済みのため数量は変更できません")
              : max != null
                ? tr("分岐可能: {max}（工程分岐の未割当分）", { max: max })
                : undefined
          }
          disabled={isEdit && !editTarget.canEditQuantity}
          label={tr("分岐数量")}
          max={isEdit ? undefined : (max ?? undefined)}
          min={1}
          onChange={setRoutedQuantity}
          value={routedQuantity}
          withAsterisk
        />

        <SegmentedControl
          data={[
            { value: "MERGE", label: tr("本流へ合流") },
            { value: "STOCK", label: tr("在庫へ") },
          ]}
          disabled={isEdit && !editTarget.canEditTermination}
          fullWidth
          onChange={(v) => setTerminationKind(v as TerminationKind)}
          value={terminationKind}
        />
        {terminationKind === "MERGE" ? (
          <Select
            data={mergeTargets.map((s) => ({ value: s.id, label: s.name }))}
            description={tr(
              "分岐系列の最後の工程から、この工程へ良品を戻します",
            )}
            disabled={isEdit && !editTarget.canEditTermination}
            label={tr("合流先（未着手のメインライン工程）")}
            onChange={setMergeTargetStepId}
            placeholder={tr("合流先を選択")}
            value={mergeTargetStepId}
            withAsterisk
          />
        ) : (
          <Select
            data={STOCK_OPTIONS}
            description={tr(
              tr(
                tr(
                  "分岐系列の最後の工程の良品を、指示書の完了時にこの在庫へ入れます",
                ),
              ),
            )}
            disabled={isEdit && !editTarget.canEditTermination}
            label={tr("入庫先")}
            onChange={(v) => setStockKind((v as StockKind) ?? "SEMI_FINISHED")}
            value={stockKind}
            withAsterisk
          />
        )}
        {terminationKind === "MERGE" && mergeTargetStepId == null && (
          <Alert color="orange" variant="light">
            {tr(
              tr(
                tr(
                  "合流先を選ぶか、「在庫へ」を選んでください。分岐は必ず合流か在庫で\n            終わります。",
                ),
              ),
            )}
          </Alert>
        )}

        <Text c="dimmed" size="xs">
          分岐元の完了後に、指定数量を追加工程の系列へ流します。系列内の
          受入数は前工程の良品数に自動で追従します。
          {isEdit && tr("工程の入れ替えは、分岐を削除して作り直してください。")}
        </Text>
      </Stack>
    </ModalShell>
  );
}
