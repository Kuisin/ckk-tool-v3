"use client";

/**
 * TrialPricingEngineForm — 試算計算（SY02）の設定フォーム.
 *
 * 見積単価は「計算基準（criteria）」の合計で決まる（各基準は入力変数を使う JS 式）。
 * 管理者はカスタム入力項目を追加でき、式の変数として使える。従来の固定ロジックは
 * DEFAULT_CRITERIA として再現済み。material policy / 係数 / カスタム計算 JS も同居。
 * Flat な FormSection 群でレンダリング（外側 Paper を持たない = 二重カード解消）。
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Code,
  Divider,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconInfoCircle,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState, useTransition } from "react";
import { updateTrialPricingSettings } from "@/app/(dashboard)/settings/actions";
import {
  GhostButton,
  SaveButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import type { TrialInput } from "@/lib/trial-pricing";
import {
  type Criterion,
  type CriterionRole,
  type CustomInputDef,
  type CustomInputType,
  DEFAULT_CRITERIA,
  RESERVED_KEYS,
} from "@/lib/trial-pricing-criteria";
import { runCriteriaEngine } from "@/lib/trial-pricing-engine";
import { CURRENT_LOGIC_SCRIPT } from "@/lib/trial-pricing-script";
import {
  DEFAULT_TRIAL_PRICING_SETTINGS,
  MATERIAL_PRICE_BASIS_OPTIONS,
  type TrialPricingSettings,
} from "@/lib/trial-pricing-settings";

const ROLE_OPTIONS: { value: CriterionRole; label: string }[] = [
  { value: "component", label: "加算（合計に足す）" },
  { value: "intermediate", label: "中間（r.<id> で参照）" },
  { value: "final", label: "見積単価（最終）" },
];

const INPUT_TYPE_OPTIONS: { value: CustomInputType; label: string }[] = [
  { value: "number", label: "数値" },
  { value: "boolean", label: "ON/OFF" },
  { value: "text", label: "文字列" },
  { value: "select", label: "選択" },
];

/** テスト実行用サンプル（丸棒・コート・段加工あり・3ロット）。 */
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

