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
import { useMemo, useState } from "react";
import {
  EditButton,
  SaveButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { MoneyText } from "@/components/ui/MoneyText";
import { openConfirm } from "@/components/ui/modals";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import { formatDate } from "@/lib/format";
import { getPriceHistory, getReferencePrice } from "@/lib/material-pricing";
import { CUSTOMERS, MATERIALS } from "@/lib/mock";
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
  loadTrialPricingSettings,
  MATERIAL_PRICE_BASIS_OPTIONS,
} from "@/lib/trial-pricing-settings";
import { MaterialPriceChart } from "./MaterialPriceChart";

const BASE_PATH = "/sales/trial-estimates";
const toData = (o: readonly { value: string; label: string }[]) =>
  o.map((x) => ({ value: x.value, label: x.label }));
const num = (v: number | string) =>
  typeof v === "number" ? v : Number(v) || 0;

const DEFAULT_MATERIAL = MATERIALS[0].value;

export function TrialEstimateForm() {
  const router = useRouter();
  const [settings] = useState(loadTrialPricingSettings);

  // ── inputs ──────────────────────────────────────────────────────────────
  const [toolType, setToolType] = useState<ToolType>("ROUND_BAR");
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<string>(DEFAULT_MATERIAL);
  const [isBlackSkin, setIsBlackSkin] = useState(false);
  const [maxDiameter, setMaxDiameter] = useState<number | string>(3);
  const [totalLength, setTotalLength] = useState<number | string>(38);
  const [cylinderMaterialPrice, setCylinderMaterialPrice] = useState<
    number | string
  >(13086);
  const [cylinderType, setCylinderType] = useState<string>("NORMAL");
  const [stepLength, setStepLength] = useState<number | string>(9);
  const [stepType, setStepType] = useState<string>("FINISH");
  const [neckLength, setNeckLength] = useState<number | string>(0);
  const [neckType, setNeckType] = useState<string>("NONE");
  const [coating, setCoating] = useState<string>("CX400");
  const [lapType, setLapType] = useState<string>("NONE");
  const [inspection, setInspection] = useState<string>("NONE");
  const [ldEnabled, setLdEnabled] = useState(false);
  const [ldLocation, setLdLocation] = useState<string>("TIP");
  const [ldOuterDiameter, setLdOuterDiameter] = useState<number | string>(3);
  const [ldBladeLength, setLdBladeLength] = useState<number | string>(10);
  const [machiningMinutes, setMachiningMinutes] = useState<number | string>(6);
  const [machiningRate, setMachiningRate] = useState<number | string>(2000);
  const [spareShapeCount, setSpareShapeCount] = useState<number | string>(3);
  const [lot1, setLot1] = useState<number | string>(20);
  const [lot2, setLot2] = useState<number | string>(50);
  const [lot3, setLot3] = useState<number | string>(100);

  // ── reference price (from purchase history / policy / chart override) ──────
  const initialRef = useMemo(
    () =>
      getReferencePrice(
        DEFAULT_MATERIAL,
        settings.materialPriceBasis,
        settings.materialPriceLookbackMonths,
      ),
    [settings],
  );
  const [referencePrice, setReferencePrice] = useState<number>(
    initialRef.unitPrice,
  );
  const [referenceDate, setReferenceDate] = useState<string>(initialRef.date);
  // overridden = the estimate uses a custom (non-policy) material price.
  const [overridden, setOverridden] = useState(false);
  // customMode = the price field is unlocked for manual editing.
  const [customMode, setCustomMode] = useState(false);

  const history = getPriceHistory(materialId);
  const policyRef = useMemo(
    () =>
      getReferencePrice(
        materialId,
        settings.materialPriceBasis,
        settings.materialPriceLookbackMonths,
      ),
    [materialId, settings],
  );

  const onMaterialChange = (value: string | null) => {
    const id = value ?? DEFAULT_MATERIAL;
    setMaterialId(id);
    const ref = getReferencePrice(
      id,
      settings.materialPriceBasis,
      settings.materialPriceLookbackMonths,
    );
    setReferencePrice(ref.unitPrice);
    setReferenceDate(ref.date);
    setOverridden(false);
    setCustomMode(false);
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
    machiningRatePer10min: num(machiningRate),
    spareShapeCount: num(spareShapeCount),
    lotQuantities: [num(lot1), num(lot2), num(lot3)],
  };
  const result = calcTrialPricing(input);

  const save = () => {
    // TODO(server-action): persist this 試算 (trial_estimates + items).
    notifications.show({
      title: "保存しました",
      message: overridden
        ? "試算を保存しました（カスタム単価）"
        : "試算を保存しました",
      color: "green",
    });
    router.push(BASE_PATH);
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
            <SaveButton onClick={save}>保存</SaveButton>
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
                    data={CUSTOMERS}
                    label="見積り先"
                    onChange={setCustomerId}
                    placeholder="顧客"
                    searchable
                    value={customerId}
                  />
                  <NumberInput
                    label="最大径 (mm)"
                    min={0}
                    onChange={setMaxDiameter}
                    value={maxDiameter}
                  />
                  <NumberInput
                    label="全長 (mm)"
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
                  data={MATERIALS}
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
                    label="参照単価（¥/100mm）"
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
                <Group gap="sm" mt="xs">
                  <Badge color={overridden ? "orange" : "blue"} variant="light">
                    {overridden
                      ? "カスタム"
                      : `参照価格 ${referenceDate ? formatDate(referenceDate) : "—"}`}
                  </Badge>
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
                  <Switch
                    checked={isBlackSkin}
                    label="黒皮材（センタレス加算）"
                    onChange={(e) => setIsBlackSkin(e.currentTarget.checked)}
                    size="sm"
                  />
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
                  label="加工時間 (分)"
                  min={0}
                  onChange={setMachiningMinutes}
                  value={machiningMinutes}
                />
                <NumberInput
                  label="加工単価 (¥/10分)"
                  min={0}
                  onChange={setMachiningRate}
                  prefix="¥"
                  thousandSeparator=","
                  value={machiningRate}
                />
                <NumberInput
                  label="予備形状本数"
                  min={1}
                  onChange={setSpareShapeCount}
                  value={spareShapeCount}
                />
              </SimpleGrid>
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

            <FormSection title="ロット数（最大3段階）">
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                <NumberInput
                  label="ロット①"
                  min={0}
                  onChange={setLot1}
                  value={lot1}
                />
                <NumberInput
                  label="ロット②"
                  min={0}
                  onChange={setLot2}
                  value={lot2}
                />
                <NumberInput
                  label="ロット③"
                  min={0}
                  onChange={setLot3}
                  value={lot3}
                />
              </SimpleGrid>
            </FormSection>

            <ResultsPanel
              breakdown={result.breakdown}
              lots={result.lots}
              warnings={result.warnings}
            />

            <FormSection title="試算名">
              <TextInput
                maw={480}
                onChange={(e) => setName(e.currentTarget.value)}
                placeholder="例: 精密軸 φ3×38 BAL ｱﾙｸﾛｰﾅ"
                value={name}
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
                  {MATERIALS.find((m) => m.value === materialId)?.label}
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
function ResultsPanel({
  breakdown,
  lots,
  warnings,
}: {
  breakdown: CostBreakdown;
  lots: LotResult[];
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
              ロット別 見積単価
            </Text>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ロット</Table.Th>
                  <Table.Th ta="right">最低単価</Table.Th>
                  <Table.Th ta="right">掛け率</Table.Th>
                  <Table.Th ta="right">見積単価</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lots.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Text c="dimmed" size="xs">
                        ロット数を入力してください
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  lots.map((l) => (
                    <Table.Tr key={l.quantity}>
                      <Table.Td>{l.quantity}本</Table.Td>
                      <Table.Td ta="right">
                        <MoneyText value={Math.round(l.minimumPrice)} />
                      </Table.Td>
                      <Table.Td ta="right">×{l.discountRate}</Table.Td>
                      <Table.Td ta="right">
                        <Text fw={700} size="sm">
                          <MoneyText value={l.estimateUnitPrice} />
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </div>
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}
