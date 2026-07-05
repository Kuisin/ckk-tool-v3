"use client";

/**
 * TrialPricingSettingsForm — system settings for 見積試算 の材料参照価格ポリシー.
 *
 * Controls how the default material price is derived from purchase history
 * (basis + lookback window) used by the 試算 calculator. Demo persistence is
 * localStorage; see lib/trial-pricing-settings.ts migration note.
 */

import {
  Alert,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle } from "@tabler/icons-react";
import { useState } from "react";
import { SaveButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import {
  DEFAULT_TRIAL_PRICING_SETTINGS,
  loadTrialPricingSettings,
  MATERIAL_PRICE_BASIS_OPTIONS,
  saveTrialPricingSettings,
  type TrialPricingSettings,
} from "@/lib/trial-pricing-settings";

export function TrialPricingSettingsForm() {
  const [settings, setSettings] = useState<TrialPricingSettings>(
    loadTrialPricingSettings,
  );

  const save = () => {
    saveTrialPricingSettings(settings);
    notifications.show({
      title: "保存しました",
      message: "試算の価格ポリシーを更新しました",
      color: "green",
    });
  };

  type NumericKey =
    | "materialPriceLookbackMonths"
    | "machiningRatePer10min"
    | "spareShapeCount"
    | "correctionFactor"
    | "ldChargePer10min";
  const setNum = (key: NumericKey, v: number | string) =>
    setSettings((s) => ({
      ...s,
      [key]:
        typeof v === "number"
          ? v
          : Number(v) || DEFAULT_TRIAL_PRICING_SETTINGS[key],
    }));

  return (
    <Stack gap="md">
      <PageHeader
        actions={<SaveButton onClick={save}>保存</SaveButton>}
        breadcrumbs={["設定", "試算 価格ポリシー"]}
        title="システム設定"
      />

      <Paper p="md" radius="md" withBorder>
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
                setSettings((s) => ({
                  ...s,
                  materialPriceBasis:
                    (v as TrialPricingSettings["materialPriceBasis"]) ??
                    DEFAULT_TRIAL_PRICING_SETTINGS.materialPriceBasis,
                }))
              }
              value={settings.materialPriceBasis}
            />
            <NumberInput
              description="参照する仕入実績をさかのぼる月数"
              label="参照期間（ヶ月）"
              max={36}
              min={1}
              onChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  materialPriceLookbackMonths:
                    typeof v === "number"
                      ? v
                      : Number(v) ||
                        DEFAULT_TRIAL_PRICING_SETTINGS.materialPriceLookbackMonths,
                }))
              }
              value={settings.materialPriceLookbackMonths}
            />
            <Alert
              color="blue"
              icon={<IconInfoCircle size={16} />}
              variant="light"
            >
              <Text size="xs">
                既定:
                直近6ヶ月の最高単価。試算の新規作成時にこの設定が初期値として
                適用されます（個別に手動上書きも可能）。
              </Text>
            </Alert>
          </Stack>
        </FormSection>

        <FormSection
          description="見積入力に含めない必須値。試算で既定値・係数として全社共通で使われます。"
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
              description="見積単価 = 最低単価 × 掛け率 × 補正値"
              label="補正値"
              min={0}
              onChange={(v) => setNum("correctionFactor", v)}
              step={0.01}
              value={settings.correctionFactor}
            />
            <NumberInput
              description="LD加工のチャージ単価"
              label="LDチャージ（¥/10分）"
              min={0}
              onChange={(v) => setNum("ldChargePer10min", v)}
              prefix="¥"
              thousandSeparator=","
              value={settings.ldChargePer10min}
            />
          </SimpleGrid>
        </FormSection>
      </Paper>
    </Stack>
  );
}
