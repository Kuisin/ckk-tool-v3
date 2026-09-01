"use client";

/**
 * WorkOrderFinalInspectionPanel — 最終検査・出荷前確認（design.md 未記載・
 * 旧帳票「■最終検査」欄。指示書 1 件に 1 行、work_order_final_inspections）。
 *
 * 3 項目チェック（各々 確認者スタンプ付き）+ 予備在庫使用/入庫（単純トグル）+
 * 出荷前チェーン（棚包→納品書発行→出荷許可、紙の記入順のまま前段が済むまで
 * 次段は押せない）+ 出荷時不良内容確認者印（任意メモ）。
 * 権限は work_order:UPDATE — サーバー側（final-inspection-actions.ts）で
 * 判定し、拒否はエラー通知で表す（他の工程実行ボタンと同じ扱い）。
 */

import {
  Badge,
  Checkbox,
  Group,
  Paper,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  advanceShipmentStage,
  recordShipDefectReview,
  setFinalInspectionCheck,
  setFinalInspectionSpareStock,
} from "@/app/(dashboard)/production/work-orders/[id]/final-inspection-actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { useTr } from "@/hooks/useTr";
import type { ActionResult } from "@/lib/server-action";
import type { WorkOrderFinalInspectionView } from "./work-orders/model";

const CHECK_ITEMS = [
  {
    field: "drawingLabel",
    label: "図面・ラベル・膜厚・寸法と間違いがないか",
  },
  { field: "protectiveCap", label: "保護キャップ使用しているか（φ0.6以下）" },
  { field: "finishedQuantity", label: "完成本数は合っているか" },
] as const;

const SHIPMENT_STAGES = [
  { stage: "shelved", label: "棚包担当者" },
  { stage: "deliveryNoteIssued", label: "納品書発行者" },
  { stage: "shipmentAuthorized", label: "出荷許可者" },
] as const;

const EMPTY: WorkOrderFinalInspectionView = {
  drawingLabelOk: null,
  drawingLabelCheckedByName: null,
  drawingLabelCheckedAt: null,
  protectiveCapOk: null,
  protectiveCapCheckedByName: null,
  protectiveCapCheckedAt: null,
  finishedQuantityOk: null,
  finishedQuantityCheckedByName: null,
  finishedQuantityCheckedAt: null,
  spareStockUsed: false,
  spareStockReceived: false,
  shelvedByName: null,
  shelvedAt: null,
  deliveryNoteIssuedByName: null,
  deliveryNoteIssuedAt: null,
  shipmentAuthorizedByName: null,
  shipmentAuthorizedAt: null,
  shipDefectReviewedByName: null,
  shipDefectReviewedAt: null,
  shipDefectNotes: null,
};

