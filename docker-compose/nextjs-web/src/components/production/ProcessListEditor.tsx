"use client";

/**
 * ProcessListEditor — 工程構成エディタ（工程選択 + 実施場所）。
 *
 * WorkflowBuilder（指示書）と製品工程ルートのエディタで共用する制御
 * コンポーネント。カテゴリ別チェックリストで工程を選び、選択のたびに
 * validateComposition で構成検証する（ブロッカーは赤 Alert）。
 *
 * 工程をチェックすると、その工程が必要とする随伴工程（AND 使用依存のうち
 * 既定順で**後ろ**に来るもの — 例: 加工 → 検査 → 検査承認）を自動で一括追加
 * する。逆に既定順で**前**に来る AND（例: C面 → 全長合わせ）は先行前提 —
 * 前提が選ばれるまでチェックボックスを無効化し「要: X」を出す。排他相手が
 * 選択中の工程も同様に無効化する。プリフィル由来で不足が残る場合のみ
 * 「必須工程を自動追加」ボタンをフォールバック表示する。
 *
 * セクション構成（§7 再編）:
 *   出し・受渡し（開始） — 全ての構成はここから始まる（1 つ以上必須）
 *   カテゴリ別（準備・加工・コーティング・検査・検査承認）
 *   出荷前検査（任意） — 追加すると常に末尾（出荷は工程ではなく出荷書 SH01 の責務）
 */

