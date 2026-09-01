"use client";

/**
 * TrialEstimateForm — 価格試算 calculator (SA51 新規).
 *
 * Two tabs: 「価格試算」(inputs + live results) and 「素材価格推移」(purchase-price
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
import { searchProductOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  createTrialEstimate,
  fetchMaterialPricing,
  type MaterialPricing,
} from "@/app/(dashboard)/sales/trial-estimates/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { AppTabs } from "@/components/ui/AppTabs";
import { EditButton } from "@/components/ui/buttons";
import { PRODUCT_F4 } from "@/components/ui/f4-presets";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { MoneyText } from "@/components/ui/MoneyText";
import { openConfirm } from "@/components/ui/modals";
import { PageHeader } from "@/components/ui/PageHeader";
import { SalesRepSelect } from "@/components/ui/SalesRepSelect";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormActions, FormSection } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { fieldHelp } from "@/lib/field-help";
import type { Option } from "@/lib/mock";
import {
  type CostBreakdown,
  calcTrialPricing,
  type LotResult,
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
  toToolTypeOptions,
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
  materialTypeOptions,
  diameterOptions,
  surfaceFinishOptions,
  settings,
  initialPricing,
  /** 複製元（?from= で開いたとき）— 全入力を引き継いだ新規 DRAFT を作る。 */
  source,
}: {
  customerOptions: Option[];
  /** 材種・直径・黒皮/研磨 の選択肢（材料は 3 要素で指定）. */
  materialTypeOptions: Option[];
  diameterOptions: Option[];
  surfaceFinishOptions: Option[];
  /** システム設定（app.system_settings, サーバー取得）. */
  settings: TrialPricingSettings;
  /** 初期材種構成の仕入実績＋ポリシー参照価格（サーバー取得）. */
  initialPricing: MaterialPricing;
  source?: TrialEstimateRecord | null;
}) {
  const tr = useTr();
  const fmt = useFormat();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isPricingLoading, startPricingTransition] = useTransition();

  const src = source?.input;

  // ── inputs ──────────────────────────────────────────────────────────────
  const [toolType, setToolType] = useState<ToolType>(
    src?.toolType ?? "ROUND_BAR",
  );
  const [name, setName] = useState(
    source ? `${source.name}（再価格試算）` : "",
  );
  const [customerId, setCustomerId] = useState<string | null>(
    source?.customerId ?? null,
  );
  const [salesRepId, setSalesRepId] = useState<string | null>(
    source?.salesRepId ?? null,
  );
  // 対象製品（任意）— 価格表作成時の基準単価ソース候補になる。
  const [productId, setProductId] = useState<string | null>(
    source?.productId ?? null,
  );
  // 材料 = 材種 × 直径 × 黒皮/研磨（参照価格の解決キー）。
  const [materialTypeId, setMaterialTypeId] = useState<string>(
    source?.materialTypeId ?? materialTypeOptions[0]?.value ?? "",
  );
  const [diameterCode, setDiameterCode] = useState<string>(
    source?.diameterCode ?? "",
  );
  const [surfaceFinishCode, setSurfaceFinishCode] = useState<string>(
    source?.surfaceFinishCode ?? "",
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
  // 価格表側で管理するため、価格試算はこの1点の基準単価だけを算出する。
  const [baseQuantity, setBaseQuantity] = useState<number | string>(100);

  // ── カスタム入力項目（管理者が価格試算計算 SY02 で定義）───────────────────────
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

  // 材種構成の一部が変わるたびに、3要素が揃っていれば参照価格を再取得する。
  const refetchPricing = (next: {
    materialTypeId?: string;
    diameterCode?: string;
    surfaceFinishCode?: string;
  }) => {
    const key = {
      materialTypeId: next.materialTypeId ?? materialTypeId,
      diameterCode: next.diameterCode ?? diameterCode,
      surfaceFinishCode: next.surfaceFinishCode ?? surfaceFinishCode,
    };
    if (!key.materialTypeId || !key.diameterCode || !key.surfaceFinishCode) {
      return;
    }
    startPricingTransition(async () => {
      const res = await fetchMaterialPricing(key);
      if (!res.ok) {
        notifications.show({
          title: tr("エラー"),
          message: tr(res.error),
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
      title: tr("材料単価のカスタム設定"),
      message: tr(
        "この素材の単価を手動で設定しますか？カスタム単価を使った価格試算は「カスタム」として記録されます。",
      ),
      confirmLabel: tr("カスタム設定する"),
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
        title: tr("エラー"),
        message: tr("価格試算名を入力してください"),
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const res = await createTrialEstimate({
        salesRepId,
        name: name.trim(),
        customerBpId: customerId,
        productId,
        materialTypeId: materialTypeId || null,
        diameterCode: diameterCode || null,
        surfaceFinishCode: surfaceFinishCode || null,
        input,
        referenceUnitPrice:
          toolType === "CYLINDER" ? null : num(referencePrice),
        referenceDate: referenceDate || null,
        referenceOverridden: overridden,
      });
      if (res.ok) {
        notifications.show({
          title: tr("保存しました"),
          message: overridden
            ? tr("価格試算を保存しました（カスタム単価）")
            : tr("価格試算を保存しました"),
          color: "green",
        });
        // 作成後は詳細（ビュー）ページへ。
        router.push(`${BASE_PATH}/${res.data.number}`);
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(res.error),
          color: "red",
        });
      }
    });
  };

  const isCylinder = toolType === "CYLINDER";

  return (
    <Stack gap="md">
      {/* 保存 / キャンセルはヘッダーではなく画面下端の FormActions に置く。 */}
      <PageHeader
        breadcrumbs={[
          tr("販売"),
          { label: tr("価格試算"), href: BASE_PATH },
          tr("新規"),
        ]}
        status={
          overridden ? (
            <Badge color="orange" variant="light">
              {tr("カスタム")}
            </Badge>
          ) : undefined
        }
        title={tr("価格試算")}
      />

      <AppTabs defaultValue="calc">
        <Tabs.List>
          <Tabs.Tab leftSection={<IconCalculator size={14} />} value="calc">
            {tr("価格試算")}
          </Tabs.Tab>
          <Tabs.Tab leftSection={<IconChartLine size={14} />} value="history">
            {tr("素材価格推移")}
          </Tabs.Tab>
        </Tabs.List>

        {/* ── 価格試算 tab ───────────────────────────────────────────────────── */}
        <Tabs.Panel pt="md" value="calc">
          <Stack gap="md">
            <FormSection title={tr("基本")}>
              <Stack gap="sm">
                <SegmentedControl
                  data={toToolTypeOptions(settings)}
                  onChange={(v) => setToolType(v as ToolType)}
                  value={toolType}
                />
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                  <Select
                    clearable
                    data={customerOptions}
                    label={
                      <HelpLabel {...fieldHelp("trialEstimate", "customer")} />
                    }
                    onChange={setCustomerId}
                    placeholder={tr("顧客")}
                    searchable
                    value={customerId}
                  />
                  <SalesRepSelect
                    customerBpId={customerId}
                    initial={
                      source?.salesRepId && source.salesRepName
                        ? { id: source.salesRepId, name: source.salesRepName }
                        : null
                    }
                    onChange={setSalesRepId}
                    value={salesRepId}
                  />
                  <SearchSelect
                    f4={PRODUCT_F4}
                    initialOption={
                      source?.productId && source.productName
                        ? {
                            value: source.productId,
                            label: source.productName,
                          }
                        : null
                    }
                    label={
                      <HelpLabel
                        help={tr(
                          "対象製品（任意）。指定して確定すると、価格表（顧客×製品）の作成時にこの価格試算を基準単価ソースとして選択できます。",
                        )}
                        label={
                          <HelpLabel
                            {...fieldHelp("trialEstimate", "product")}
                          />
                        }
                      />
                    }
                    onChange={setProductId}
                    onSearch={searchProductOptions}
                    placeholder={tr("製品を検索（任意）")}
                    storageKey="product"
                    value={productId}
                  />
                  <NumberInput
                    label={
                      <HelpLabel
                        help={tr(
                          "工具の最大外径。加工費マトリクスの参照キーになります。",
                        )}
                        label={
                          <HelpLabel
                            {...fieldHelp("trialEstimate", "maxDiameter")}
                          />
                        }
                      />
                    }
                    min={0}
                    onChange={setMaxDiameter}
                    value={maxDiameter}
                  />
                  <NumberInput
                    label={
                      <HelpLabel
                        help={tr(
                          "工具全長。材料原価 = 参照単価 × (全長 ÷ 1000mm)。",
                        )}
                        label={
                          <HelpLabel
                            {...fieldHelp("trialEstimate", "length")}
                          />
                        }
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
              description={tr(
                "材料は「材種 × 直径 × 黒皮/研磨」で指定します。参照価格は仕入実績、無ければ材種の既定単価（¥/1000mm）から算出します。",
              )}
              title={tr("素材")}
            >
              <SimpleGrid cols={{ base: 1, sm: 3 }} mb="sm" spacing="sm">
                <Select
                  data={materialTypeOptions}
                  disabled={isPricingLoading}
                  label={
                    <HelpLabel
                      {...fieldHelp("trialEstimate", "materialType")}
                    />
                  }
                  onChange={(v) => {
                    const id = v ?? "";
                    setMaterialTypeId(id);
                    refetchPricing({ materialTypeId: id });
                  }}
                  searchable
                  value={materialTypeId}
                />
                <Select
                  clearable
                  data={diameterOptions}
                  disabled={isPricingLoading}
                  label={
                    <HelpLabel {...fieldHelp("trialEstimate", "diameter")} />
                  }
                  onChange={(v) => {
                    const code = v ?? "";
                    setDiameterCode(code);
                    refetchPricing({ diameterCode: code });
                  }}
                  searchable
                  value={diameterCode || null}
                />
                <Select
                  clearable
                  data={surfaceFinishOptions}
                  disabled={isPricingLoading}
                  label={
                    <HelpLabel
                      {...fieldHelp("trialEstimate", "surfaceFinish")}
                    />
                  }
                  onChange={(v) => {
                    const code = v ?? "";
                    setSurfaceFinishCode(code);
                    refetchPricing({ surfaceFinishCode: code });
                  }}
                  value={surfaceFinishCode || null}
                />
              </SimpleGrid>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                {isCylinder ? (
                  <NumberInput
                    label={tr("素材価格（手入力 ¥/本）")}
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
                        ? tr("カスタム単価（手動）")
                        : overridden
                          ? tr("カスタム単価")
                          : policyRef.usedDefault
                            ? tr("仕入実績なし → 設定の既定材料単価を使用")
                            : `参照: ${basisLabel}（直近${settings.materialPriceLookbackMonths}ヶ月）`
                    }
                    label={
                      <Group gap={6} wrap="nowrap">
                        <HelpLabel
                          help={tr(
                            "素材の仕入実績単価（¥/1000mm）。既定はポリシー（直近Nヶ月の最高値など）で自動選択され、「単価を編集」で手動上書きできます。",
                          )}
                          label={tr("参照単価（¥/1000mm）")}
                        />
                        <Badge
                          color={
                            overridden
                              ? "orange"
                              : policyRef.usedDefault
                                ? "yellow"
                                : "blue"
                          }
                          variant="light"
                        >
                          {overridden
                            ? tr("カスタム")
                            : policyRef.usedDefault
                              ? tr("既定価格")
                              : `参照価格 ${referenceDate ? fmt.date(referenceDate) : "—"}`}
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
                    label={tr("黒皮材（センタレス加算）")}
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
                      {tr("ポリシー値に戻す")}
                    </Text>
                  ) : (
                    <EditButton onClick={promptCustomPrice} size="compact-xs">
                      {tr("単価を編集")}
                    </EditButton>
                  )}
                </Group>
              )}
              {isCylinder && (
                <Select
                  data={toData(CYLINDER_TYPE_OPTIONS)}
                  label={
                    <HelpLabel
                      {...fieldHelp("trialEstimate", "cylinderType")}
                    />
                  }
                  mt="sm"
                  onChange={(v) => setCylinderType(v ?? "NORMAL")}
                  value={cylinderType}
                  w={220}
                />
              )}
            </FormSection>

            <FormSection title={tr("加工")}>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <NumberInput
                  label={
                    <HelpLabel
                      {...fieldHelp("trialEstimate", "stepMachining", {
                        label: tr("段加工長 (mm)"),
                      })}
                    />
                  }
                  min={0}
                  onChange={setStepLength}
                  value={stepLength}
                />
                <Select
                  data={toData(STEP_TYPE_OPTIONS)}
                  label={
                    <HelpLabel
                      {...fieldHelp("trialEstimate", "stepMachining", {
                        label: tr("段加工種類"),
                      })}
                    />
                  }
                  onChange={(v) => setStepType(v ?? "NONE")}
                  value={stepType}
                />
                <NumberInput
                  label={
                    <HelpLabel
                      {...fieldHelp("trialEstimate", "neckMachining", {
                        label: tr("首下加工長 (mm)"),
                      })}
                    />
                  }
                  min={0}
                  onChange={setNeckLength}
                  value={neckLength}
                />
                <Select
                  data={toData(NECK_TYPE_OPTIONS)}
                  label={
                    <HelpLabel
                      {...fieldHelp("trialEstimate", "neckMachining", {
                        label: tr("首下加工種類"),
                      })}
                    />
                  }
                  onChange={(v) => setNeckType(v ?? "NONE")}
                  value={neckType}
                />
                <NumberInput
                  label={
                    <HelpLabel
                      help={tr(
                        "1本あたりの機械加工時間。加工単価 = 加工時間 × 加工レート（/10分）。",
                      )}
                      label={
                        <HelpLabel
                          {...fieldHelp("trialEstimate", "machiningTime")}
                        />
                      }
                    />
                  }
                  min={0}
                  onChange={setMachiningMinutes}
                  value={machiningMinutes}
                />
              </SimpleGrid>
              <Text c="dimmed" mt="xs" size="xs">
                加工単価（¥
                {Number(
                  customValues.machiningRatePer10min ?? 2000,
                ).toLocaleString()}
                /10分）・予備形状本数（
                {Number(customValues.spareShapeCount ?? 3)}
                本）は価格試算計算のグローバル固定係数を使用します。
              </Text>
            </FormSection>

            <FormSection title={tr("コート・処理")}>
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                <Select
                  data={COATING_OPTIONS.map((c) => ({ value: c, label: c }))}
                  label={
                    <HelpLabel {...fieldHelp("trialEstimate", "coating")} />
                  }
                  onChange={(v) => setCoating(v ?? tr("無"))}
                  searchable
                  value={coating}
                />
                <Select
                  data={toData(LAP_OPTIONS)}
                  label={
                    <HelpLabel {...fieldHelp("trialEstimate", "lapping")} />
                  }
                  onChange={(v) => setLapType(v ?? "NONE")}
                  value={lapType}
                />
                <Select
                  data={toData(INSPECTION_OPTIONS)}
                  label={
                    <HelpLabel
                      {...fieldHelp("trialEstimate", "inspectionReport")}
                    />
                  }
                  onChange={(v) => setInspection(v ?? "NONE")}
                  value={inspection}
                />
              </SimpleGrid>
            </FormSection>

            <FormSection title="LD">
              <Group gap="sm" mb={ldEnabled ? "sm" : 0}>
                <Switch
                  checked={ldEnabled}
                  label={
                    <HelpLabel
                      {...fieldHelp("trialEstimate", "ld", {
                        label: tr("LD加工あり"),
                      })}
                    />
                  }
                  onChange={(e) => setLdEnabled(e.currentTarget.checked)}
                  size="sm"
                />
              </Group>
              {ldEnabled && (
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                  <Select
                    data={toData(LD_LOCATION_OPTIONS)}
                    label={
                      <HelpLabel
                        {...fieldHelp("trialEstimate", "ld", {
                          label: tr("LD部位"),
                        })}
                      />
                    }
                    onChange={(v) => setLdLocation(v ?? "TIP")}
                    value={ldLocation}
                  />
                  <NumberInput
                    label={
                      <HelpLabel
                        {...fieldHelp("trialEstimate", "ld", {
                          label: tr("LD外径 (mm)"),
                        })}
                      />
                    }
                    min={0}
                    onChange={setLdOuterDiameter}
                    value={ldOuterDiameter}
                  />
                  <NumberInput
                    label={
                      <HelpLabel
                        {...fieldHelp("trialEstimate", "ld", {
                          label: tr("LD刃長 (mm)"),
                        })}
                      />
                    }
                    min={0}
                    onChange={setLdBladeLength}
                    value={ldBladeLength}
                  />
                </SimpleGrid>
              )}
            </FormSection>

            {settings.customInputs.some((d) => d.scope !== "global") && (
              <FormSection
                description={tr(
                  "価格試算計算（SY02）で定義された追加入力。計算基準の式で変数として使われます。",
                )}
                title={tr("カスタム項目")}
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
              description={tr(
                "形状出し（予備形状分）の按分にのみ使用します。数量ごとの価格スケール（×倍率）は価格表側で設定します。",
              )}
              title={tr("基準数量")}
            >
              <NumberInput
                label={
                  <HelpLabel
                    help={tr(
                      "形状出し（予備形状分）を按分する数量。数量ごとの価格スケールは掛けず、価格表の倍率（×1.01 など）で設定します。",
                    )}
                    label={tr("基準数量（本）")}
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

            <FormSection required title={tr("価格試算名")}>
              <TextInput
                maw={480}
                onChange={(e) => setName(e.currentTarget.value)}
                placeholder={tr("例: 精密軸 φ3×38 BAL ｱﾙｸﾛｰﾅ")}
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
                  {[
                    materialTypeOptions.find((m) => m.value === materialTypeId)
                      ?.label,
                    diameterOptions.find((d) => d.value === diameterCode)
                      ?.label,
                    surfaceFinishOptions.find(
                      (s) => s.value === surfaceFinishCode,
                    )?.label,
                  ]
                    .filter(Boolean)
                    .join(" / ")}
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
                  {tr(
                    "円筒見積は素材価格を手入力します（仕入実績は参考表示）。",
                  )}
                </Alert>
              )}
            </Stack>
          </Paper>
        </Tabs.Panel>
      </AppTabs>

      <FormActions
        cancelLabel={tr("一覧へ")}
        loading={isPending}
        onCancel={() => router.push(BASE_PATH)}
        onSave={save}
      />
    </Stack>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────
// 数量スケール（ロット別掛け率）は廃止 — 価格試算は基準単価1点のみを算出する。
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
  const tr = useTr();
  const rows: { label: string; value: number }[] = [
    { label: tr("材料原価"), value: breakdown.material },
    { label: tr("段加工費"), value: breakdown.step },
    { label: tr("首下加工費"), value: breakdown.neck },
    { label: tr("加工単価"), value: breakdown.machining },
    { label: tr("コート代"), value: breakdown.coating },
    { label: tr("ラップ処理"), value: breakdown.lap },
    { label: "LD", value: breakdown.ld },
    { label: tr("検査成績書"), value: breakdown.inspection },
  ];

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Text fw={600}>{tr("価格試算結果")}</Text>

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
              {tr("原価内訳（1本あたり）")}
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
              {tr("基準単価（数量スケールは価格表の倍率で設定）")}
            </Text>
            {lot ? (
              <Table>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td>{tr("最低単価")}</Table.Td>
                    <Table.Td ta="right">
                      <MoneyText value={Math.round(lot.minimumPrice)} />
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>{tr("補正値")}</Table.Td>
                    <Table.Td ta="right">
                      <Text className="tabular-nums" ff="mono" size="sm">
                        ×{correctionFactor}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>
                      <Text fw={600} size="sm">
                        {tr("見積単価（基準）")}
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
                {tr("基準数量を入力してください")}
              </Text>
            )}
          </div>
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}
