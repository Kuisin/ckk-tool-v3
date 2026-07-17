"use client";

/**
 * TrialPricingSettingsForm — アプリ設定 → 試算（SA05）の計算ロジック設定.
 *
 * Three sections: 材料参照価格ポリシー / 既定値・係数 / カスタム計算（JS）.
 * The custom-calculation editor lets a `system` admin post-process the engine
 * output with a JavaScript snippet (see lib/trial-pricing-script.ts) and test it
 * against a sample estimate in the browser before saving. Persisted to
 * app.system_settings via Server Action; the page passes the current values.
 */

import {
  Alert,
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
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import { useState, useTransition } from "react";
import { updateTrialPricingSettings } from "@/app/(dashboard)/settings/actions";
import {
  GhostButton,
  SaveButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import type { TrialInput, TrialResult } from "@/lib/trial-pricing";
import { applyCustomScript, runCustomScript } from "@/lib/trial-pricing-script";
import {
  DEFAULT_TRIAL_PRICING_SETTINGS,
  MATERIAL_PRICE_BASIS_OPTIONS,
  type TrialPricingSettings,
} from "@/lib/trial-pricing-settings";

/** テスト実行用のサンプル（丸棒・3ロット）。実データではなく動作確認用。 */
const SAMPLE_INPUT = {
  toolType: "ROUND_BAR",
  maxDiameter: 12,
  totalLength: 250,
  machiningMinutes: 8,
} as unknown as TrialInput;

const SAMPLE_RESULT: TrialResult = {
  breakdown: {
    material: 320,
    step: 0,
    neck: 0,
    machining: 160,
    coating: 0,
    lap: 0,
    ld: 0,
    inspection: 0,
  },
  shapeOutPrice: 1440,
  lots: [
    {
      lotIndex: 0,
      quantity: 10,
      perPiece: 144,
      minimumPrice: 624,
      autoRate: 1.5,
      discountRate: 1.5,
      estimateUnitPrice: 1170,
    },
    {
      lotIndex: 1,
      quantity: 50,
      perPiece: 28.8,
      minimumPrice: 508.8,
      autoRate: 1.3,
      discountRate: 1.3,
      estimateUnitPrice: 670,
    },
    {
      lotIndex: 2,
      quantity: 100,
      perPiece: 14.4,
      minimumPrice: 494.4,
      autoRate: 1.2,
      discountRate: 1.2,
      estimateUnitPrice: 600,
    },
  ],
  warnings: [],
};

const SCRIPT_TEMPLATE = `// ctx.input / ctx.result / ctx.lots が使えます（読み取り専用）。
// 返り値: { unitPrices?: number[], warnings?: string[] }（省略で変更なし）。
// 例: OH付は見積単価を10%上乗せして10円単位に切り上げる。
if (ctx.input.toolType === 'OH') {
  return {
    unitPrices: ctx.lots.map((l) => ctx.round(l.estimateUnitPrice * 1.1, 10)),
    warnings: ['OH付: カスタム計算で+10%'],
  };
}
`;

interface TestOutput {
  before: number[];
  after: number[];
  warnings: string[];
  error?: string;
  raw: string;
}

export function TrialPricingSettingsForm({
  initial,
}: {
  /** 現在の設定（app.system_settings, サーバー取得）. */
  initial: TrialPricingSettings;
}) {
  const [settings, setSettings] = useState<TrialPricingSettings>(initial);
  const [isPending, startTransition] = useTransition();
  const [testOutput, setTestOutput] = useState<TestOutput | null>(null);

  const save = () => {
    startTransition(async () => {
      const res = await updateTrialPricingSettings(settings);
      if (res.ok) {
        notifications.show({
          title: "保存しました",
          message: "試算の計算ロジックを更新しました",
          color: "green",
        });
      } else {
        notifications.show({
          title: "エラー",
          message: res.error,
          color: "red",
        });
      }
    });
  };

  const runTest = () => {
    const ctx = { input: SAMPLE_INPUT, result: SAMPLE_RESULT };
    let raw = "—";
    try {
      raw = JSON.stringify(runCustomScript(settings.customScript, ctx));
    } catch {
      // applyCustomScript below reports the error message.
    }
    const { result, error } = applyCustomScript(settings.customScript, ctx);
    setTestOutput({
      before: SAMPLE_RESULT.lots.map((l) => l.estimateUnitPrice),
      after: result.lots.map((l) => l.estimateUnitPrice),
      warnings: result.warnings,
      error,
      raw: raw ?? "undefined",
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
        actions={
          <SaveButton loading={isPending} onClick={save}>
            保存
          </SaveButton>
        }
        breadcrumbs={["システム", "アプリ設定", "試算"]}
        title="試算 設定"
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

        <FormSection
          description="固定ロジックで表せない調整を、JavaScript で見積単価に後処理として加えます。"
          title="カスタム計算（JavaScript）"
        >
          <Stack gap="sm">
            <Switch
              checked={settings.customScriptEnabled}
              description="試算の全画面（フォーム・一覧・詳細・価格表変換）に適用されます。"
              label="カスタム計算を有効化"
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  customScriptEnabled: e.currentTarget.checked,
                }))
              }
            />

            <Alert
              color="orange"
              icon={<IconAlertTriangle size={16} />}
              variant="light"
            >
              <Text size="xs">
                入力した JavaScript はサーバー・ブラウザの両方で実行されます。
                システム管理者のみが編集でき、試算の計算に影響します。信頼できる
                コードのみを設定してください。返り値の契約:{" "}
                <Code>{"{ unitPrices?: number[], warnings?: string[] }"}</Code>
                （<Code>ctx.input</Code> / <Code>ctx.result</Code> /{" "}
                <Code>ctx.lots</Code> / <Code>ctx.round(n, unit)</Code>{" "}
                が利用可）。
              </Text>
            </Alert>

            <Textarea
              autosize
              disabled={!settings.customScriptEnabled}
              label="スクリプト"
              maxRows={20}
              minRows={8}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  customScript: e.currentTarget.value,
                }))
              }
              placeholder={SCRIPT_TEMPLATE}
              spellCheck={false}
              styles={{
                input: { fontFamily: "var(--mantine-font-family-monospace)" },
              }}
              value={settings.customScript}
            />

            <Group gap="sm">
              <SecondaryButton
                disabled={!settings.customScriptEnabled}
                onClick={runTest}
              >
                テスト実行
              </SecondaryButton>
              <GhostButton
                onClick={() =>
                  setSettings((s) => ({ ...s, customScript: SCRIPT_TEMPLATE }))
                }
              >
                テンプレート挿入
              </GhostButton>
            </Group>

            {testOutput && (
              <Paper
                bg="var(--mantine-color-default)"
                p="sm"
                radius="sm"
                withBorder
              >
                <Stack gap="xs">
                  <Text fw={600} size="sm">
                    テスト結果（サンプル: 丸棒・3ロット）
                  </Text>
                  {testOutput.error ? (
                    <Alert color="red" variant="light">
                      <Text size="xs">エラー: {testOutput.error}</Text>
                    </Alert>
                  ) : null}
                  <Table withColumnBorders={false}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>ロット</Table.Th>
                        <Table.Th ta="right">適用前 見積単価</Table.Th>
                        <Table.Th ta="right">適用後 見積単価</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {testOutput.before.map((b, i) => (
                        <Table.Tr key={SAMPLE_RESULT.lots[i]?.quantity ?? i}>
                          <Table.Td>
                            {SAMPLE_RESULT.lots[i]?.quantity ?? "—"} 本
                          </Table.Td>
                          <Table.Td className="tabular-nums" ta="right">
                            ¥{b.toLocaleString()}
                          </Table.Td>
                          <Table.Td
                            c={testOutput.after[i] !== b ? "blue" : undefined}
                            className="tabular-nums"
                            fw={testOutput.after[i] !== b ? 600 : undefined}
                            ta="right"
                          >
                            ¥{(testOutput.after[i] ?? b).toLocaleString()}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                  {testOutput.warnings.length > 0 && (
                    <Stack gap={2}>
                      {testOutput.warnings.map((w) => (
                        <Text c="orange" key={w} size="xs">
                          ⚠ {w}
                        </Text>
                      ))}
                    </Stack>
                  )}
                  <Divider />
                  <Text c="dimmed" size="xs">
                    返り値: <Code>{testOutput.raw}</Code>
                  </Text>
                </Stack>
              </Paper>
            )}
          </Stack>
        </FormSection>
      </Paper>
    </Stack>
  );
}