export function WorkOrderFinalInspectionPanel({
  workOrderNumber,
  finalInspection,
}: {
  workOrderNumber: number;
  finalInspection: WorkOrderFinalInspectionView | null;
}) {
  const tr = useTr();
  const fmt = useFormat();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fi = finalInspection ?? EMPTY;
  const [notes, setNotes] = useState(fi.shipDefectNotes ?? "");

  const afterResult = (result: ActionResult, successTitle: string) => {
    if (result.ok) {
      notifications.show({ title: successTitle, message: "", color: "green" });
      router.refresh();
    } else {
      notifications.show({
        title: tr("エラー"),
        message: tr(result.error),
        color: "red",
      });
    }
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>{tr("最終検査")}</Title>

        <Stack gap="xs">
          {CHECK_ITEMS.map(({ field, label }) => {
            const ok = fi[`${field}Ok`];
            const checkedByName = fi[`${field}CheckedByName`];
            const checkedAt = fi[`${field}CheckedAt`];
            return (
              <Group gap="sm" justify="space-between" key={field} wrap="wrap">
                <Text size="sm">{label}</Text>
                <Group gap="xs" wrap="nowrap">
                  {checkedAt && (
                    <Text c="dimmed" size="xs">
                      {fmt.dateTime(checkedAt)}
                      {checkedByName ? `（${checkedByName}）` : ""}
                    </Text>
                  )}
                  <SecondaryButton
                    color={ok === true ? "green" : undefined}
                    loading={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await setFinalInspectionCheck(
                          workOrderNumber,
                          field,
                          true,
                        );
                        afterResult(result, `「${label}」を記録しました`);
                      })
                    }
                    size="xs"
                  >
                    ○
                  </SecondaryButton>
                  <SecondaryButton
                    color={ok === false ? "red" : undefined}
                    loading={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await setFinalInspectionCheck(
                          workOrderNumber,
                          field,
                          false,
                        );
                        afterResult(result, `「${label}」を記録しました`);
                      })
                    }
                    size="xs"
                  >
                    ×
                  </SecondaryButton>
                </Group>
              </Group>
            );
          })}
        </Stack>

        <Group gap="lg" wrap="wrap">
          <Checkbox
            checked={fi.spareStockUsed}
            label={tr("予備在庫使用")}
            onChange={(e) =>
              startTransition(async () => {
                const result = await setFinalInspectionSpareStock(
                  workOrderNumber,
                  "spareStockUsed",
                  e.currentTarget.checked,
                );
                afterResult(result, tr("予備在庫使用を記録しました"));
              })
            }
          />
          <Checkbox
            checked={fi.spareStockReceived}
            label={tr("予備在庫入庫")}
            onChange={(e) =>
              startTransition(async () => {
                const result = await setFinalInspectionSpareStock(
                  workOrderNumber,
                  "spareStockReceived",
                  e.currentTarget.checked,
                );
                afterResult(result, tr("予備在庫入庫を記録しました"));
              })
            }
          />
        </Group>

        <Stack gap="xs">
          <Text fw={500} size="sm">
            {tr("出荷前確認（棚包 → 納品書発行 → 出荷許可）")}
          </Text>
          <Group gap="sm" wrap="wrap">
            {SHIPMENT_STAGES.map(({ stage, label }, idx) => {
              const byName = fi[`${stage}ByName`];
              const at = fi[`${stage}At`];
              const priorStage = SHIPMENT_STAGES[idx - 1];
              const priorDone = priorStage
                ? fi[`${priorStage.stage}At`] != null
                : true;
              return (
                <Paper key={stage} p="xs" radius="sm" withBorder>
                  <Stack gap={4}>
                    <Text c="dimmed" size="xs">
                      {label}
                    </Text>
                    {at ? (
                      <Badge color="green" size="sm" variant="light">
                        {byName}・{fmt.dateTime(at)}
                      </Badge>
                    ) : (
                      <GhostButton
                        disabled={!priorDone}
                        loading={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await advanceShipmentStage(
                              workOrderNumber,
                              stage,
                            );
                            afterResult(result, `${label}を記録しました`);
                          })
                        }
                        size="xs"
                      >
                        {tr("記録する")}
                      </GhostButton>
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Group>
        </Stack>

        <Stack gap="xs">
          <Text fw={500} size="sm">
            {tr("出荷時不良内容確認者印")}
          </Text>
          {fi.shipDefectReviewedAt && (
            <Text c="dimmed" size="xs">
              確認: {fmt.dateTime(fi.shipDefectReviewedAt)}
              {fi.shipDefectReviewedByName
                ? `（${fi.shipDefectReviewedByName}）`
                : ""}
            </Text>
          )}
          <Textarea
            minRows={2}
            onChange={(e) => setNotes(e.currentTarget.value)}
            placeholder={tr("出荷前検査での不良内容等（任意）")}
            value={notes}
          />
          <Group justify="flex-end">
            <SecondaryButton
              loading={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await recordShipDefectReview(
                    workOrderNumber,
                    notes,
                  );
                  afterResult(
                    result,
                    tr("出荷時不良内容確認者印を記録しました"),
                  );
                })
              }
            >
              {tr("確認する")}
            </SecondaryButton>
          </Group>
        </Stack>
      </Stack>
    </Paper>
  );
}
