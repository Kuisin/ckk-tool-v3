"use client";

/**
 * StepWipRecordingForm — 工程完了のとき、仕掛品として在庫に置く分の記録欄。
 *
 * 品物が工程を離れて在庫に入る完了（半製品の数 > 0 / 「半製品在庫へ」で終わる
 * 分岐の終端）でだけ出る。出すもの:
 *   - 在庫に入る**加工状態**（読み取り専用 — 済んだ形を変える工程の並び）
 *   - 仕上がり径・長（形を変える工程が済んでいれば必須。無ければブランクの寸法が既定）
 *   - 手前に合流があるときだけ、通ってきた経路の選択（推奨 = 本流が既定）
 *
 * 規則は持たない — twin の lib/wip-state-core.ts checkWipRecordingDraft の結果を
 * 描くだけ（nextjs-web の WipRecordingFields と同じ関数）。権威は API 側で、
 * 同じ関数で再検証する。
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
import { fillMessage } from "@/lib/i18n";
import {
  checkWipRecordingDraft,
  type WipRecordingDraft,
  type WipRecordingView,
  wipPathOptions,
} from "@/lib/wip-state-core";
import { useI18n } from "../I18nProvider";

/** twin の WipRecordingView の、工程名を表示言語に解決した形。 */
export type KioskWipRecordingView = Omit<WipRecordingView, "stepNames"> & {
  stepNames: Record<string, string>;
};

export const EMPTY_WIP_DRAFT: WipRecordingDraft = {
  finishedDiameterMm: null,
  finishedLengthMm: null,
  pathIndex: 0,
};

/** 完了の要求に載せる入力と、完了を止める不備（欄を出さない完了では空）。 */
export function wipRecordingCheck(
  view: KioskWipRecordingView | null,
  q: { defectSemiFinished: number; outputSuccess: number },
  draft: WipRecordingDraft,
) {
  if (!view) {
    return { states: [], dimensionsRequired: false, input: null, issues: [] };
  }
  return checkWipRecordingDraft(view, q, draft);
}

export function StepWipRecordingForm({
  view,
  defectSemiFinished,
  outputSuccess,
  draft,
  onChange,
}: {
  view: KioskWipRecordingView | null;
  defectSemiFinished: number;
  outputSuccess: number;
  draft: WipRecordingDraft;
  onChange: (draft: WipRecordingDraft) => void;
}) {
  const { m } = useI18n();
  if (!view) return null;
  const check = checkWipRecordingDraft(
    view,
    { defectSemiFinished, outputSuccess },
    draft,
  );
  if (check.states.length === 0) return null;

  const t = m.steps.wip;
  const stateLabel = (stepIds: readonly number[]) =>
    stepIds.length === 0
      ? t.stateUnprocessed
      : stepIds.map((id) => view.stepNames[String(id)] ?? `#${id}`).join(" → ");
  const options = wipPathOptions(view.path);
  const toNumber = (v: string | number): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Stack gap={2}>
          <Text fw={700}>{t.title}</Text>
          <Text c="dimmed" size="sm">
            {t.description}
          </Text>
        </Stack>

        {view.path.ambiguous && (
          <Select
            allowDeselect={false}
            data={options.map((stepIds, i) => ({
              value: String(i),
              label:
                i === 0
                  ? `${stateLabel(stepIds)} — ${t.recommended}`
                  : stateLabel(stepIds),
            }))}
            description={t.pathHint}
            label={t.path}
            onChange={(v) =>
              v != null && onChange({ ...draft, pathIndex: Number(v) })
            }
            size="lg"
            value={String(draft.pathIndex)}
            withAsterisk
          />
        )}

        <Stack gap={6}>
          <Text c="dimmed" size="sm">
            {t.state}
          </Text>
          {check.states.map((s) => (
            <Group gap="xs" key={s.kind} wrap="wrap">
              <Badge color="orange" size="lg" variant="light">
                {s.kind === "DEFECT" ? t.kindDefect : t.kindBranchTerminal}
              </Badge>
              <Text fw={600}>{stateLabel(s.stepIds)}</Text>
            </Group>
          ))}
        </Stack>

        <SimpleGrid cols={2} spacing="md">
          <NumberInput
            allowNegative={false}
            decimalScale={3}
            inputMode="decimal"
            label={t.finishedDiameter}
            min={0}
            onChange={(v) =>
              onChange({ ...draft, finishedDiameterMm: toNumber(v) })
            }
            placeholder={
              !check.dimensionsRequired && view.blank
                ? String(view.blank.diameterMm)
                : undefined
            }
            size="lg"
            value={draft.finishedDiameterMm ?? ""}
            withAsterisk={check.dimensionsRequired}
          />
          <NumberInput
            allowNegative={false}
            decimalScale={3}
            inputMode="decimal"
            label={t.finishedLength}
            min={0}
            onChange={(v) =>
              onChange({ ...draft, finishedLengthMm: toNumber(v) })
            }
            placeholder={
              !check.dimensionsRequired && view.blank
                ? String(view.blank.lengthMm)
                : undefined
            }
            size="lg"
            value={draft.finishedLengthMm ?? ""}
            withAsterisk={check.dimensionsRequired}
          />
        </SimpleGrid>

        {!check.dimensionsRequired && view.blank && (
          <Alert color="blue" icon={<IconInfoCircle size={20} />}>
            {fillMessage(t.defaultsToBlank, {
              diameter: view.blank.diameterMm,
              length: view.blank.lengthMm,
            })}
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
