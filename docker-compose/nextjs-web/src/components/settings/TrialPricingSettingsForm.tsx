"use client";

/**
 * TrialPricingSettingsForm — system settings for 見積試算 の材料参照価格ポリシー.
 *
 * Controls how the default material price is derived from purchase history
 * (basis + lookback window) used by the 試算 calculator. Demo persistence is
 * localStorage; see lib/trial-pricing-settings.ts migration note.
 */

import { Alert, NumberInput, Paper, Select, Stack, Text } from "@mantine/core";
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
      </Paper>
    </Stack>
  );
}
