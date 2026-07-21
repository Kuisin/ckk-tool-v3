"use client";

/**
 * CriterionEditForm — 計算基準の個別編集ページ（SY02 のサブページ）.
 *
 * 1 つの基準（name / role / 適用工具種 / 式）を編集し、テスト実行で結果を確認。
 * 保存は基準リスト全体を updateCriteria で永続化する（この基準を upsert）。
 */

import {
  Alert,
  Chip,
  Code,
  Divider,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { updateCriteria } from "@/app/(dashboard)/settings/actions";
import {
  CancelButton,
  DeleteButton,
  GhostButton,
  SaveButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { openConfirm } from "@/components/ui/modals";
import { FormSection } from "@/components/ui/shells";
import { localized } from "@/lib/format";
import {
  TOOL_TYPE_OPTIONS,
  type ToolType,
  type TrialInput,
} from "@/lib/trial-pricing";
import {
  type Criterion,
  type CriterionRole,
  type CustomInputDef,
  type LookupTable,
  TRIAL_TOOL_TYPES,
} from "@/lib/trial-pricing-criteria";
import { runCriteriaEngine } from "@/lib/trial-pricing-engine";
import {
  CodeExpressionEditor,
  type VariableGroup,
} from "./CodeExpressionEditor";

const INPUT_VARS = [
  "toolType",
  "maxDiameter",
  "totalLength",
  "materialBarPrice",
  "isBlackSkin",
  "cylinderMaterialPrice",
  "cylinderType",
  "stepLength",
  "stepType",
  "neckLength",
  "neckType",
  "coating",
  "lapType",
  "inspection",
  "ldEnabled",
  "ldOuterDiameter",
  "ldBladeLength",
  "machiningMinutes",
];
const STATE_VARS = ["quantity", "subtotal", "discountRate", "autoRate"];
// correctionFactor/ldChargePer10min/machiningRatePer10min/spareShapeCount は
// scope:"global" のカスタム値へ移行し「カスタム入力」グループに表示される。
const COEFF_VARS = ["materialBasisLength", "coatingFactor"];
const HELPER_TOKENS = [
  "round(",
  "lookup(",
  "lookupMatrix(",
  "coatingRawCost(",
  "ldMinutes(",
  "matchDesc(",
  "lotDiscountRate(",
  "stepTypeRate(",
  "neckTypeRate(",
  "cylinderTypeRate(",
  "lapAmount(",
  "inspectionAmount(",
];

const BASE = "/settings/trial-pricing-engine";

const ROLE_OPTIONS: { value: CriterionRole; label: string }[] = [
  { value: "component", label: "加算（合計に足す）" },
  { value: "intermediate", label: "中間（r.<id> で参照）" },
  { value: "final", label: "見積単価（最終）" },
];

const SAMPLE_INPUT: TrialInput = {
  toolType: "ROUND_BAR",
  maxDiameter: 12,
  totalLength: 200,
  materialBarPrice: 1500,
  isBlackSkin: true,
  stepLength: 20,
  stepType: "FINISH",
  neckLength: 0,
  neckType: "NONE",
  coating: "CX200",
  lapType: "OSG",
  inspection: "TWO",
  ldEnabled: false,
  ldLocation: "TIP",
  ldOuterDiameter: 0,
  ldBladeLength: 0,
  machiningMinutes: 8,
  machiningRatePer10min: 2000,
  spareShapeCount: 3,
  lotQuantities: [10, 50, 100],
};

interface TestOutput {
  value: number | null;
  lots: { quantity: number; estimateUnitPrice: number }[];
  warnings: string[];
}

export function CriterionEditForm({
  allCriteria,
  criterionId,
  customInputs,
  lookupTables = [],
}: {
  allCriteria: Criterion[];
  /** 既存基準の id。null = 新規。 */
  criterionId: string | null;
  customInputs: CustomInputDef[];
  lookupTables?: LookupTable[];
}) {
  const existing = criterionId
    ? allCriteria.find((c) => c.id === criterionId)
    : undefined;
  const isNew = !existing;

  const [criterion, setCriterion] = useState<Criterion>(
    existing
      ? // 旧データ（toolTypes 未設定）は全選択として表示（保存で明示化）。
        { ...existing, toolTypes: existing.toolTypes ?? [...TRIAL_TOOL_TYPES] }
      : {
          id: "",
          name: "新しい基準",
          role: "component",
          expression: "0",
          order: allCriteria.length * 10,
          enabled: true,
          // 既定は全工具種を選択済み（未選択 = 適用なし の仕様）。
          toolTypes: [...TRIAL_TOOL_TYPES],
        },
  );
  const [testToolType, setTestToolType] = useState<ToolType>("ROUND_BAR");
  const [test, setTest] = useState<TestOutput | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const set = (p: Partial<Criterion>) => setCriterion((c) => ({ ...c, ...p }));

  // 式エディタの「利用可能な変数」パレット。
  const variableGroups: VariableGroup[] = useMemo(() => {
    const groups: VariableGroup[] = [
      { group: "入力", items: INPUT_VARS.map((t) => ({ token: t })) },
      {
        group: "状態",
        items: [
          ...STATE_VARS.map((t) => ({ token: t })),
          { token: "r.", label: "r.<id>" },
        ],
      },
      { group: "係数", items: COEFF_VARS.map((t) => ({ token: t })) },
      { group: "関数", items: HELPER_TOKENS.map((t) => ({ token: t })) },
    ];
    if (customInputs.length > 0) {
      groups.push({
        group: "カスタム入力",
        items: customInputs
          .filter((d) => d.key)
          .map((d) => ({ token: d.key, label: d.label || d.key })),
      });
    }
    if (lookupTables.length > 0) {
      groups.push({
        group: "ルックアップ",
        items: lookupTables
          .filter((t) => t.id)
          .map((t) => ({
            token: `lookup("${t.id}", )`,
            label: `${localized(t.name)}（${t.id}）`,
          })),
      });
    }
    return groups;
  }, [customInputs, lookupTables]);

  // この基準を反映した基準リスト全体を組み立てる（保存 / テスト共用）。
  const buildList = (): Criterion[] => {
    if (existing) {
      return allCriteria.map((c) => (c.id === existing.id ? criterion : c));
    }
    return [...allCriteria, criterion];
  };

  const save = () => {
    if (!criterion.id.trim()) {
      notifications.show({
        title: "エラー",
        message: "ID を入力してください",
        color: "red",
      });
      return;
    }
    if (isNew && allCriteria.some((c) => c.id === criterion.id)) {
      notifications.show({
        title: "エラー",
        message: `ID「${criterion.id}」は既に存在します`,
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const res = await updateCriteria(buildList());
      if (res.ok) {
        notifications.show({
          title: "保存しました",
          message: "計算基準を更新しました",
          color: "green",
        });
        router.push(`${BASE}/criteria`);
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: res.error,
          color: "red",
        });
      }
    });
  };

  const remove = () =>
    openConfirm({
      title: "計算基準の削除",
      message: `「${criterion.name}」を削除します。この操作は取り消せません。`,
      confirmLabel: "削除",
      onConfirm: () =>
        startTransition(async () => {
          const res = await updateCriteria(
            allCriteria.filter((c) => c.id !== criterion.id),
          );
          if (res.ok) {
            notifications.show({
              title: "削除しました",
              message: `「${criterion.name}」を削除しました`,
              color: "green",
            });
            router.push(`${BASE}/criteria`);
            router.refresh();
          } else {
            notifications.show({
              title: "エラー",
              message: res.error,
              color: "red",
            });
          }
        }),
    });

  const runTest = () => {
    const sample: TrialInput =
      testToolType === "CYLINDER"
        ? {
            ...SAMPLE_INPUT,
            toolType: "CYLINDER",
            materialBarPrice: 0,
            cylinderMaterialPrice: 13000,
            cylinderType: "NORMAL",
          }
        : { ...SAMPLE_INPUT, toolType: testToolType };
    const r = runCriteriaEngine(sample, {
      // 補正値・LDチャージ等のグローバル係数は customInputs(scope:"global") に含まれる。
      criteria: buildList(),
      customInputs,
    });
    const breakdownVal = (r.breakdown as unknown as Record<string, number>)[
      criterion.id
    ];
    setTest({
      value: typeof breakdownVal === "number" ? breakdownVal : null,
      lots: r.lots.map((l) => ({
        quantity: l.quantity,
        estimateUnitPrice: l.estimateUnitPrice,
      })),
      warnings: r.warnings,
    });
  };

  return (
    <Stack gap="md">
      <FormSection title="基準">
        <Stack gap="sm">
          <Group gap="sm" wrap="wrap">
            <TextInput
              description="式で r.<id> として参照されます"
              disabled={!isNew}
              label="ID"
              onChange={(e) => set({ id: e.currentTarget.value })}
              value={criterion.id}
              w={180}
            />
            <TextInput
              label="基準名"
              onChange={(e) => set({ name: e.currentTarget.value })}
              value={criterion.name}
              w={220}
            />
            <Select
              data={ROLE_OPTIONS}
              label="役割"
              onChange={(v) =>
                set({ role: (v as CriterionRole) ?? "component" })
              }
              value={criterion.role}
              w={220}
            />
            <Switch
              checked={criterion.enabled}
              label="有効"
              mt={26}
              onChange={(e) => set({ enabled: e.currentTarget.checked })}
            />
          </Group>

          <Group align="center" gap="xs">
            <Text c="dimmed" size="xs">
              適用工具種
            </Text>
            <Chip.Group
              multiple
              onChange={(v) => set({ toolTypes: v as ToolType[] })}
              value={criterion.toolTypes ?? []}
            >
              <Group gap={4}>
                {TOOL_TYPE_OPTIONS.map((o) => (
                  <Chip key={o.value} size="xs" value={o.value}>
                    {o.label}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
            <GhostButton
              onClick={() => set({ toolTypes: [...TRIAL_TOOL_TYPES] })}
              size="compact-xs"
            >
              全選択
            </GhostButton>
            {!criterion.toolTypes?.length && (
              <Text c="red" size="xs">
                ⚠ 未選択 — この基準はどの工具種にも適用されません
              </Text>
            )}
          </Group>
        </Stack>
      </FormSection>

      <FormSection
        description="数値を返す JS 式。入力項目・カスタム入力・quantity・subtotal・r.<id>・round()/lookup 系ヘルパーが使えます。"
        title="式"
      >
        <Stack gap="sm">
          <CodeExpressionEditor
            onChange={(v) => set({ expression: v })}
            value={criterion.expression}
            variables={variableGroups}
          />
          <Group gap="xs">
            <Text c="dimmed" size="xs">
              テスト工具種
            </Text>
            <SegmentedControl
              data={TOOL_TYPE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              onChange={(v) => setTestToolType(v as ToolType)}
              size="xs"
              value={testToolType}
            />
            <SecondaryButton onClick={runTest}>テスト実行</SecondaryButton>
          </Group>

          {test && (
            <Alert
              color={test.warnings.length ? "orange" : "blue"}
              icon={<IconInfoCircle size={16} />}
              variant="light"
            >
              <Stack gap="xs">
                <Text size="sm">
                  この基準の値:{" "}
                  <Code>
                    {test.value === null ? "（中間/対象外）" : test.value}
                  </Code>
                </Text>
                {test.warnings.map((w) => (
                  <Text c="orange" key={w} size="xs">
                    ⚠ {w}
                  </Text>
                ))}
                <Divider />
                <Table withColumnBorders={false}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ロット</Table.Th>
                      <Table.Th ta="right">見積単価</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {test.lots.map((l) => (
                      <Table.Tr key={l.quantity}>
                        <Table.Td>{l.quantity} 本</Table.Td>
                        <Table.Td className="tabular-nums" ta="right">
                          ¥{l.estimateUnitPrice.toLocaleString()}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
            </Alert>
          )}

          <Text c="dimmed" size="xs">
            数値を返す JS 式。ルックアップ表は <Code>lookup("ID", キー)</Code>{" "}
            で参照します。
          </Text>
        </Stack>
      </FormSection>

      <Group justify="space-between" mt="xs">
        {isNew ? <span /> : <DeleteButton onClick={remove} />}
        <Group gap="sm">
          <CancelButton onClick={() => router.push(`${BASE}/criteria`)} />
          <SaveButton loading={isPending} onClick={save}>
            保存
          </SaveButton>
        </Group>
      </Group>
    </Stack>
  );
}
