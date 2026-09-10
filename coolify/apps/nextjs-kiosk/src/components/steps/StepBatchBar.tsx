"use client";

/**
 * StepBatchBar.tsx — 選んだ工程をまとめて開始 / 一時停止 / 完了する下部の帯。
 *
 * **ボタン 1 つ = 意味 1 つ。** 束ねられない組み合わせ（開始できる工程と作業中の
 * 工程が混ざっている等）は commonBatchActions が空を返すので、黙って 2 回の
 * 呼び出しに分けたりせず、注意書きを出してボタンを閉じる。
 *
 * 確認 → 実行 → **同じモーダルの中身を結果に差し替える**（閉じない）。失敗した
 * 工程は選択に残すので、直してすぐ再試行できる。
 */

import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fillMessage } from "@/lib/i18n";
import {
  type BatchAction,
  type BatchIneligibility,
  commonBatchActions,
  partitionForBatch,
  summarizeBatch,
} from "@/lib/step-batch-core";
import type { MyStepView } from "@/lib/steps";
import { useI18n } from "../I18nProvider";
import {
  type BatchStepResponse,
  callBatchStepAction,
  translateError,
} from "./step-ui";

type Props = {
  selected: MyStepView[];
  /** 実行後に選択を入れ替える（失敗した工程だけ残す）。 */
  onFinished: (failedIds: string[]) => void;
};

type Phase =
  | { kind: "idle" }
  | { kind: "confirm"; action: BatchAction }
  | { kind: "result"; action: BatchAction; results: BatchStepResponse[] };