import {
  Alert,
  Badge,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconInfoCircle,
  IconWand,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { EditButton, SecondaryButton } from "@/components/ui/buttons";
import { FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { PROCESS_CATEGORY_LABEL } from "@/lib/enum-labels";
import type { RouteStepSnapshot } from "@/lib/product-routes-core";
import type { CatalogStep, UseDep } from "@/lib/workflow-core";
import {
  defaultOrder,
  isBlockingIssue,
  isShipStep,
  isStartStep,
  requiredCompanions,
  stepSelectBlockers,
  validateComposition,
} from "@/lib/workflow-core";
import { describeIssue } from "./work-orders/model";

export interface Option {
  value: string;
  label: string;
}

/** 工程ごとの実施場所 + 作業時間設定（実施場所は社内・外注可の工程のみ有効）。 */
export interface StepLocation {
  executionLocation: "INTERNAL" | "OUTSOURCE";
  plantId: string | null;
  supplierBpId: string | null;
  /** 作業時間 (h)。undefined = 未設定（カタログ既定値を使う）/ null = 明示的になし。 */
  workHours?: number | null;
}

const DEFAULT_LOCATION: StepLocation = {
  executionLocation: "INTERNAL",
  plantId: null,
  supplierBpId: null,
};

/** 工程の実効作業時間 — 明示設定（null 含む）が優先、未設定はカタログ既定値。 */
export function effectiveWorkHours(
  entry: StepLocation | undefined,
  cat: CatalogStep | undefined,
): number | null {
  if (entry && entry.workHours !== undefined) return entry.workHours;
  return cat?.defaultWorkHours ?? null;
}

/**
 * 現在の選択 + 実施場所 → 工程スナップショット列（保存ペイロードと同じ規則:
 * 社内・外注可の工程のみ場所を保持、それ以外は常に社内）。
 * ルートバージョンとの比較（変更検知）と保存ペイロードの両方で使う。
 */
export function toStepSnapshots(
  selected: readonly number[],
  locations: Record<number, StepLocation>,
  catalogSteps: readonly CatalogStep[],
): RouteStepSnapshot[] {
  const stepById = new Map(catalogSteps.map((s) => [s.id, s]));
  return defaultOrder(selected, catalogSteps).map((stepId, i) => {
    const cat = stepById.get(stepId);
    const editable = cat?.executionLocation === "INTERNAL_OR_OUTSOURCE";
    const loc = editable ? (locations[stepId] ?? DEFAULT_LOCATION) : null;
    const execution = loc?.executionLocation ?? "INTERNAL";
    return {
      processStepId: stepId,
      sortOrder: i,
      executionLocation: execution,
      plantId:
        execution === "INTERNAL" && loc?.plantId ? Number(loc.plantId) : null,
      supplierBpId:
        execution === "OUTSOURCE" ? (loc?.supplierBpId ?? null) : null,
      workHours: effectiveWorkHours(locations[stepId], cat),
    };
  });
}

/**
 * ProcessListView — 工程構成の**閲覧**表示（実行順・作業時間・実施場所）。
 *
 * 工程リスト（ルート）を選んでプリフィルした構成は、まずこの閲覧表示で出す —
 * 触るつもりのない構成をうっかり変えて新バージョンが量産されるのを防ぐため。
 * 変更したいときだけ「工程を編集」で ProcessListEditor に切り替える。
 */
export function ProcessListView({
  selected,
  locations,
  catalogSteps,
  plantOptions,
  supplierOptions,
  onEdit,
}: {
  selected: number[];
  locations: Record<number, StepLocation>;
  catalogSteps: CatalogStep[];
  plantOptions: Option[];
  supplierOptions: Option[];
  /** 「工程を編集」— エディタ表示へ切り替える。 */
  onEdit: () => void;
}) {
  const isMobile = useIsMobile();
  const stepById = useMemo(
    () => new Map(catalogSteps.map((s) => [s.id, s])),
    [catalogSteps],
  );
  const plantLabel = useMemo(
    () => new Map(plantOptions.map((o) => [o.value, o.label])),
    [plantOptions],
  );
  const supplierLabel = useMemo(
    () => new Map(supplierOptions.map((o) => [o.value, o.label])),
    [supplierOptions],
  );
  const orderedSelected = useMemo(
    () => defaultOrder(selected, catalogSteps),
    [selected, catalogSteps],
  );

  return (
    <FormSection
      description="選択した工程リストの構成です。工程・作業時間を変えるときは「工程を編集」を押してください（変更は保存時に新バージョンとして保存されます）。"
      title="工程・作業時間"
    >
      <Group justify="flex-end" mb="xs">
        <EditButton onClick={onEdit}>工程を編集</EditButton>
      </Group>
      {orderedSelected.length === 0 ? (
        <Text c="dimmed" size="sm">
          工程が未選択です
        </Text>
      ) : (
        <Stack gap="xs">
          {orderedSelected.map((stepId, i) => {
            const cat = stepById.get(stepId);
            if (!cat) return null;
            const loc = locations[stepId];
            const execution =
              cat.executionLocation === "INTERNAL_OR_OUTSOURCE"
                ? (loc?.executionLocation ?? "INTERNAL")
                : "INTERNAL";
            const hours = effectiveWorkHours(loc, cat);
            const place =
              execution === "OUTSOURCE"
                ? (supplierLabel.get(loc?.supplierBpId ?? "") ?? "外注先未定")
                : loc?.plantId
                  ? plantLabel.get(loc.plantId)
                  : null;
            return (
              <Paper key={stepId} p="sm" radius="sm" withBorder>
                <Group
                  align={isMobile ? "flex-start" : "center"}
                  justify="space-between"
                  wrap={isMobile ? "wrap" : "nowrap"}
                >
                  <Group gap="sm" wrap="nowrap">
                    <Text c="dimmed" className="tabular-nums" size="xs" w={20}>
                      {i + 1}
                    </Text>
                    <Text fw={600} size="sm">
                      {cat.nameJa}
                    </Text>
                    <Text c="dimmed" size="xs">
                      {PROCESS_CATEGORY_LABEL[cat.category] ?? cat.category}
                    </Text>
                  </Group>
                  <Group gap="sm" wrap="nowrap">
                    <Text className="tabular-nums" size="xs">
                      {hours != null ? `${hours} h` : "作業時間なし"}
                    </Text>
                    <Badge
                      color={execution === "OUTSOURCE" ? "orange" : "gray"}
                      size="xs"
                      variant="outline"
                    >
                      {execution === "OUTSOURCE" ? "外注" : "社内"}
                    </Badge>
                    {place && (
                      <Text c="dimmed" size="xs">
                        {place}
                      </Text>
                    )}
                  </Group>
                </Group>
              </Paper>
            );
          })}
        </Stack>
      )}
    </FormSection>
  );
}

export function ProcessListEditor({
  selected,
  onSelectedChange,
  locations,
  onLocationsChange,
  catalogSteps,
  useDeps,
  plantOptions,
  supplierOptions,
  error,
}: {
  selected: number[];
  onSelectedChange: (next: number[]) => void;
  locations: Record<number, StepLocation>;
  onLocationsChange: (next: Record<number, StepLocation>) => void;
  catalogSteps: CatalogStep[];
  useDeps: UseDep[];
  plantOptions: Option[];
  supplierOptions: Option[];
  /** フォーム側の selectedStepIds エラー表示。 */
  error?: string | null;
}) {
  const isMobile = useIsMobile();
  const stepById = useMemo(
    () => new Map(catalogSteps.map((s) => [s.id, s])),
    [catalogSteps],
  );
  /** 直近のチェック操作で自動追加された随伴工程（インライン通知用）。 */
  const [autoAdded, setAutoAdded] = useState<number[]>([]);

  const issues = useMemo(
    () => validateComposition(selected, useDeps, catalogSteps),
    [selected, useDeps, catalogSteps],
  );
  const blockers = issues.filter(isBlockingIssue);
  const warnings = issues.filter((i) => !isBlockingIssue(i));
  const missingCompanions = useMemo(
    () => requiredCompanions(selected, useDeps),
    [selected, useDeps],
  );

  const orderedSelected = useMemo(
    () => defaultOrder(selected, catalogSteps),
    [selected, catalogSteps],
  );

  const toggleStep = (stepId: number, checked: boolean) => {
    if (!checked) {
      setAutoAdded([]);
      onSelectedChange(selected.filter((id) => id !== stepId));
      return;
    }
    // 追加時は必須随伴工程（AND 使用依存の閉包）を自動で一括追加する。
    const next = [...selected, stepId];
    const companions = requiredCompanions(next, useDeps);
    setAutoAdded(companions);
    onSelectedChange([...next, ...companions]);
  };

  const addCompanions = () => {
    setAutoAdded(missingCompanions);
    onSelectedChange([...selected, ...missingCompanions]);
  };

  const locationOf = (stepId: number): StepLocation =>
    locations[stepId] ?? DEFAULT_LOCATION;

  const setLocation = (stepId: number, patch: Partial<StepLocation>) => {
    onLocationsChange({
      ...locations,
      [stepId]: { ...locationOf(stepId), ...patch },
    });
  };

  // セクション分割: 開始（出し・受渡し）/ 出荷（末尾固定）/ 残りはカテゴリ別
  const startSteps = catalogSteps.filter((s) => isStartStep(s));
  const shipSteps = catalogSteps.filter((s) => isShipStep(s));
  const middleSteps = catalogSteps.filter(
    (s) => !isStartStep(s) && !isShipStep(s),
  );
  const categories = Object.keys(PROCESS_CATEGORY_LABEL).filter((cat) =>
    middleSteps.some((s) => s.category === cat),
  );

  /** 1 工程ぶんのチェックボックス（無効化 + 「要: X」ヒント付き）。 */
  const renderStepCheckbox = (s: CatalogStep) => {
    const checked = selected.includes(s.id);
    const blockersOf = stepSelectBlockers(
      s.id,
      selected,
      useDeps,
      catalogSteps,
    );
    // 選択済みの工程は常に外せる（外した結果の不整合は Alert が知らせる）
    const disabled =
      !checked &&
      (blockersOf.missingPrereqs.length > 0 || blockersOf.conflicts.length > 0);
    const hint = !checked
      ? [
          blockersOf.missingPrereqs.length > 0
            ? `要: ${blockersOf.missingPrereqs
                .map((id) => stepById.get(id)?.nameJa ?? `工程#${id}`)
                .join("・")}`
            : null,
          blockersOf.conflicts.length > 0
            ? `${blockersOf.conflicts
                .map((id) => stepById.get(id)?.nameJa ?? `工程#${id}`)
                .join("・")}とは併用不可`
            : null,
        ]
          .filter(Boolean)
          .join(" / ")
      : "";
    return (
      <Checkbox
        checked={checked}
        disabled={disabled}
        key={s.id}
        label={
          <Group gap={6} wrap="wrap">
            <Text c={disabled ? "dimmed" : undefined} size="sm">
              {s.nameJa}
            </Text>
            {s.isInspection && (
              <Badge color="blue" size="xs" variant="light">
                検査
              </Badge>
            )}
            {s.isApprovalStep && (
              <Badge color="teal" size="xs" variant="light">
                承認
              </Badge>
            )}
            {s.isSyncCapable && (
              <Badge color="grape" size="xs" variant="light">
                同期
              </Badge>
            )}
            <Badge
              color={
                s.executionLocation === "INTERNAL_OR_OUTSOURCE"
                  ? "orange"
                  : "gray"
              }
              size="xs"
              variant="outline"
            >
              {s.executionLocation === "INTERNAL_OR_OUTSOURCE"
                ? "社内・外注"
                : "社内"}
            </Badge>
            {hint && (
              <Text c="dimmed" size="xs">
                {hint}
              </Text>
            )}
          </Group>
        }
        onChange={(e) => toggleStep(s.id, e.currentTarget.checked)}
        size="xs"
      />
    );
  };

  return (
    <>
      <FormSection
        description="工程カタログから使用する工程を選択します。必須の随伴工程（検査・承認など）は選択時に自動追加されます。"
        required
        title="工程選択"
      >
        {(blockers.length > 0 || warnings.length > 0) && (
          <Stack gap="xs" mb="md">
            {blockers.map((issue, i) => (
              <Alert
                color="red"
                icon={<IconAlertTriangle size={16} />}
                key={`b-${issue.stepId}-${issue.kind}-${i}`}
                p="xs"
                variant="light"
              >
                {describeIssue(issue, catalogSteps)}
              </Alert>
            ))}
            {warnings.map((issue, i) => (
              <Alert
                color="yellow"
                icon={<IconInfoCircle size={16} />}
                key={`w-${issue.stepId}-${issue.kind}-${i}`}
                p="xs"
                variant="light"
              >
                {describeIssue(issue, catalogSteps)}
              </Alert>
            ))}
            {missingCompanions.length > 0 && (
              <Group>
                <SecondaryButton
                  leftSection={<IconWand size={14} />}
                  onClick={addCompanions}
                >
                  必須工程を自動追加（{missingCompanions.length}件）
                </SecondaryButton>
              </Group>
            )}
          </Stack>
        )}
        {autoAdded.length > 0 && (
          <Alert
            color="blue"
            icon={<IconInfoCircle size={16} />}
            mb="md"
            p="xs"
            variant="light"
          >
            必須工程を自動追加しました:{" "}
            {autoAdded
              .map((id) => stepById.get(id)?.nameJa ?? `工程#${id}`)
              .join("・")}
          </Alert>
        )}
        {error && (
          <Text c="red" mb="xs" size="xs">
            {error}
          </Text>
        )}
        <Stack gap="md">
          {startSteps.length > 0 && (
            <Paper bg="var(--mantine-color-blue-light)" p="sm" radius="sm">
              <Stack gap="xs">
                <Group gap={6}>
                  <Text c="blue" fw={600} size="xs">
                    出し・受渡し（開始）
                  </Text>
                  <Text c="dimmed" size="xs">
                    — 全ての工程はここから始まります（1 つ以上必須）
                  </Text>
                </Group>
                <SimpleGrid cols={isMobile ? 1 : 2} spacing="xs">
                  {startSteps.map(renderStepCheckbox)}
                </SimpleGrid>
              </Stack>
            </Paper>
          )}
          {categories.length > 0 && (
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="md">
              {categories.map((cat) => (
                <Stack gap="xs" key={cat}>
                  <Text c="dimmed" fw={600} size="xs">
                    {PROCESS_CATEGORY_LABEL[cat]}
                  </Text>
                  {middleSteps
                    .filter((s) => s.category === cat)
                    .map(renderStepCheckbox)}
                </Stack>
              ))}
            </SimpleGrid>
          )}
          {shipSteps.length > 0 && (
            <Paper bg="var(--mantine-color-gray-light)" p="sm" radius="sm">
              <Stack gap="xs">
                <Group gap={6}>
                  <Text c="dimmed" fw={600} size="xs">
                    出荷前検査（任意）
                  </Text>
                  <Text c="dimmed" size="xs">
                    —
                    追加すると常に最後に実行されます。出荷そのものは出荷書（SH01）で管理します
                  </Text>
                </Group>
                <SimpleGrid cols={isMobile ? 1 : 2} spacing="xs">
                  {shipSteps.map(renderStepCheckbox)}
                </SimpleGrid>
              </Stack>
            </Paper>
          )}
        </Stack>
      </FormSection>

      <FormSection
        description="実行順はカタログ既定順です（実際の実行可否は工程間依存の解決で決まります）。作業時間 (h) は任意 — 未入力は工程マスタの既定値。社内・外注可の工程は実施場所を選択できます。"
        title="選択済み工程・実施場所"
      >
        {orderedSelected.length === 0 ? (
          <Text c="dimmed" size="sm">
            工程が未選択です
          </Text>
        ) : (
          <Stack gap="xs">
            {orderedSelected.map((stepId, i) => {
              const cat = stepById.get(stepId);
              if (!cat) return null;
              const editable =
                cat.executionLocation === "INTERNAL_OR_OUTSOURCE";
              const loc = locationOf(stepId);
              return (
                <Paper key={stepId} p="sm" radius="sm" withBorder>
                  <Group
                    align={isMobile ? "flex-start" : "center"}
                    justify="space-between"
                    wrap={isMobile ? "wrap" : "nowrap"}
                  >
                    <Group gap="sm" wrap="nowrap">
                      <Text
                        c="dimmed"
                        className="tabular-nums"
                        size="xs"
                        w={20}
                      >
                        {i + 1}
                      </Text>
                      <Text fw={600} size="sm">
                        {cat.nameJa}
                      </Text>
                      <Text c="dimmed" size="xs">
                        {PROCESS_CATEGORY_LABEL[cat.category] ?? cat.category}
                      </Text>
                    </Group>
                    <Group gap="xs" wrap={isMobile ? "wrap" : "nowrap"}>
                      <NumberInput
                        aria-label={`${cat.nameJa} の作業時間 (h)`}
                        decimalScale={2}
                        min={0.01}
                        onChange={(v) =>
                          setLocation(stepId, {
                            workHours: v === "" || v == null ? null : Number(v),
                          })
                        }
                        placeholder="作業時間"
                        size="xs"
                        suffix=" h"
                        value={effectiveWorkHours(locations[stepId], cat) ?? ""}
                        w={110}
                      />
                      {editable ? (
                        <>
                          <SegmentedControl
                            data={[
                              { value: "INTERNAL", label: "社内" },
                              { value: "OUTSOURCE", label: "外注" },
                            ]}
                            onChange={(v) =>
                              setLocation(stepId, {
                                executionLocation: v as
                                  | "INTERNAL"
                                  | "OUTSOURCE",
                              })
                            }
                            size="xs"
                            value={loc.executionLocation}
                          />
                          {loc.executionLocation === "INTERNAL" ? (
                            <Select
                              clearable
                              data={plantOptions}
                              onChange={(v) =>
                                setLocation(stepId, { plantId: v })
                              }
                              placeholder="拠点"
                              searchable
                              size="xs"
                              value={loc.plantId}
                              w={200}
                            />
                          ) : (
                            <Select
                              clearable
                              data={supplierOptions}
                              onChange={(v) =>
                                setLocation(stepId, { supplierBpId: v })
                              }
                              placeholder="仕入先（外注先）"
                              searchable
                              size="xs"
                              value={loc.supplierBpId}
                              w={200}
                            />
                          )}
                        </>
                      ) : (
                        <Badge color="gray" size="xs" variant="outline">
                          社内
                        </Badge>
                      )}
                    </Group>
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        )}
      </FormSection>
    </>
  );
}
