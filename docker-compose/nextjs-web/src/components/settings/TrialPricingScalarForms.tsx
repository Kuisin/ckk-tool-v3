"use client";

/**
 * TrialPricingScalarForms — 試算計算（SY02）のスカラー系セクション編集フォーム。
 *
 * 材料参照ポリシー / 既定値・係数 / カスタム入力項目 をそれぞれ独立ページで編集。
 * いずれも全設定を読み込み、該当セクションだけ編集して updateTrialPricingSettings
 * で保存する（他セクションの値はそのまま維持）。
 */

import {
  ActionIcon,
  Box,
  Divider,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { updateTrialPricingSettings } from "@/app/(dashboard)/settings/actions";
import { CancelButton, GhostButton, SaveButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  type CustomInputDef,
  type CustomInputType,
  RESERVED_KEYS,
} from "@/lib/trial-pricing-criteria";
import {
  MATERIAL_PRICE_BASIS_OPTIONS,
  type TrialPricingSettings,
} from "@/lib/trial-pricing-settings";

const BASE = "/settings/trial-pricing-engine";

const INPUT_TYPE_OPTIONS: { value: CustomInputType; label: string }[] = [
  { value: "number", label: "数値" },
  { value: "boolean", label: "ON/OFF" },
  { value: "text", label: "文字列" },
  { value: "select", label: "選択" },
];

const SCOPE_OPTIONS = [
  { value: "estimate", label: "見積入力（フォームに表示）" },
  { value: "global", label: "グローバル定数（固定係数）" },
];

/** 全設定を保持しつつ、指定セクションだけ編集する共通フック。 */
function useSectionSettings(initial: TrialPricingSettings) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const patch = (p: Partial<TrialPricingSettings>) =>
    setSettings((s) => ({ ...s, ...p }));
  const save = (validate?: () => string | null) => {
    const err = validate?.();
    if (err) {
      notifications.show({ title: "エラー", message: err, color: "red" });
      return;
    }
    startTransition(async () => {
      const res = await updateTrialPricingSettings(settings);
      if (res.ok) {
        notifications.show({
          title: "保存しました",
          message: "試算の設定を更新しました",
          color: "green",
        });
        router.push(BASE);
      } else {
        notifications.show({
          title: "エラー",
          message: res.error,
          color: "red",
        });
      }
    });
  };
  return { settings, patch, save, isPending, router };
}

function SectionShell({
  title,
  isPending,
  onSave,
  onCancel,
  isMobile,
  children,
}: {
  title: string;
  isPending: boolean;
  onSave: () => void;
  onCancel: () => void;
  isMobile: boolean;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={["システム", { label: "試算計算", href: BASE }, title]}
        title={title}
      />
      {children}
      <Group justify={isMobile ? "stretch" : "flex-end"}>
        <CancelButton fullWidth={isMobile} onClick={onCancel} />
        <SaveButton fullWidth={isMobile} loading={isPending} onClick={onSave}>
          保存
        </SaveButton>
      </Group>
    </Stack>
  );
}

// ── 材料参照価格ポリシー ───────────────────────────────────────────────────────
export function MaterialPolicyForm({
  initial,
}: {
  initial: TrialPricingSettings;
}) {
  const isMobile = useIsMobile();
  const { settings, patch, save, isPending, router } =
    useSectionSettings(initial);
  return (
    <SectionShell
      isMobile={isMobile}
      isPending={isPending}
      onCancel={() => router.push(BASE)}
      onSave={() => save()}
      title="材料参照価格ポリシー"
    >
      <FormSection
        description="試算の材料原価に使う、仕入実績（購買履歴）からの参照価格の決め方です。"
        title="ポリシー"
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
                  settings.materialPriceBasis,
              })
            }
            value={settings.materialPriceBasis}
          />
          <NumberInput
            description="参照する仕入実績をさかのぼる月数"
            label="参照期間（ヶ月）"
            max={36}
            min={1}
            onChange={(v) =>
              patch({ materialPriceLookbackMonths: Number(v) || 1 })
            }
            value={settings.materialPriceLookbackMonths}
          />
          <NumberInput
            description="仕入実績が無い素材の試算で使う既定単価（0 = 既定なし）。試算では「既定価格」と表示されます。"
            label="既定材料単価（¥/1000mm）"
            min={0}
            onChange={(v) => patch({ defaultMaterialPrice: Number(v) || 0 })}
            prefix="¥"
            thousandSeparator=","
            value={settings.defaultMaterialPrice}
          />
        </Stack>
      </FormSection>
    </SectionShell>
  );
}