interface EngineTestOutput {
  breakdown: [string, number][];
  shapeOutPrice: number;
  lots: { quantity: number; minimumPrice: number; estimateUnitPrice: number }[];
  warnings: string[];
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `c_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

export function TrialPricingEngineForm({
  initial,
}: {
  initial: TrialPricingSettings;
}) {
  const [settings, setSettings] = useState<TrialPricingSettings>(initial);
  const [isPending, startTransition] = useTransition();
  const [test, setTest] = useState<EngineTestOutput | null>(null);

  const patch = (p: Partial<TrialPricingSettings>) =>
    setSettings((s) => ({ ...s, ...p }));

  // Custom-input key errors (reserved / duplicate) shown inline.
  const keyErrors = useMemo(() => {
    const errors: Record<number, string> = {};
    const seen = new Map<string, number>();
    settings.customInputs.forEach((d, i) => {
      if (d.key && RESERVED_KEYS.has(d.key)) errors[i] = "予約語です";
      const prev = seen.get(d.key);
      if (d.key && prev !== undefined) errors[i] = "キーが重複しています";
      if (d.key) seen.set(d.key, i);
    });
    return errors;
  }, [settings.customInputs]);

  const setCriteria = (criteria: Criterion[]) =>
    patch({ criteria: criteria.map((c, i) => ({ ...c, order: i * 10 })) });
  const setCustomInputs = (customInputs: CustomInputDef[]) =>
    patch({ customInputs: customInputs.map((d, i) => ({ ...d, order: i })) });

  const save = () => {
    startTransition(async () => {
      const res = await updateTrialPricingSettings(settings);
      notifications.show(
        res.ok
          ? {
              title: "保存しました",
              message: "試算の計算ロジックを更新しました",
              color: "green",
            }
          : { title: "エラー", message: res.error, color: "red" },
      );
    });
  };

  const runTest = () => {
    const r = runCriteriaEngine(SAMPLE_INPUT, {
      correctionFactor: settings.correctionFactor,
      ldChargePer10min: settings.ldChargePer10min,
      criteria: settings.criteria,
      customInputs: settings.customInputs,
    });
    setTest({
      breakdown: Object.entries(r.breakdown),
      shapeOutPrice: r.shapeOutPrice,
      lots: r.lots.map((l) => ({
        quantity: l.quantity,
        minimumPrice: l.minimumPrice,
        estimateUnitPrice: l.estimateUnitPrice,
      })),
      warnings: r.warnings,
    });
  };

  const setNum = (key: keyof TrialPricingSettings, v: number | string) =>
    patch({
      [key]:
        typeof v === "number"
          ? v
          : Number(v) || (DEFAULT_TRIAL_PRICING_SETTINGS[key] as number),
    } as Partial<TrialPricingSettings>);

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <SaveButton loading={isPending} onClick={save}>
            保存
          </SaveButton>
        }
        breadcrumbs={["システム", "試算計算"]}
        title="試算計算 設定"
      />

      {/* ── 材料参照価格ポリシー ────────────────────────────────────────── */}
      <FormSection
        description="試算の材料原価に使う、仕入実績（購買履歴）からの参照価格の決め方です。"
        title="材料参照価格ポリシー"
      >
        <Stack gap="sm" maw={480}>
          <Select
            data={MATERIAL_PRICE_BASIS_OPTIONS}
            description="期間内の仕入単価から参照価格を決める方法"
            label="算出方法"
            onChange={(v) =>
              patch({
                materialPriceBasis:
                  (v as TrialPricingSettings["materialPriceBasis"]) ??
                  DEFAULT_TRIAL_PRICING_SETTINGS.materialPriceBasis,
              })
            }
            value={settings.materialPriceBasis}
          />
          <NumberInput
            description="参照する仕入実績をさかのぼる月数"
            label="参照期間（ヶ月）"
            max={36}
            min={1}
            onChange={(v) => setNum("materialPriceLookbackMonths", v)}
            value={settings.materialPriceLookbackMonths}
          />
        </Stack>
      </FormSection>

      {/* ── 既定値・係数 ────────────────────────────────────────────────── */}
      <FormSection
        description="見積入力に含めない必須値。式の変数（machiningRatePer10min 等）や係数として使われます。"
        title="試算 既定値・係数（グローバル）"
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} maw={640} spacing="sm">
          <NumberInput
            description="加工単価の既定値"
            label="加工単価（¥/10分）"
            min={0}
            onChange={(v) => setNum("machiningRatePer10min", v)}
            prefix="¥"
            thousandSeparator=","
            value={settings.machiningRatePer10min}
          />
          <NumberInput
            description="形状出しの予備本数の既定値"
            label="予備形状本数"
            min={1}
            onChange={(v) => setNum("spareShapeCount", v)}
            value={settings.spareShapeCount}
          />
          <NumberInput
            decimalScale={2}
            description="式変数 correctionFactor"
            label="補正値"
            min={0}
            onChange={(v) => setNum("correctionFactor", v)}
            step={0.01}
            value={settings.correctionFactor}
          />
          <NumberInput
            description="式変数 ldChargePer10min"
            label="LDチャージ（¥/10分）"
            min={0}
            onChange={(v) => setNum("ldChargePer10min", v)}
            prefix="¥"
            thousandSeparator=","
            value={settings.ldChargePer10min}
          />
        </SimpleGrid>
      </FormSection>

      {/* ── カスタム入力項目 ────────────────────────────────────────────── */}
      <FormSection
        description="試算フォームに表示する追加入力。キーが計算基準の式で変数として使えます。"
        title="カスタム入力項目"
      >
        <Stack gap="sm">
          {settings.customInputs.length === 0 && (
            <Text c="dimmed" size="sm">
              追加項目はありません。
            </Text>
          )}
          {settings.customInputs.map((d, i) => (
            <Paper key={`ci-${d.order}-${i}`} p="sm" radius="sm" withBorder>
              <Group align="flex-start" gap="sm" wrap="wrap">
                <TextInput
                  error={keyErrors[i]}
                  label="キー（変数名）"
                  onChange={(e) => {
                    const next = settings.customInputs.slice();
                    next[i] = { ...d, key: e.currentTarget.value };
                    setCustomInputs(next);
                  }}
                  placeholder="extraCost"
                  value={d.key}
                  w={160}
                />
                <TextInput
                  label="ラベル"
                  onChange={(e) => {
                    const next = settings.customInputs.slice();
                    next[i] = { ...d, label: e.currentTarget.value };
                    setCustomInputs(next);
                  }}
                  value={d.label}
                  w={180}
                />
                <Select
                  data={INPUT_TYPE_OPTIONS}
                  label="型"
                  onChange={(v) => {
                    const type = (v as CustomInputType) ?? "number";
                    const next = settings.customInputs.slice();
                    const def =
                      type === "number" ? 0 : type === "boolean" ? false : "";
                    next[i] = { ...d, type, default: def };
                    setCustomInputs(next);
                  }}
                  value={d.type}
                  w={130}
                />
                {d.type === "number" ? (
                  <NumberInput
                    label="既定値"
                    onChange={(v) => {
                      const next = settings.customInputs.slice();
                      next[i] = {
                        ...d,
                        default: typeof v === "number" ? v : 0,
                      };
                      setCustomInputs(next);
                    }}
                    value={typeof d.default === "number" ? d.default : 0}
                    w={120}
                  />
                ) : d.type === "boolean" ? (
                  <Switch
                    checked={d.default === true}
                    label="既定 ON"
                    mt={26}
                    onChange={(e) => {
                      const next = settings.customInputs.slice();
                      next[i] = { ...d, default: e.currentTarget.checked };
                      setCustomInputs(next);
                    }}
                  />
                ) : (
                  <TextInput
                    label={
                      d.type === "select" ? "既定値/選択肢(,区切り)" : "既定値"
                    }
                    onChange={(e) => {
                      const next = settings.customInputs.slice();
                      const val = e.currentTarget.value;
                      next[i] =
                        d.type === "select"
                          ? {
                              ...d,
                              default: val.split(",")[0]?.trim() ?? "",
                              options: val
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean)
                                .map((s) => ({ value: s, label: s })),
                            }
                          : { ...d, default: val };
                      setCustomInputs(next);
                    }}
                    value={
                      d.type === "select"
                        ? (d.options ?? []).map((o) => o.value).join(",")
                        : String(d.default ?? "")
                    }
                    w={200}
                  />
                )}
                <ActionIcon
                  aria-label="削除"
                  color="red"
                  mt={26}
                  onClick={() =>
                    setCustomInputs(
                      settings.customInputs.filter((_, k) => k !== i),
                    )
                  }
                  variant="subtle"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Paper>
          ))}
          <GhostButton
            leftSection={<IconPlus size={16} />}
            onClick={() =>
              setCustomInputs([
                ...settings.customInputs,
                {
                  key: "",
                  label: "",
                  type: "number",
                  default: 0,
                  order: settings.customInputs.length,
                },
              ])
            }
          >
            入力項目を追加
          </GhostButton>
        </Stack>
      </FormSection>

      {/* ── 計算基準（自由設定）─────────────────────────────────────────── */}
      <FormSection
        description="見積単価 = 加算基準の合計 → final 基準で確定。式では入力項目・カスタム入力・quantity・subtotal・r.<id>・round()/lookup 系ヘルパーが使えます。"
        title="計算基準（自由設定）"
      >
        <Stack gap="sm">
          <Alert
            color="blue"
            icon={<IconInfoCircle size={16} />}
            variant="light"
          >
            <Text size="xs">
              役割: <Code>component</Code>=合計に加算 /{" "}
              <Code>intermediate</Code>
              =合計に含めず <Code>r.&lt;id&gt;</Code> で参照 /{" "}
              <Code>final</Code>
              =合計(subtotal)を見積単価に変換（1つ）。ID
              <Code>
                material/step/neck/machining/coating/lap/ld/inspection
              </Code>
              が原価内訳になります。
            </Text>
          </Alert>

          {settings.criteria.map((c, i) => (
            <Paper key={c.id} p="sm" radius="sm" withBorder>
              <Stack gap="xs">
                <Group gap="sm" wrap="wrap">
                  <TextInput
                    label="ID"
                    onChange={(e) => {
                      const next = settings.criteria.slice();
                      next[i] = { ...c, id: e.currentTarget.value };
                      setCriteria(next);
                    }}
                    value={c.id}
                    w={150}
                  />
                  <TextInput
                    label="基準名"
                    onChange={(e) => {
                      const next = settings.criteria.slice();
                      next[i] = { ...c, name: e.currentTarget.value };
                      setCriteria(next);
                    }}
                    value={c.name}
                    w={170}
                  />
                  <Select
                    data={ROLE_OPTIONS}
                    label="役割"
                    onChange={(v) => {
                      const next = settings.criteria.slice();
                      next[i] = {
                        ...c,
                        role: (v as CriterionRole) ?? "component",
                      };
                      setCriteria(next);
                    }}
                    value={c.role}
                    w={200}
                  />
                  <Switch
                    checked={c.enabled}
                    label="有効"
                    mt={26}
                    onChange={(e) => {
                      const next = settings.criteria.slice();
                      next[i] = { ...c, enabled: e.currentTarget.checked };
                      setCriteria(next);
                    }}
                  />
                  <Group gap={4} ml="auto" mt={22}>
                    <ActionIcon
                      aria-label="上へ"
                      disabled={i === 0}
                      onClick={() =>
                        setCriteria(move(settings.criteria, i, -1))
                      }
                      variant="subtle"
                    >
                      <IconArrowUp size={16} />
                    </ActionIcon>
                    <ActionIcon
                      aria-label="下へ"
                      disabled={i === settings.criteria.length - 1}
                      onClick={() => setCriteria(move(settings.criteria, i, 1))}
                      variant="subtle"
                    >
                      <IconArrowDown size={16} />
                    </ActionIcon>
                    <ActionIcon
                      aria-label="削除"
                      color="red"
                      onClick={() =>
                        setCriteria(settings.criteria.filter((_, k) => k !== i))
                      }
                      variant="subtle"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Group>
                <Textarea
                  autosize
                  label="式（数値を返す JS 式）"
                  maxRows={12}
                  minRows={2}
                  onChange={(e) => {
                    const next = settings.criteria.slice();
                    next[i] = { ...c, expression: e.currentTarget.value };
                    setCriteria(next);
                  }}
                  spellCheck={false}
                  styles={{
                    input: {
                      fontFamily: "var(--mantine-font-family-monospace)",
                    },
                  }}
                  value={c.expression}
                />
              </Stack>
            </Paper>
          ))}

          <Group gap="sm">
            <GhostButton
              leftSection={<IconPlus size={16} />}
              onClick={() =>
                setCriteria([
                  ...settings.criteria,
                  {
                    id: newId().slice(0, 8),
                    name: "新しい基準",
                    role: "component",
                    expression: "0",
                    order: settings.criteria.length * 10,
                    enabled: true,
                  },
                ])
              }
            >
              基準を追加
            </GhostButton>
            <GhostButton
              onClick={() =>
                setCriteria(DEFAULT_CRITERIA.map((c) => ({ ...c })))
              }
            >
              既定に戻す
            </GhostButton>
            <SecondaryButton onClick={runTest}>テスト実行</SecondaryButton>
          </Group>

          {test && (
            <Paper
              bg="var(--mantine-color-default)"
              p="sm"
              radius="sm"
              withBorder
            >
              <Stack gap="xs">
                <Text fw={600} size="sm">
                  テスト結果（サンプル: 丸棒・コート・段加工・3ロット）
                </Text>
                {test.warnings.length > 0 && (
                  <Stack gap={2}>
                    {test.warnings.map((w) => (
                      <Text c="orange" key={w} size="xs">
                        ⚠ {w}
                      </Text>
                    ))}
                  </Stack>
                )}
                <Group gap="xs" wrap="wrap">
                  {test.breakdown.map(([k, v]) => (
                    <Badge color="gray" key={k} variant="light">
                      {k}: {v.toLocaleString()}
                    </Badge>
                  ))}
                  <Badge color="blue" variant="light">
                    形状出し: {test.shapeOutPrice.toLocaleString()}
                  </Badge>
                </Group>
                <Divider />
                <Table withColumnBorders={false}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ロット</Table.Th>
                      <Table.Th ta="right">最低単価</Table.Th>
                      <Table.Th ta="right">見積単価</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {test.lots.map((l) => (
                      <Table.Tr key={l.quantity}>
                        <Table.Td>{l.quantity} 本</Table.Td>
                        <Table.Td className="tabular-nums" ta="right">
                          ¥{Math.round(l.minimumPrice).toLocaleString()}
                        </Table.Td>
                        <Table.Td className="tabular-nums" fw={600} ta="right">
                          ¥{l.estimateUnitPrice.toLocaleString()}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
            </Paper>
          )}
        </Stack>
      </FormSection>

      {/* ── カスタム計算（JS 後処理）───────────────────────────────────── */}
      <FormSection
        description="計算基準の結果に、さらに JavaScript の後処理を加えます（見積単価の上書き・警告）。"
        title="カスタム計算（JavaScript 後処理）"
      >
        <Stack gap="sm">
          <Switch
            checked={settings.customScriptEnabled}
            description="試算の全画面に適用されます。"
            label="カスタム計算を有効化"
            onChange={(e) =>
              patch({ customScriptEnabled: e.currentTarget.checked })
            }
          />
          <Alert
            color="orange"
            icon={<IconAlertTriangle size={16} />}
            variant="light"
          >
            <Text size="xs">
              返り値の契約:{" "}
              <Code>{"{ unitPrices?: number[], warnings?: string[] }"}</Code>（
              <Code>ctx.input</Code> / <Code>ctx.result</Code> /{" "}
              <Code>ctx.lots</Code> / <Code>ctx.settings</Code> /{" "}
              <Code>ctx.round(n, unit)</Code> が利用可）。system
              権限者のみ編集可。
            </Text>
          </Alert>
          <Textarea
            autosize
            disabled={!settings.customScriptEnabled}
            label="スクリプト"
            maxRows={20}
            minRows={6}
            onChange={(e) => patch({ customScript: e.currentTarget.value })}
            spellCheck={false}
            styles={{
              input: { fontFamily: "var(--mantine-font-family-monospace)" },
            }}
            value={settings.customScript}
          />
          <Group gap="sm">
            <GhostButton
              onClick={() => patch({ customScript: CURRENT_LOGIC_SCRIPT })}
            >
              現在のロジックを挿入
            </GhostButton>
          </Group>
        </Stack>
      </FormSection>
    </Stack>
  );
}
