"use client";

/**
 * TrialEstimateForm — 見積試算 calculator (SA51 新規).
 *
 * Two tabs: 「試算」(inputs + live results) and 「素材価格推移」(purchase-price
 * line graph; clicking a point overrides the reference price). The default
 * reference price follows the system pricing policy (直近Nヶ月の最高単価 etc.,
 * editable in 設定). Material price comes from purchase history, not a static
 * master price.
 */

import {
  Alert,
  Badge,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCalculator,
  IconChartLine,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createTrialEstimate,
  fetchMaterialPricing,
  type MaterialPricing,
} from "@/app/(dashboard)/sales/trial-estimates/actions";
import {
  EditButton,
  SaveButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { MoneyText } from "@/components/ui/MoneyText";
import { openConfirm } from "@/components/ui/modals";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import { formatDate } from "@/lib/format";
import type { Option } from "@/lib/mock";
import {
  type CostBreakdown,
  calcTrialPricing,
  type LotResult,
  TOOL_TYPE_OPTIONS,
  type ToolType,
  type TrialInput,
} from "@/lib/trial-pricing";
import {
  COATING_OPTIONS,
  CYLINDER_TYPE_OPTIONS,
  INSPECTION_OPTIONS,
  LAP_OPTIONS,
  LD_LOCATION_OPTIONS,
  NECK_TYPE_OPTIONS,
  STEP_TYPE_OPTIONS,
} from "@/lib/trial-pricing-data";
import {
  MATERIAL_PRICE_BASIS_OPTIONS,
  type TrialPricingSettings,
  toTrialPricingOptions,
} from "@/lib/trial-pricing-settings";
import { MaterialPriceChart } from "./MaterialPriceChart";
import type { TrialEstimateRecord } from "./types";

const BASE_PATH = "/sales/trial-estimates";
const toData = (o: readonly { value: string; label: string }[]) =>
  o.map((x) => ({ value: x.value, label: x.label }));
const num = (v: number | string) =>
  typeof v === "number" ? v : Number(v) || 0;

export function TrialEstimateForm({
  customerOptions,
  materialOptions,
  settings,
  initialPricing,
  /** 複製元（?from= で開いたとき）— 全入力を引き継いだ新規 DRAFT を作る。 */
  source,
}: {
  customerOptions: Option[];
  materialOptions: Option[];
  /** システム設定（app.system_settings, サーバー取得）. */
  settings: TrialPricingSettings;
  /** 初期素材の仕入実績＋ポリシー参照価格（サーバー取得）. */
  initialPricing: MaterialPricing;
  source?: TrialEstimateRecord | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isPricingLoading, startPricingTransition] = useTransition();

  const defaultMaterial = materialOptions[0]?.value ?? "";
  const src = source?.input;

  // ── inputs ──────────────────────────────────────────────────────────────
  const [toolType, setToolType] = useState<ToolType>(
    src?.toolType ?? "ROUND_BAR",
  );
  const [name, setName] = useState(source ? `${source.name}（再試算）` : "");
  const [customerId, setCustomerId] = useState<string | null>(
    source?.customerId ?? null,
  );
  const [materialId, setMaterialId] = useState<string>(
    source?.materialId ?? defaultMaterial,
  );
  const [isBlackSkin, setIsBlackSkin] = useState(src?.isBlackSkin ?? false);
  const [maxDiameter, setMaxDiameter] = useState<number | string>(
    src?.maxDiameter ?? 3,
  );
  const [totalLength, setTotalLength] = useState<number | string>(
    src?.totalLength ?? 38,
  );
  const [cylinderMaterialPrice, setCylinderMaterialPrice] = useState<
    number | string
  >(src?.cylinderMaterialPrice ?? 13086);
  const [cylinderType, setCylinderType] = useState<string>(
    src?.cylinderType ?? "NORMAL",
  );
  const [stepLength, setStepLength] = useState<number | string>(
    src?.stepLength ?? 9,
  );
  const [stepType, setStepType] = useState<string>(src?.stepType ?? "FINISH");
  const [neckLength, setNeckLength] = useState<number | string>(
    src?.neckLength ?? 0,
  );
  const [neckType, setNeckType] = useState<string>(src?.neckType ?? "NONE");
  const [coating, setCoating] = useState<string>(src?.coating ?? "CX400");
  const [lapType, setLapType] = useState<string>(src?.lapType ?? "NONE");
  const [inspection, setInspection] = useState<string>(
    src?.inspection ?? "NONE",
  );
  const [ldEnabled, setLdEnabled] = useState(src?.ldEnabled ?? false);
  const [ldLocation, setLdLocation] = useState<string>(
    src?.ldLocation ?? "TIP",
  );
  const [ldOuterDiameter, setLdOuterDiameter] = useState<number | string>(
    src?.ldOuterDiameter ?? 3,
  );
  const [ldBladeLength, setLdBladeLength] = useState<number | string>(
    src?.ldBladeLength ?? 10,
  );
  const [machiningMinutes, setMachiningMinutes] = useState<number | string>(
    src?.machiningMinutes ?? 6,
  );
  // 加工単価・予備形状本数は scope:"global" のカスタム固定係数（customValues）を使用。
  // 基準数量 — 形状出し（段取り分）の按分にのみ使用。数量スケール（×倍率）は
  // 価格表側で管理するため、試算はこの1点の基準単価だけを算出する。
  const [baseQuantity, setBaseQuantity] = useState<number | string>(100);

  // ── カスタム入力項目（管理者が試算計算 SY02 で定義）───────────────────────
  const [customValues, setCustomValues] = useState<
    Record<string, number | boolean | string>
  >(() => {
    const rec = src as unknown as Record<string, unknown> | undefined;
    const out: Record<string, number | boolean | string> = {};
    for (const d of settings.customInputs) {
      const v = rec?.[d.key];
      out[d.key] = (v as number | boolean | string | undefined) ?? d.default;
    }
    return out;
  });
  const setCustomValue = (key: string, v: number | boolean | string) =>
    setCustomValues((s) => ({ ...s, [key]: v }));

  // ── reference price (from purchase history / policy / chart override) ──────
  // 現在の素材の仕入実績＋ポリシー参照価格。素材変更時にサーバーから再取得する。
  const [pricing, setPricing] = useState<MaterialPricing>(initialPricing);
  const history = pricing.history;
  const policyRef = pricing.reference;

  const [referencePrice, setReferencePrice] = useState<number>(
    src ? src.materialBarPrice : initialPricing.reference.unitPrice,
  );
  const [referenceDate, setReferenceDate] = useState<string>(
    source?.referenceDate || initialPricing.reference.date,
  );
  // overridden = the estimate uses a custom (non-policy) material price.
  const [overridden, setOverridden] = useState(source?.isCustomPrice ?? false);
  // customMode = the price field is unlocked for manual editing.
  const [customMode, setCustomMode] = useState(false);

  const onMaterialChange = (value: string | null) => {
    const id = value ?? defaultMaterial;
    setMaterialId(id);
    startPricingTransition(async () => {
      const res = await fetchMaterialPricing(id);
      if (!res.ok) {
        notifications.show({
          title: "エラー",
          message: res.error,
          color: "red",
        });
        return;
      }
      setPricing(res.data);
      setReferencePrice(res.data.reference.unitPrice);
      setReferenceDate(res.data.reference.date);
      setOverridden(false);
      setCustomMode(false);
    });
  };

  const resetToPolicy = () => {
    setReferencePrice(policyRef.unitPrice);
    setReferenceDate(policyRef.date);
    setOverridden(false);
    setCustomMode(false);
  };

  // Prompt before unlocking the price for a custom value.
  const promptCustomPrice = () => {
    openConfirm({
      title: "材料単価のカスタム設定",
      message:
        "この素材の単価を手動で設定しますか？カスタム単価を使った試算は「カスタム」として記録されます。",
      confirmLabel: "カスタム設定する",
      onConfirm: () => {
        setCustomMode(true);
        setOverridden(true);
      },
    });
  };

  const basisLabel =
    MATERIAL_PRICE_BASIS_OPTIONS.find(
      (b) => b.value === settings.materialPriceBasis,
    )?.label ?? settings.materialPriceBasis;

  // ── compute ───────────────────────────────────────────────────────────────
  const input: TrialInput = {
    ...customValues,
    toolType,
    maxDiameter: num(maxDiameter),
    totalLength: num(totalLength),
    materialBarPrice: toolType === "CYLINDER" ? 0 : referencePrice,
    isBlackSkin,
    cylinderMaterialPrice: num(cylinderMaterialPrice),
    cylinderType,
    stepLength: num(stepLength),
    stepType,
    neckLength: num(neckLength),
    neckType,
    coating,
    lapType,
    inspection,
    ldEnabled,
    ldLocation,
    ldOuterDiameter: num(ldOuterDiameter),
    ldBladeLength: num(ldBladeLength),
    machiningMinutes: num(machiningMinutes),
    machiningRatePer10min: Number(customValues.machiningRatePer10min ?? 2000),
    spareShapeCount: Number(customValues.spareShapeCount ?? 3),
    lotQuantities: [num(baseQuantity), 0, 0],
    lotMarkups: [1], // 掛け率は使わない（数量スケールは価格表の倍率で管理）
  };
  const result = calcTrialPricing(input, toTrialPricingOptions(settings));

  const save = () => {
    if (!name.trim()) {
      notifications.show({
        title: "エラー",
        message: "試算名を入力してください",
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const res = await createTrialEstimate({
        name: name.trim(),
        customerBpId: customerId,
        materialId,
        input,
        referenceUnitPrice:
          toolType === "CYLINDER" ? null : num(referencePrice),
        referenceDate: referenceDate || null,
        referenceOverridden: overridden,
      });
      if (res.ok) {
        notifications.show({
          title: "保存しました",
          message: overridden
            ? "試算を保存しました（カスタム単価）"
            : "試算を保存しました",
          color: "green",
        });
        // 作成後は詳細（ビュー）ページへ。
        router.push(`${BASE_PATH}/${res.data.number}`);
      } else {
        notifications.show({
          title: "エラー",
          message: res.error,
          color: "red",
        });
      }
    });
  };

  const isCylinder = toolType === "CYLINDER";

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <Group gap="xs">
            <SecondaryButton onClick={() => router.push(BASE_PATH)}>
              一覧へ
            </SecondaryButton>
            <SaveButton loading={isPending} onClick={save}>
              保存
            </SaveButton>
          </Group>
        }
        breadcrumbs={["販売", { label: "試算", href: BASE_PATH }, "新規"]}
        status={
          overridden ? (
            <Badge color="orange" variant="light">
              カスタム
            </Badge>
          ) : undefined
        }
        title="見積試算"
      />

      <Tabs defaultValue="calc">
        <Tabs.List>
          <Tabs.Tab leftSection={<IconCalculator size={14} />} value="calc">
            試算
          </Tabs.Tab>
          <Tabs.Tab leftSection={<IconChartLine size={14} />} value="history">
            素材価格推移
          </Tabs.Tab>
        </Tabs.List>

        {/* ── 試算 tab ───────────────────────────────────────────────────── */}
        <Tabs.Panel pt="md" value="calc">
          <Stack gap="md">
            <FormSection title="基本">
              <Stack gap="sm">
                <SegmentedControl
                  data={toData(TOOL_TYPE_OPTIONS)}
                  onChange={(v) => setToolType(v as ToolType)}
                  value={toolType}
                />
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                  <Select
                    clearable
                    data={customerOptions}
                    label="見積り先"
                    onChange={setCustomerId}
                    placeholder="顧客"
                    searchable
                    value={customerId}
                  />
                  <NumberInput
                    label={
                      <HelpLabel
                        help="工具の最大外径。加工費マトリクスの参照キーになります。"
                        label="最大径 (mm)"
                      />
                    }
                    min={0}
                    onChange={setMaxDiameter}
                    value={maxDiameter}
                  />
                  <NumberInput
                    label={
                      <HelpLabel
                        help="工具全長。材料原価 = 参照単価 × (全長 ÷ 1000mm)。"
                        label="全長 (mm)"
                      />
                    }
                    min={0}
                    onChange={setTotalLength}
                    value={totalLength}
                  />
                </SimpleGrid>
              </Stack>
            </FormSection>

            <FormSection
              description="材料原価は仕入実績（購買履歴）から算出します。"
              title="素材"
            >
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <Select
                  data={materialOptions}
                  disabled={isPricingLoading}
                  label="材種・素材"
                  onChange={onMaterialChange}
                  searchable
                  value={materialId}
                />
                {isCylinder ? (
                  <NumberInput
                    label="素材価格（手入力 ¥/本）"
                    min={0}
                    onChange={setCylinderMaterialPrice}
                    prefix="¥"
                    thousandSeparator=","
                    value={cylinderMaterialPrice}
                  />
                ) : (
                  <NumberInput
                    description={
                      customMode
                        ? "カスタム単価（手動）"
                        : overridden
                          ? "カスタム単価"
                          : `参照: ${basisLabel}（直近${settings.materialPriceLookbackMonths}ヶ月）`
                    }
                    label={
                      <Group gap={6} wrap="nowrap">
                        <HelpLabel
                          help="素材の仕入実績単価（¥/1000mm）。既定はポリシー（直近Nヶ月の最高値など）で自動選択され、「単価を編集」で手動上書きできます。"
                          label="参照単価（¥/1000mm）"
                        />
                        <Badge
                          color={overridden ? "orange" : "blue"}
                          variant="light"
                        >
                          {overridden
                            ? "カスタム"
                            : `参照価格 ${referenceDate ? formatDate(referenceDate) : "—"}`}
                        </Badge>
                      </Group>
                    }
                    min={0}
                    onChange={(v) => {
                      setReferencePrice(num(v));
                      setOverridden(true);
                    }}
                    prefix="¥"
                    readOnly={!customMode}
                    thousandSeparator=","
                    value={referencePrice}
                  />
                )}
              </SimpleGrid>
              {!isCylinder && (
                <Group gap="sm" justify="space-between" mt="xs" wrap="nowrap">
                  <Switch
                    checked={isBlackSkin}
                    label="黒皮材（センタレス加算）"
                    onChange={(e) => setIsBlackSkin(e.currentTarget.checked)}
                    size="sm"
                  />
                  {customMode ? (
                    <Text
                      c="dimmed"
                      className="cursor-pointer"
                      onClick={resetToPolicy}
                      size="xs"
                    >
                      ポリシー値に戻す
                    </Text>
                  ) : (
                    <EditButton onClick={promptCustomPrice} size="compact-xs">
                      単価を編集
                    </EditButton>
                  )}
                </Group>
              )}
              {isCylinder && (
                <Select
                  data={toData(CYLINDER_TYPE_OPTIONS)}
                  label="円筒種類"
                  mt="sm"
                  onChange={(v) => setCylinderType(v ?? "NORMAL")}
                  value={cylinderType}
                  w={220}
                />
              )}
            </FormSection>

            <FormSection title="加工">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <NumberInput
                  label="段加工長 (mm)"
                  min={0}
                  onChange={setStepLength}
                  value={stepLength}
                />
                <Select
                  data={toData(STEP_TYPE_OPTIONS)}
                  label="段加工種類"
                  onChange={(v) => setStepType(v ?? "NONE")}
                  value={stepType}
                />
                <NumberInput
                  label="首下加工長 (mm)"
                  min={0}
                  onChange={setNeckLength}
                  value={neckLength}
                />
                <Select
                  data={toData(NECK_TYPE_OPTIONS)}
                  label="首下加工種類"
                  onChange={(v) => setNeckType(v ?? "NONE")}
                  value={neckType}
                />
                <NumberInput
                  label={
                    <HelpLabel
                      help="1本あたりの機械加工時間。加工単価 = 加工時間 × 加工レート（/10分）。"
                      label="加工時間 (分)"
                    />
                  }
                  min={0}
                  onChange={setMachiningMinutes}
                  value={machiningMinutes}
                />
              </SimpleGrid>
              <Text c="dimmed" mt="xs" size="xs">
                加工単価（¥
                {Number(customValues.machiningRatePer10min ?? 2000).toLocaleString()}
                /10分）・予備形状本数（
                {Number(customValues.spareShapeCount ?? 3)}
                本）は試算計算のグローバル固定係数を使用します。
              </Text>
            </FormSection>

            <FormSection title="コート・処理">
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                <Select
                  data={COATING_OPTIONS.map((c) => ({ value: c, label: c }))}
                  label="コート"
                  onChange={(v) => setCoating(v ?? "無")}
                  searchable
                  value={coating}
                />
                <Select
                  data={toData(LAP_OPTIONS)}
                  label="ラップ処理"
                  onChange={(v) => setLapType(v ?? "NONE")}
                  value={lapType}
                />
                <Select
                  data={toData(INSPECTION_OPTIONS)}
                  label="検査成績書"
                  onChange={(v) => setInspection(v ?? "NONE")}
                  value={inspection}
                />
              </SimpleGrid>
            </FormSection>

            <FormSection title="LD">
              <Group gap="sm" mb={ldEnabled ? "sm" : 0}>
                <Switch
                  checked={ldEnabled}
                  label="LD加工あり"
                  onChange={(e) => setLdEnabled(e.currentTarget.checked)}
                  size="sm"
                />
              </Group>
              {ldEnabled && (
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                  <Select
                    data={toData(LD_LOCATION_OPTIONS)}
                    label="LD部位"
                    onChange={(v) => setLdLocation(v ?? "TIP")}
                    value={ldLocation}
                  />
                  <NumberInput
                    label="LD外径 (mm)"
                    min={0}
                    onChange={setLdOuterDiameter}
                    value={ldOuterDiameter}
                  />
                  <NumberInput
                    label="LD刃長 (mm)"
                    min={0}
                    onChange={setLdBladeLength}
                    value={ldBladeLength}
                  />
                </SimpleGrid>
              )}
            </FormSection>

            {settings.customInputs.some((d) => d.scope !== "global") && (
              <FormSection
                description="試算計算（SY02）で定義された追加入力。計算基準の式で変数として使われます。"
                title="カスタム項目"
              >
                <SimpleGrid cols={{ base: 1, sm: 2 }} maw={640} spacing="sm">
                  {settings.customInputs
                    .filter((d) => d.scope !== "global")
                    .map((d) =>
                      d.type === "number" ? (
                        <NumberInput
                          key={d.key}
                          label={d.label || d.key}
                          onChange={(v) =>
                            setCustomValue(d.key, typeof v === "number" ? v : 0)
                          }
                          value={
                            typeof customValues[d.key] === "number"
                              ? (customValues[d.key] as number)
                              : 0
                          }
                        />
                      ) : d.type === "boolean" ? (
                        <Switch
                          checked={customValues[d.key] === true}
                          key={d.key}
                          label={d.label || d.key}
                          mt={26}
                          onChange={(e) =>
                            setCustomValue(d.key, e.currentTarget.checked)
                          }
                        />
                      ) : d.type === "select" ? (
                        <Select
                          data={(d.options ?? []).map((o) => ({
                            value: o.value,
                            label: o.label,
                          }))}
                          key={d.key}
                          label={d.label || d.key}
                          onChange={(v) => setCustomValue(d.key, v ?? "")}
                          value={String(customValues[d.key] ?? "")}
                        />
                      ) : (
                        <TextInput
                          key={d.key}
                          label={d.label || d.key}
                          onChange={(e) =>
                            setCustomValue(d.key, e.currentTarget.value)
                          }
                          value={String(customValues[d.key] ?? "")}
                        />
                      ),
                    )}
                </SimpleGrid>
              </FormSection>
            )}

            <FormSection
              description="形状出し（予備形状分）の按分にのみ使用します。数量ごとの価格スケール（×倍率）は価格表側で設定します。"
              title="基準数量"
            >
              <NumberInput
                label={
                  <HelpLabel
                    help="形状出し（予備形状分）を按分する数量。数量ごとの価格スケールは掛けず、価格表の倍率（×1.01 など）で設定します。"
                    label="基準数量（本）"
                  />
                }
                min={1}
                onChange={setBaseQuantity}
                value={baseQuantity}
                w={220}
              />
            </FormSection>

            <ResultsPanel
              breakdown={result.breakdown}
              correctionFactor={Number(customValues.correctionFactor ?? 1.25)}
              lot={result.lots[0] ?? null}
              warnings={result.warnings}
            />

            <FormSection required title="試算名">
              <TextInput
                maw={480}
                onChange={(e) => setName(e.currentTarget.value)}
                placeholder="例: 精密軸 φ3×38 BAL ｱﾙｸﾛｰﾅ"
                value={name}
                withAsterisk
              />
            </FormSection>
          </Stack>
        </Tabs.Panel>

        {/* ── 素材価格推移 tab ──────────────────────────────────────────── */}
        <Tabs.Panel pt="md" value="history">
          <Paper p="md" radius="md" withBorder>
            <Stack gap="sm">
              <Group gap="sm">
                <Badge color="blue" variant="light">
                  ポリシー: {basisLabel}・直近
                  {settings.materialPriceLookbackMonths}ヶ月
                </Badge>
                <Text c="dimmed" size="xs">
                  {materialOptions.find((m) => m.value === materialId)?.label}
                </Text>
              </Group>
              <MaterialPriceChart
                onSelect={(p) => {
                  setReferencePrice(p.unitPrice);
                  setReferenceDate(p.date);
                  setOverridden(true);
                }}
                points={history}
                selectedDate={referenceDate}
                windowDates={policyRef.windowPoints.map((p) => p.date)}
              />
              {isCylinder && (
                <Alert color="gray" variant="light">
                  円筒見積は素材価格を手入力します（仕入実績は参考表示）。
                </Alert>
              )}
            </Stack>
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────
// 数量スケール（ロット別掛け率）は廃止 — 試算は基準単価1点のみを算出する。
// 数量ごとの価格（×倍率）は価格表側で設定・上書きする。
function ResultsPanel({
  breakdown,
  lot,
  correctionFactor,
  warnings,
}: {
  breakdown: CostBreakdown;
  /** 基準数量での計算結果（単一）. */
  lot: LotResult | null;
  correctionFactor: number;
  warnings: string[];
}) {
  const rows: { label: string; value: number }[] = [
    { label: "材料原価", value: breakdown.material },
    { label: "段加工費", value: breakdown.step },
    { label: "首下加工費", value: breakdown.neck },
    { label: "加工単価", value: breakdown.machining },
    { label: "コート代", value: breakdown.coating },
    { label: "ラップ処理", value: breakdown.lap },
    { label: "LD", value: breakdown.ld },
    { label: "検査成績書", value: breakdown.inspection },
  ];

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Text fw={600}>試算結果</Text>

        {warnings.length > 0 && (
          <Alert
            color="orange"
            icon={<IconAlertTriangle size={16} />}
            variant="light"
          >
            <Stack gap={2}>
              {warnings.map((w) => (
                <Text key={w} size="xs">
                  {w}
                </Text>
              ))}
            </Stack>
          </Alert>
        )}

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <div>
            <Text c="dimmed" mb={4} size="xs">
              原価内訳（1本あたり）
            </Text>
            <Table>
              <Table.Tbody>
                {rows.map((r) => (
                  <Table.Tr key={r.label}>
                    <Table.Td>{r.label}</Table.Td>
                    <Table.Td ta="right">
                      <MoneyText value={Math.round(r.value)} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>

          <div>
            <Text c="dimmed" mb={4} size="xs">
              基準単価（数量スケールは価格表の倍率で設定）
            </Text>
            {lot ? (
              <Table>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td>最低単価</Table.Td>
                    <Table.Td ta="right">
                      <MoneyText value={Math.round(lot.minimumPrice)} />
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>補正値</Table.Td>
                    <Table.Td ta="right">
                      <Text className="tabular-nums" ff="mono" size="sm">
                        ×{correctionFactor}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>
                      <Text fw={600} size="sm">
                        見積単価（基準）
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fw={700} size="sm">
                        <MoneyText value={lot.estimateUnitPrice} />
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            ) : (
              <Text c="dimmed" size="xs">
                基準数量を入力してください
              </Text>
            )}
          </div>
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}