// ── カスタム入力項目 ───────────────────────────────────────────────────────────
// 旧「既定値・係数（グローバル）」は廃止し、その 4 値は scope:"global" の固定係数
// カスタム入力（下の CustomInputsForm）へ移行した。
export function CustomInputsForm({
  initial,
}: {
  initial: TrialPricingSettings;
}) {
  const isMobile = useIsMobile();
  const { settings, patch, save, isPending, router } =
    useSectionSettings(initial);

  const keyErrors = useMemo(() => {
    const errors: Record<number, string> = {};
    const seen = new Map<string, number>();
    settings.customInputs.forEach((d, i) => {
      if (d.scope === "global") return; // 固定係数はキー編集不可・検証対象外
      if (d.key && RESERVED_KEYS.has(d.key)) errors[i] = "予約語です";
      if (d.key && seen.has(d.key)) errors[i] = "キーが重複しています";
      if (d.key) seen.set(d.key, i);
    });
    return errors;
  }, [settings.customInputs]);

  const setInputs = (customInputs: CustomInputDef[]) =>
    patch({ customInputs: customInputs.map((d, i) => ({ ...d, order: i })) });

  const validate = () =>
    Object.keys(keyErrors).length > 0
      ? "カスタム入力キーを修正してください（予約語・重複）"
      : null;

  return (
    <SectionShell
      isMobile={isMobile}
      isPending={isPending}
      onCancel={() => router.push(BASE)}
      onSave={() => save(validate)}
      title="カスタム入力項目"
    >
      <FormSection
        description="計算基準の式で変数として使える項目。スコープ「見積入力」は試算フォームに表示、「グローバル定数」は固定係数（補正値・LDチャージ・加工単価・予備形状本数）で削除・改名不可。"
        title="カスタム入力項目"
      >
        <Stack gap="sm">
          {settings.customInputs.length === 0 && (
            <Text c="dimmed" size="sm">
              追加項目はありません。
            </Text>
          )}
          {settings.customInputs.map((d, i) => (
            <Box key={`ci-${d.order}-${i}`}>
              {i > 0 && <Divider mb="sm" />}
              <Group align="flex-start" gap="sm" wrap="wrap">
                <TextInput
                  disabled={d.scope === "global"}
                  error={keyErrors[i]}
                  label="キー（変数名）"
                  onChange={(e) => {
                    const next = settings.customInputs.slice();
                    next[i] = { ...d, key: e.currentTarget.value };
                    setInputs(next);
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
                    setInputs(next);
                  }}
                  value={d.label}
                  w={180}
                />
                <Select
                  data={INPUT_TYPE_OPTIONS}
                  disabled={d.scope === "global"}
                  label="型"
                  onChange={(v) => {
                    const type = (v as CustomInputType) ?? "number";
                    const next = settings.customInputs.slice();
                    const def =
                      type === "number" ? 0 : type === "boolean" ? false : "";
                    next[i] = { ...d, type, default: def };
                    setInputs(next);
                  }}
                  value={d.type}
                  w={130}
                />
                <Select
                  data={SCOPE_OPTIONS}
                  disabled={d.scope === "global"}
                  label="スコープ"
                  onChange={(v) => {
                    const next = settings.customInputs.slice();
                    next[i] = {
                      ...d,
                      scope: (v as CustomInputDef["scope"]) ?? "estimate",
                    };
                    setInputs(next);
                  }}
                  value={d.scope ?? "estimate"}
                  w={190}
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
                      setInputs(next);
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
                      setInputs(next);
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
                                .map((x) => x.trim())
                                .filter(Boolean)
                                .map((x) => ({ value: x, label: x })),
                            }
                          : { ...d, default: val };
                      setInputs(next);
                    }}
                    value={
                      d.type === "select"
                        ? (d.options ?? []).map((o) => o.value).join(",")
                        : String(d.default ?? "")
                    }
                    w={200}
                  />
                )}
                {d.scope !== "global" && (
                  <ActionIcon
                    aria-label="削除"
                    color="red"
                    mt={26}
                    onClick={() =>
                      setInputs(settings.customInputs.filter((_, k) => k !== i))
                    }
                    variant="subtle"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Group>
            </Box>
          ))}
          <GhostButton
            leftSection={<IconPlus size={16} />}
            onClick={() =>
              setInputs([
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
            項目を追加
          </GhostButton>
        </Stack>
      </FormSection>
    </SectionShell>
  );
}