export function StepBatchBar({ selected, onFinished }: Props) {
  const router = useRouter();
  const { m } = useI18n();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  const actions = commonBatchActions(selected.map((s) => s.sessionState));
  const mixed = selected.length > 0 && actions.length === 0;

  const candidates = selected.map((s) => ({
    stepId: s.stepId,
    sessionState: s.sessionState,
    lotInputMode: s.lotInputMode,
    quantityMode: s.quantityMode,
    inspectionMissing: s.inspectionMissing,
  }));
  const byId = new Map(selected.map((s) => [s.stepId, s]));

  const reasonLabel = (r: BatchIneligibility) =>
    r === "LOT_REQUIRED"
      ? m.steps.batch.reasonLotRequired
      : r === "INSPECTION_REQUIRED"
        ? m.steps.batch.reasonInspectionRequired
        : m.steps.batch.reasonNotSelectable;

  const actionLabel = (a: BatchAction, n: number) =>
    a === "START"
      ? fillMessage(m.steps.batch.start, { n })
      : a === "PAUSE"
        ? fillMessage(m.steps.batch.pause, { n })
        : fillMessage(m.steps.batch.complete, { n });

  const confirmTitle = (a: BatchAction, n: number) =>
    a === "START"
      ? fillMessage(m.steps.batch.confirmStart, { n })
      : a === "PAUSE"
        ? fillMessage(m.steps.batch.confirmPause, { n })
        : fillMessage(m.steps.batch.confirmComplete, { n });

  const run = async (action: BatchAction) => {
    const { eligible } = partitionForBatch(candidates, action);
    if (eligible.length === 0) return;
    setBusy(true);
    const res = await callBatchStepAction({
      action,
      stepIds: eligible.map((e) => e.stepId),
    });
    setBusy(false);
    setPhase({ kind: "result", action, results: res.results });
    router.refresh();
  };

  const closeResult = () => {
    if (phase.kind !== "result") return;
    const { failedIds } = summarizeBatch(phase.results);
    setPhase({ kind: "idle" });
    onFinished(failedIds);
  };

  if (selected.length === 0) return null;

  const confirmAction = phase.kind === "confirm" ? phase.action : null;
  const { eligible, rejected } =
    confirmAction != null
      ? partitionForBatch(candidates, confirmAction)
      : { eligible: [], rejected: [] };

  return (
    <>
      {/* 下部に貼り付く操作の帯。Affix ではなくページ内 sticky
          （作業中の丸薬と場所を取り合わない） */}
      <Paper
        p="md"
        radius="md"
        shadow="md"
        style={{ bottom: 0, position: "sticky", zIndex: 2 }}
        withBorder
      >
        <Group justify="space-between" wrap="wrap">
          <Group gap="sm" wrap="nowrap">
            <Badge color="blue" size="lg" variant="filled">
              {fillMessage(m.steps.batch.selectedCount, {
                n: selected.length,
              })}
            </Badge>
            {mixed && (
              <Text c="orange" size="sm">
                {m.steps.batch.mixedSelection}
              </Text>
            )}
          </Group>
          <Group gap="sm" wrap="wrap">
            {actions.map((a) => {
              const n = partitionForBatch(candidates, a).eligible.length;
              return (
                <Button
                  color={a === "COMPLETE" ? "green" : "blue"}
                  disabled={n === 0}
                  key={a}
                  onClick={() => setPhase({ action: a, kind: "confirm" })}
                  variant={a === "PAUSE" ? "default" : "filled"}
                >
                  {actionLabel(a, n)}
                </Button>
              );
            })}
          </Group>
        </Group>
      </Paper>

      <Modal
        onClose={() =>
          phase.kind === "result" ? closeResult() : setPhase({ kind: "idle" })
        }
        opened={phase.kind !== "idle"}
        size="lg"
        title={
          phase.kind === "confirm"
            ? confirmTitle(phase.action, eligible.length)
            : phase.kind === "result"
              ? resultTitle(m, phase.action, phase.results)
              : ""
        }
      >
        {phase.kind === "confirm" && (
          <Stack gap="md">
            {phase.action === "START" && (
              <Alert color="blue">{m.steps.batch.expectedInputNote}</Alert>
            )}
            {phase.action === "COMPLETE" && (
              <Alert color="yellow" icon={<IconAlertTriangle size={20} />}>
                {m.steps.batch.allGoodNote}
              </Alert>
            )}

            <ScrollArea.Autosize mah={320}>
              <Stack gap="xs">
                {eligible.map((e) => {
                  const s = byId.get(e.stepId);
                  if (!s) return null;
                  return (
                    <Text key={e.stepId} size="sm">
                      {fillMessage(m.steps.card.workOrder, {
                        n: s.workOrderNumber,
                      })}
                      {` ${m.common.separator} ${s.stepName}`}
                    </Text>
                  );
                })}
                {rejected.map(({ row, reason }) => {
                  const s = byId.get(row.stepId);
                  if (!s) return null;
                  return (
                    <Group gap="xs" key={row.stepId} wrap="nowrap">
                      <Text c="dimmed" size="sm" style={{ flexShrink: 0 }}>
                        {fillMessage(m.steps.card.workOrder, {
                          n: s.workOrderNumber,
                        })}
                      </Text>
                      <Text c="orange" size="sm">
                        {reasonLabel(reason)}
                      </Text>
                      <Button
                        onClick={() => router.push(`/steps/${s.stepId}`)}
                        size="compact-sm"
                        variant="subtle"
                      >
                        {m.steps.batch.open}
                      </Button>
                    </Group>
                  );
                })}
              </Stack>
            </ScrollArea.Autosize>

            <Group justify="flex-end">
              <Button
                onClick={() => setPhase({ kind: "idle" })}
                variant="default"
              >
                {m.steps.batch.cancel}
              </Button>
              <Button
                disabled={eligible.length === 0}
                loading={busy}
                onClick={() => run(phase.action)}
              >
                {m.steps.batch.run}
              </Button>
            </Group>
          </Stack>
        )}

        {phase.kind === "result" && (
          <Stack gap="md">
            <ScrollArea.Autosize mah={320}>
              <Stack gap="xs">
                {phase.results
                  .filter((r) => !r.ok)
                  .map((r) => {
                    const s = byId.get(r.stepId);
                    return (
                      <Group gap="xs" key={r.stepId} wrap="nowrap">
                        <Text c="dimmed" size="sm" style={{ flexShrink: 0 }}>
                          {s
                            ? fillMessage(m.steps.card.workOrder, {
                                n: s.workOrderNumber,
                              })
                            : ""}
                        </Text>
                        <Text c="red" size="sm">
                          {translateError(m, r)}
                        </Text>
                        <Button
                          onClick={() => router.push(`/steps/${r.stepId}`)}
                          size="compact-sm"
                          variant="subtle"
                        >
                          {m.steps.batch.open}
                        </Button>
                      </Group>
                    );
                  })}
              </Stack>
            </ScrollArea.Autosize>
            <Group justify="flex-end">
              <Button onClick={closeResult}>{m.steps.batch.close}</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}

function resultTitle(
  m: ReturnType<typeof useI18n>["m"],
  action: BatchAction,
  results: BatchStepResponse[],
): string {
  const { succeeded, failed } = summarizeBatch(results);
  if (failed === 0) {
    return action === "START"
      ? fillMessage(m.steps.batch.resultStarted, { n: succeeded })
      : action === "PAUSE"
        ? fillMessage(m.steps.batch.resultPaused, { n: succeeded })
        : fillMessage(m.steps.batch.resultCompleted, { n: succeeded });
  }
  if (succeeded === 0) {
    return fillMessage(m.steps.batch.resultAllFailed, { n: failed });
  }
  return fillMessage(m.steps.batch.resultMixed, { ng: failed, ok: succeeded });
}
