"use client";

/**
 * WipDrawPanel — 指示書ビルダーの「使える仕掛品」（PD12 / PD22）。
 *
 * 製品を選ぶと、在庫に置いてある仕掛品のうち**この製品の続きに使えるもの**を
 * 並べる。選ぶと、その加工状態で済んでいる工程を飛ばし、半製品出しから始まる
 * 指示書になる（_specs/feature/02-production.md §7）。目標製品が違ってよい —
 * 別の製品のために作りかけた品を使い回すための画面。
 *
 * 候補は **3 つの区分に分けて**見せる（利用者の決定）: ちょうど / 長い / 太い。
 * 加工状態が製品の工程の先頭部分になっていないもの（その他）は畳んでおき、
 * 使うには理由が要る（監査ログに残る）。
 *
 * 規則は持たない — 突合は lib/wip-state-core.ts matchWip（サーバー）、選び方の
 * 検証と飛ばす工程は wip-draw-model.ts（= validateWipDraws / planWipStart）。
 */

import {
  Alert,
  Badge,
  Box,
  Checkbox,
  Collapse,
  Divider,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Paper,
  Stack,
  Table,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getWipCandidatesForWorkOrder } from "@/app/(dashboard)/production/work-orders/actions";
import { WipStateLabel } from "@/components/inventory/wip/WipStockList";
import { GhostButton } from "@/components/ui/buttons";
import { FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { wipSizeLabel } from "@/lib/wip-stock-core";
// type-only import — lib/work-order-wip は server-only。
import type {
  WipCandidateGroup,
  WipCandidateRow,
  WipCandidatesView,
} from "@/lib/work-order-wip";
import {
  type WipDrawSelection,
  type WipSelectionState,
  wipCandidateRows,
} from "./wip-draw-model";

const fmtQty = (n: number) => n.toLocaleString("ja-JP");

/**
 * 候補の読み出し。工程の構成（`stepIds`）か製品が変わるたびに引き直す —
 * 突合の相手はいま組んである工程そのものなので、工程を足し引きすれば候補も動く。
 */
export function useWipCandidates(args: {
  enabled: boolean;
  itemId: number | null;
  stepIds: readonly number[];
  workOrderNumber?: number | null;
}): { view: WipCandidatesView | null; loading: boolean } {
  const [view, setView] = useState<WipCandidatesView | null>(null);
  const [loading, setLoading] = useState(false);
  const key = args.stepIds.join(",");
  const { enabled, itemId, workOrderNumber } = args;
  useEffect(() => {
    if (!enabled || itemId == null || key === "") {
      setView(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getWipCandidatesForWorkOrder({
      itemId,
      stepIds: key.split(",").map(Number),
      workOrderNumber: workOrderNumber ?? null,
    }).then((v) => {
      if (cancelled) return;
      setView(v);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, itemId, key, workOrderNumber]);
  return { view, loading };
}

const GROUP_COLOR: Record<WipCandidateGroup, string> = {
  exact: "green",
  longer: "blue",
  largerDiameter: "grape",
  other: "orange",
};

export function WipDrawPanel({
  view,
  loading,
  selection,
  state,
  plannedQuantity,
  onChange,
}: {
  view: WipCandidatesView | null;
  loading: boolean;
  selection: WipDrawSelection;
  state: WipSelectionState;
  plannedQuantity: number;
  onChange: (next: WipDrawSelection) => void;
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();
  const rows = wipCandidateRows(view);
  const otherSelected = state.selected.some((s) => s.row.group === "other");
  const [showOther, setShowOther] = useState(false);
  const otherOpen = showOther || otherSelected;
  // 1 枚の指示書に加工状態は 1 つ — 選んだあとは同じ状態の行だけ選べる。
  const lockedStateId = state.selected[0]?.row.wipStateId ?? null;
  const stepName = (id: number) => view?.stepNames[id] ?? `#${id}`;

  const toggle = (row: WipCandidateRow, checked: boolean) => {
    const draws = { ...selection.draws };
    if (checked) {
      const want = Math.max(1, plannedQuantity - state.total);
      draws[row.id] = Math.max(1, Math.min(row.available, want));
    } else {
      delete draws[row.id];
    }
    const cleared = Object.keys(draws).length === 0;
    onChange({
      draws,
      overrideReason: cleared ? "" : selection.overrideReason,
      redoStepIds: cleared ? [] : selection.redoStepIds,
    });
  };
  const setQuantity = (row: WipCandidateRow, value: number | string) => {
    const n = typeof value === "number" ? value : Number(value);
    onChange({
      ...selection,
      draws: { ...selection.draws, [row.id]: Number.isFinite(n) ? n : 0 },
    });
  };

  const cells = (row: WipCandidateRow) => {
    const checked = row.id in selection.draws;
    const blocked = lockedStateId != null && row.wipStateId !== lockedStateId;
    const finished = wipSizeLabel(row.finishedDiameterMm, row.finishedLengthMm);
    const blank = wipSizeLabel(row.diameterMm, row.lengthMm);
    return {
      checked,
      select: (
        <Tooltip
          disabled={!blocked}
          label={tr("production.wipDraw.mixedStatesHint")}
          withinPortal
        >
          <Checkbox
            aria-label={tr("production.wipDraw.selectRow", {
              lot: row.lotNumber ?? "—",
            })}
            checked={checked}
            disabled={blocked && !checked}
            onChange={(e) => toggle(row, e.currentTarget.checked)}
          />
        </Tooltip>
      ),
      state: <WipStateLabel row={row} />,
      size: (
        <Stack gap={0}>
          <Text size="sm">{finished ?? "—"}</Text>
          {blank && (
            <Text c="dimmed" size="xs">
              {tr("production.wipDraw.blankSize", { size: blank })}
            </Text>
          )}
        </Stack>
      ),
      aimed: (
        <Text size="sm">
          {row.aimedProductName ?? "—"}
          {row.aimedProductCode ? (
            <Text c="dimmed" component="span" ff="mono" ml={6} size="xs">
              {row.aimedProductCode}
            </Text>
          ) : null}
        </Text>
      ),
      lot: (
        <Text ff="mono" size="sm">
          {row.lotNumber != null ? `#${row.lotNumber}` : "—"}
        </Text>
      ),
      available: (
        <Stack gap={0}>
          <Text className="tabular-nums" fw={600} size="sm">
            {fmtQty(row.available)}
          </Text>
          {row.reservedQuantity > 0 && (
            <Text c="dimmed" size="xs">
              {tr("production.wipDraw.reservedNote", {
                count: fmtQty(row.reservedQuantity),
              })}
            </Text>
          )}
          {row.pendingElsewhere > 0 && (
            <Text c="orange" size="xs">
              {tr("production.wipDraw.pendingElsewhere", {
                count: fmtQty(row.pendingElsewhere),
              })}
            </Text>
          )}
        </Stack>
      ),
      skips:
        row.skippableStepIds.length === 0 ? (
          <Text c="dimmed" size="xs">
            {tr("production.wipDraw.noSkip")}
          </Text>
        ) : (
          <Group gap={4} wrap="wrap">
            {row.skippableStepIds.map((id) => (
              <Badge color="gray" key={id} size="xs" variant="light">
                {stepName(id)}
              </Badge>
            ))}
          </Group>
        ),
      quantity: checked ? (
        <NumberInput
          allowDecimal={false}
          aria-label={tr("production.wipDraw.drawQuantity")}
          error={
            selection.draws[row.id] > row.available ||
            !(selection.draws[row.id] >= 1)
          }
          max={row.available}
          min={1}
          onChange={(v) => setQuantity(row, v)}
          size="xs"
          value={selection.draws[row.id]}
          w={isMobile ? "100%" : 96}
        />
      ) : null,
    };
  };

  const groupBlock = (group: WipCandidateGroup, list: WipCandidateRow[]) => {
    if (list.length === 0) return null;
    return (
      <Box data-wip-group={group} key={group}>
        <Group gap="xs" mb={6} wrap="wrap">
          <Badge color={GROUP_COLOR[group]} variant="light">
            {tr(`production.wipDraw.group.${group}.title`)}
          </Badge>
          <Text c="dimmed" size="xs">
            {tr(`production.wipDraw.group.${group}.description`)}
          </Text>
        </Group>
        {isMobile ? (
          <Stack gap="xs">
            {list.map((row) => {
              const c = cells(row);
              return (
                <Paper
                  data-wip-row={row.id}
                  key={row.id}
                  p="sm"
                  radius="sm"
                  withBorder
                >
                  <Group align="flex-start" gap="sm" wrap="nowrap">
                    {c.select}
                    <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                      {c.state}
                      <Group gap="md" wrap="wrap">
                        <LabelValue
                          label={tr("inventory.wip.finishedSize")}
                          value={c.size}
                        />
                        <LabelValue
                          label={tr("production.wipDraw.available")}
                          value={c.available}
                        />
                        <LabelValue label={tr("common.lot")} value={c.lot} />
                      </Group>
                      <LabelValue
                        label={tr("inventory.wip.aimedProduct")}
                        value={c.aimed}
                      />
                      <LabelValue
                        label={tr("production.wipDraw.skippedSteps")}
                        value={c.skips}
                      />
                      {c.quantity && (
                        <LabelValue
                          label={tr("production.wipDraw.drawQuantity")}
                          value={c.quantity}
                        />
                      )}
                    </Stack>
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        ) : (
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={36} />
                <Table.Th>{tr("inventory.wip.state")}</Table.Th>
                <Table.Th>{tr("inventory.wip.finishedSize")}</Table.Th>
                <Table.Th>{tr("inventory.wip.aimedProduct")}</Table.Th>
                <Table.Th>{tr("common.lot")}</Table.Th>
                <Table.Th>{tr("production.wipDraw.available")}</Table.Th>
                <Table.Th>{tr("production.wipDraw.skippedSteps")}</Table.Th>
                <Table.Th w={112}>
                  {tr("production.wipDraw.drawQuantity")}
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.map((row) => {
                const c = cells(row);
                return (
                  <Table.Tr data-wip-row={row.id} key={row.id}>
                    <Table.Td>{c.select}</Table.Td>
                    <Table.Td>{c.state}</Table.Td>
                    <Table.Td>{c.size}</Table.Td>
                    <Table.Td>{c.aimed}</Table.Td>
                    <Table.Td>{c.lot}</Table.Td>
                    <Table.Td>{c.available}</Table.Td>
                    <Table.Td>{c.skips}</Table.Td>
                    <Table.Td>{c.quantity}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Box>
    );
  };

  const body = () => {
    if (loading && !view) {
      return (
        <Group gap="xs">
          <Loader size="xs" />
          <Text c="dimmed" size="sm">
            {tr("common.loading")}
          </Text>
        </Group>
      );
    }
    if (!view) return null;
    if (!view.permitted) {
      return (
        <Text c="dimmed" size="sm">
          {tr("production.wipDraw.notPermitted")}
        </Text>
      );
    }
    if (!view.productReady) {
      return (
        <Text c="dimmed" size="sm">
          {tr("production.wipDraw.productNotReady")}
        </Text>
      );
    }
    if (rows.length === 0) {
      return (
        <Text c="dimmed" size="sm">
          {tr("production.wipDraw.empty")}
        </Text>
      );
    }
    const usable = view.exact.length + view.longer.length;
    return (
      <Stack gap="md">
        {usable + view.largerDiameter.length === 0 && (
          <Text c="dimmed" size="sm">
            {tr("production.wipDraw.onlyOther")}
          </Text>
        )}
        {groupBlock("exact", view.exact)}
        {groupBlock("longer", view.longer)}
        {groupBlock("largerDiameter", view.largerDiameter)}
        {view.other.length > 0 && (
          <Box>
            <Divider mb="xs" />
            <GhostButton
              aria-expanded={otherOpen}
              disabled={otherSelected}
              onClick={() => setShowOther((v) => !v)}
              size="xs"
            >
              {otherOpen
                ? tr("production.wipDraw.hideOther")
                : tr("production.wipDraw.showOther", {
                    count: view.other.length,
                  })}
            </GhostButton>
            <Collapse expanded={otherOpen}>
              <Stack gap="sm" mt="xs">
                <Alert
                  color="orange"
                  icon={<IconAlertTriangle size={16} />}
                  p="xs"
                  variant="light"
                >
                  {tr("production.wipDraw.otherWarning")}
                </Alert>
                {groupBlock("other", view.other)}
              </Stack>
            </Collapse>
          </Box>
        )}
      </Stack>
    );
  };

  const hasSelection = Object.keys(selection.draws).length > 0;
  return (
    <FormSection
      description={tr("production.wipDraw.description")}
      title={tr("production.wipDraw.title")}
    >
      <Stack gap="md">
        {body()}
        {state.missingIds.length > 0 && (
          <Alert
            color="red"
            icon={<IconAlertTriangle size={16} />}
            p="xs"
            variant="light"
          >
            <Group gap="sm" justify="space-between" wrap="wrap">
              <Text size="sm">
                {tr("production.wipDraw.missingSelection", {
                  count: state.missingIds.length,
                })}
              </Text>
              <GhostButton
                onClick={() => {
                  const draws = { ...selection.draws };
                  for (const id of state.missingIds) delete draws[id];
                  const cleared = Object.keys(draws).length === 0;
                  onChange({
                    draws,
                    overrideReason: cleared ? "" : selection.overrideReason,
                    redoStepIds: cleared ? [] : selection.redoStepIds,
                  });
                }}
                size="xs"
              >
                {tr("production.wipDraw.dropMissing")}
              </GhostButton>
            </Group>
          </Alert>
        )}
        {hasSelection && view && (
          <Paper data-wip-summary p="sm" radius="sm" withBorder>
            <Stack gap="sm">
              <Group gap="sm" wrap="wrap">
                <Text fw={600} size="sm">
                  {tr("production.wipDraw.summary", {
                    total: fmtQty(state.total),
                    planned: fmtQty(plannedQuantity),
                  })}
                </Text>
                {state.total !== plannedQuantity && (
                  <Badge color="orange" variant="light">
                    {state.total < plannedQuantity
                      ? tr("production.wipDraw.lessThanPlanned")
                      : tr("production.wipDraw.moreThanPlanned")}
                  </Badge>
                )}
              </Group>
              <Alert
                color="blue"
                icon={<IconInfoCircle size={16} />}
                p="xs"
                variant="light"
              >
                {tr("production.wipDraw.startsFromSemiIssue")}
              </Alert>
              <Box>
                <Text c="dimmed" mb={4} size="xs">
                  {tr("production.wipDraw.willSkip")}
                </Text>
                {state.skippedStepIds.length === 0 ? (
                  <Text size="sm">{tr("production.wipDraw.noSkip")}</Text>
                ) : (
                  <Group gap={4} wrap="wrap">
                    {state.skippedStepIds.map((id) => (
                      <Badge color="gray" key={id} variant="light">
                        {stepName(id)}
                      </Badge>
                    ))}
                  </Group>
                )}
              </Box>
              {state.skippableStepIds.length > 0 && (
                <MultiSelect
                  clearable
                  data={state.skippableStepIds.map((id) => ({
                    value: String(id),
                    label: stepName(id),
                  }))}
                  description={tr("production.wipDraw.redoHelp")}
                  label={tr("production.wipDraw.redo")}
                  onChange={(values) =>
                    onChange({
                      ...selection,
                      redoStepIds: values.map(Number),
                    })
                  }
                  value={selection.redoStepIds
                    .filter((id) => state.skippableStepIds.includes(id))
                    .map(String)}
                />
              )}
              {state.hasOversize && (
                <Alert
                  color="yellow"
                  icon={<IconAlertTriangle size={16} />}
                  p="xs"
                  variant="light"
                >
                  {tr("production.wipDraw.oversizeHint")}
                </Alert>
              )}
              {state.needsOverride && (
                <Textarea
                  autosize
                  description={tr("production.wipDraw.overrideReasonHelp")}
                  error={
                    state.issues.includes("overrideReasonRequired")
                      ? tr("production.wipDraw.issue.overrideReasonRequired")
                      : undefined
                  }
                  label={tr("production.wipDraw.overrideReason")}
                  maxLength={500}
                  minRows={2}
                  onChange={(e) =>
                    onChange({
                      ...selection,
                      overrideReason: e.currentTarget.value,
                    })
                  }
                  value={selection.overrideReason}
                  withAsterisk
                />
              )}
              {state.issues
                .filter((i) => i !== "overrideReasonRequired")
                .map((i) => (
                  <Text c="red" key={i} size="xs">
                    {tr(`production.wipDraw.issue.${i}`)}
                  </Text>
                ))}
            </Stack>
          </Paper>
        )}
      </Stack>
    </FormSection>
  );
}

function LabelValue({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Stack gap={2}>
      <Text c="dimmed" size="xs">
        {label}
      </Text>
      <Box>{value}</Box>
    </Stack>
  );
}
