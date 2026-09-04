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
 *
 * **記入口は最終検査工程（process_step_catalog.is_final_inspection）の実行画面
 * だけ**。以前は指示書詳細に常設だったので、その指示書で最終検査をやるのか
 * どうかが画面から読み取れなかった。印の付いた工程を工程リストに入れなければ
 * 最終検査は無い（= 任意）。記録そのものは指示書 1 件に 1 行のままなので、
 * 印の付いた工程が 2 つあっても同じ 1 行を編集する。
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
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  advanceShipmentStage,
  recordShipDefectReview,
  setFinalInspectionCheck,
  setFinalInspectionSpareStock,
} from "@/app/(dashboard)/production/work-orders/[id]/final-inspection-actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import type { ActionResult } from "@/lib/server-action";
import type { WorkOrderFinalInspectionView } from "./work-orders/model";

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
  canRecord,
}: {
  workOrderNumber: number;
  finalInspection: WorkOrderFinalInspectionView | null;
  /**
   * 記録できるか（工程が進行中 + セッションが自分 — 検査記録と同じ条件）。
   * false は読み取り専用。押せないボタンを並べるのではなく操作ごと隠す。
   */
  canRecord: boolean;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fi = finalInspection ?? EMPTY;
  const [notes, setNotes] = useState(fi.shipDefectNotes ?? "");

  const CHECK_ITEMS = [
    {
      field: "drawingLabel",
      label: tr("production.workOrderFinalInspectionPanel.checkDrawingLabel"),
    },
    {
      field: "protectiveCap",
      label: tr("production.workOrderFinalInspectionPanel.checkProtectiveCap"),
    },
    {
      field: "finishedQuantity",
      label: tr(
        "production.workOrderFinalInspectionPanel.checkFinishedQuantity",
      ),
    },
  ] as const;

  const SHIPMENT_STAGES = [
    {
      stage: "shelved",
      label: tr("production.workOrderFinalInspectionPanel.shelvedBy"),
    },
    {
      stage: "deliveryNoteIssued",
      label: tr(
        "production.workOrderFinalInspectionPanel.deliveryNoteIssuedBy",
      ),
    },
    {
      stage: "shipmentAuthorized",
      label: tr(
        "production.workOrderFinalInspectionPanel.shipmentAuthorizedBy",
      ),
    },
  ] as const;

  const afterResult = (result: ActionResult, successTitle: string) => {
    if (result.ok) {
      notifications.show({ title: successTitle, message: "", color: "green" });
      router.refresh();
    } else {
      notifications.show({
        title: tr("common.error2"),
        message: result.error,
        color: "red",
      });
    }
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={4}>
            {tr("production.workOrderFinalInspectionPanel.finalInspection")}
          </Title>
          <Text c="dimmed" size="xs">
            {tr(
              "production.stepExecutionView.finalInspectionIsRecordedOnThisStep",
            )}
          </Text>
        </Stack>

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
                  {!canRecord && (
                    <Badge
                      color={
                        ok === true ? "green" : ok === false ? "red" : "gray"
                      }
                      size="sm"
                      variant="light"
                    >
                      {ok === true ? "○" : ok === false ? "×" : "—"}
                    </Badge>
                  )}
                  {canRecord && (
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
                          afterResult(
                            result,
                            tr(
                              "production.workOrderFinalInspectionPanel.itemRecorded",
                              { item: label },
                            ),
                          );
                        })
                      }
                      size="xs"
                    >
                      ○
                    </SecondaryButton>
                  )}
                  {canRecord && (
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
                          afterResult(
                            result,
                            tr(
                              "production.workOrderFinalInspectionPanel.itemRecorded",
                              { item: label },
                            ),
                          );
                        })
                      }
                      size="xs"
                    >
                      ×
                    </SecondaryButton>
                  )}
                </Group>
              </Group>
            );
          })}
        </Stack>

        <Group gap="lg" wrap="wrap">
          <Checkbox
            checked={fi.spareStockUsed}
            disabled={!canRecord}
            label={tr("production.workOrderFinalInspectionPanel.useSpareStock")}
            onChange={(e) =>
              startTransition(async () => {
                const result = await setFinalInspectionSpareStock(
                  workOrderNumber,
                  "spareStockUsed",
                  e.currentTarget.checked,
                );
                afterResult(
                  result,
                  tr(
                    "production.workOrderFinalInspectionPanel.spareStockUseWasRecorded",
                  ),
                );
              })
            }
          />
          <Checkbox
            checked={fi.spareStockReceived}
            disabled={!canRecord}
            label={tr(
              "production.workOrderFinalInspectionPanel.receiveIntoSpareStock",
            )}
            onChange={(e) =>
              startTransition(async () => {
                const result = await setFinalInspectionSpareStock(
                  workOrderNumber,
                  "spareStockReceived",
                  e.currentTarget.checked,
                );
                afterResult(
                  result,
                  tr(
                    "production.workOrderFinalInspectionPanel.spareStockReceiptWasRecorded",
                  ),
                );
              })
            }
          />
        </Group>

        <Stack gap="xs">
          <Text fw={500} size="sm">
            {tr(
              "production.workOrderFinalInspectionPanel.preShipmentChecksPackingDeliveryNote",
            )}
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
                    ) : !canRecord ? (
                      <Text c="dimmed" size="xs">
                        —
                      </Text>
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
                            afterResult(
                              result,
                              tr(
                                "production.workOrderFinalInspectionPanel.stageRecorded",
                                { stage: label },
                              ),
                            );
                          })
                        }
                        size="xs"
                      >
                        {tr("production.workOrderFinalInspectionPanel.record")}
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
            {tr(
              "production.workOrderFinalInspectionPanel.checkedByStampForDefectsAt",
            )}
          </Text>
          {fi.shipDefectReviewedAt && (
            <Text c="dimmed" size="xs">
              確認: {fmt.dateTime(fi.shipDefectReviewedAt)}
              {fi.shipDefectReviewedByName
                ? `（${fi.shipDefectReviewedByName}）`
                : ""}
            </Text>
          )}
          {canRecord ? (
            <Textarea
              minRows={2}
              onChange={(e) => setNotes(e.currentTarget.value)}
              placeholder={tr(
                "production.workOrderFinalInspectionPanel.defectsFoundAtThePreShipment",
              )}
              value={notes}
            />
          ) : (
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {fi.shipDefectNotes || "—"}
            </Text>
          )}
          {canRecord && (
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
                      tr(
                        "production.workOrderFinalInspectionPanel.theShippingDefectCheckStampWas",
                      ),
                    );
                  })
                }
              >
                {tr("production.workOrderFinalInspectionPanel.check")}
              </SecondaryButton>
            </Group>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}
