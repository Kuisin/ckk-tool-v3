"use client";

/**
 * TrialPricingEngineForm — 試算計算（SY02）メインの設定フォーム.
 *
 * スカラー設定（材料参照価格ポリシー / 既定値・係数 / カスタム入力 / カスタム計算 JS）
 * を編集し「保存」で永続化する。計算基準（criteria）は CriteriaListPanel が一覧表示し、
 * 個別の式編集は /settings/trial-pricing-engine/criteria/[id] のページで行う。
 * Flat な FormSection 群（外側 Paper を持たない = 二重カード無し）。
 */

import {
  ActionIcon,
  Alert,
  Code,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMemo, useState, useTransition } from "react";
import { updateTrialPricingSettings } from "@/app/(dashboard)/settings/actions";
import { GhostButton, SaveButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import {
  type CustomInputDef,
  type CustomInputType,
  RESERVED_KEYS,
} from "@/lib/trial-pricing-criteria";
import { CURRENT_LOGIC_SCRIPT } from "@/lib/trial-pricing-script";
import {
  DEFAULT_TRIAL_PRICING_SETTINGS,
  MATERIAL_PRICE_BASIS_OPTIONS,
  type TrialPricingSettings,
} from "@/lib/trial-pricing-settings";
import { CriteriaListPanel } from "./CriteriaListPanel";

const INPUT_TYPE_OPTIONS: { value: CustomInputType; label: string }[] = [
  { value: "number", label: "数値" },
  { value: "boolean", label: "ON/OFF" },
  { value: "text", label: "文字列" },
  { value: "select", label: "選択" },
];

export function TrialPricingEngineForm({
  initial,
}: {
  initial: TrialPricingSettings;
}) {
  const [settings, setSettings] = useState<TrialPricingSettings>(initial);
  const [isPending, startTransition] = useTransition();

  const patch = (p: Partial<TrialPricingSettings>) =>
    setSettings((s) => ({ ...s, ...p }));

  const keyErrors = useMemo(() => {
    const errors: Record<number, string> = {};
    const seen = new Map<string, number>();
    settings.customInputs.forEach((d, i) => {
      if (d.key && RESERVED_KEYS.has(d.key)) errors[i] = "予約語です";
      if (d.key && seen.has(d.key)) errors[i] = "キーが重複しています";
      if (d.key) seen.set(d.key, i);
    });
    return errors;
  }, [settings.customInputs]);

  const setCustomInputs = (customInputs: CustomInputDef[]) =>
    patch({ customInputs: customInputs.map((d, i) => ({ ...d, order: i })) });

  const save = () => {
    startTransition(async () => {
      const res = await updateTrialPricingSettings(settings);
      notifications.show(
        res.ok
          ? {
              title: "保存しました",
              message: "試算の設定を更新しました",
              color: "green",
            }
          : { title: "エラー", message: res.error, color: "red" },
      );
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

      {/* ── 計算基準（リスト。編集は個別ページ）───────────────────────────── */}
      <FormSection
        description="見積単価を構成する計算基準。並び替え・有効/無効・削除はここで、式の編集は各行の「編集」から。"
        title="計算基準"
      >
        <CriteriaListPanel initial={settings.criteria} />
      </FormSection>

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
