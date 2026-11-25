"use client";

/**
 * WipRecordingFields — 工程完了のとき、仕掛品として在庫に置く分の記録欄。
 *
 * 品物が工程を離れて在庫に入る完了（半製品の数 > 0 / 「半製品在庫へ」で終わる
 * 分岐の終端）でだけ出る。出すもの:
 *   - 在庫に入る加工状態（読み取り専用 — 済んだ形を変える工程の並び）
 *   - 仕上がり径・長（形を変える工程が済んでいれば必須。無ければブランクの寸法が既定）
 *   - 手前に合流があるときだけ、通ってきた経路の選択（推奨 = 本流が既定）
 *
 * 規則は持たない — lib/wip-state-core.ts checkWipRecordingDraft の結果を描くだけ。
 * サーバー（completeStepExecution）が同じ関数で再検証する。
 */

import {
  Alert,
  Badge,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { StepWipRecordingView } from "@/components/production/step-execution/model";
import {
  checkWipRecordingDraft,
  type WipRecordingDraft,
  wipPathOptions,
} from "@/lib/wip-state-core";

export const EMPTY_WIP_DRAFT: WipRecordingDraft = {
  finishedDiameterMm: null,
  finishedLengthMm: null,
  pathIndex: 0,
};

/** 完了の要求に載せる入力と、完了を止める不備（欄を出さない完了では空）。 */
export function wipRecordingCheck(
  view: StepWipRecordingView | null,
  q: { defectSemiFinished: number; outputSuccess: number },
  draft: WipRecordingDraft,
) {
  if (!view) {
    return { states: [], dimensionsRequired: false, input: null, issues: [] };
  }
  return checkWipRecordingDraft(view, q, draft);
}

export function WipRecordingFields({
  view,
  defectSemiFinished,
  outputSuccess,
  draft,
  onChange,
  disabled,
}: {
  view: StepWipRecordingView | null;
  defectSemiFinished: number;
  outputSuccess: number;
  draft: WipRecordingDraft;
  onChange: (draft: WipRecordingDraft) => void;
  disabled?: boolean;
}) {
  const tr = useTranslations();
  if (!view) return null;
  const check = checkWipRecordingDraft(
    view,
    { defectSemiFinished, outputSuccess },
    draft,
  );
  if (check.states.length === 0) return null;

  const stateLabel = (stepIds: readonly number[]) =>
    stepIds.length === 0
      ? tr("production.wipRecording.stateUnprocessed")
      : stepIds.map((id) => view.stepNames[String(id)] ?? `#${id}`).join(" → ");
  const options = wipPathOptions(view.path);
  const toNumber = (v: string | number): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  return (
    <Paper p="sm" radius="sm" withBorder>
      <Stack gap="sm">
        <Stack gap={2}>
          <Text fw={600} size="sm">
            {tr("production.wipRecording.title")}
          </Text>
          <Text c="dimmed" size="xs">
            {tr("production.wipRecording.description")}
          </Text>
        </Stack>

        {view.path.ambiguous && (
          <Select
            allowDeselect={false}
            data={options.map((stepIds, i) => ({
              value: String(i),
              label:
                i === 0
                  ? `${stateLabel(stepIds)} — ${tr("production.wipRecording.recommended")}`
                  : stateLabel(stepIds),
            }))}
            description={tr("production.wipRecording.pathHint")}
            disabled={disabled}
            label={tr("production.wipRecording.path")}
            onChange={(v) =>
              v != null && onChange({ ...draft, pathIndex: Number(v) })
            }
            value={String(draft.pathIndex)}
            withAsterisk
          />
        )}

        <Stack gap={4}>
          <Text c="dimmed" size="xs">
            {tr("production.wipRecording.state")}
          </Text>
          {check.states.map((s) => (
            <Group gap="xs" key={s.kind} wrap="wrap">
              <Badge color="orange" variant="light">
                {s.kind === "DEFECT"
                  ? tr("production.wipRecording.kindDefect")
                  : tr("production.wipRecording.kindBranchTerminal")}
              </Badge>
              <Text fw={500} size="sm">
                {stateLabel(s.stepIds)}
              </Text>
            </Group>
          ))}
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <NumberInput
            allowNegative={false}
            decimalScale={3}
            disabled={disabled}
            label={tr("production.wipRecording.finishedDiameter")}
            min={0}
            onChange={(v) =>
              onChange({ ...draft, finishedDiameterMm: toNumber(v) })
            }
            placeholder={
              !check.dimensionsRequired && view.blank
                ? String(view.blank.diameterMm)
                : undefined
            }
            value={draft.finishedDiameterMm ?? ""}
            withAsterisk={check.dimensionsRequired}
          />
          <NumberInput
            allowNegative={false}
            decimalScale={3}
            disabled={disabled}
            label={tr("production.wipRecording.finishedLength")}
            min={0}
            onChange={(v) =>
              onChange({ ...draft, finishedLengthMm: toNumber(v) })
            }
            placeholder={
              !check.dimensionsRequired && view.blank
                ? String(view.blank.lengthMm)
                : undefined
            }
            value={draft.finishedLengthMm ?? ""}
            withAsterisk={check.dimensionsRequired}
          />
        </SimpleGrid>

        {!check.dimensionsRequired && view.blank && (
          <Alert
            color="blue"
            icon={<IconInfoCircle size={16} />}
            p="xs"
            variant="light"
          >
            {tr("production.wipRecording.defaultsToBlank", {
              diameter: view.blank.diameterMm,
              length: view.blank.lengthMm,
            })}
          </Alert>
        )}

        {check.issues.length > 0 && (
          <Text c="red" size="xs">
            {check.issues
              .map((i) => tr(`production.wipRecording.issues.${i}`))
              .join(" / ")}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
