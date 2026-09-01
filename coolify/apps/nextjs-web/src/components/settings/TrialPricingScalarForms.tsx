"use client";

/**
 * TrialPricingScalarForms — 価格試算計算（SY02）のスカラー系セクション編集フォーム。
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
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { updateTrialPricingSettings } from "@/app/(dashboard)/settings/actions";
import { GhostButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormActions, FormSection } from "@/components/ui/shells";
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

/** 全設定を保持しつつ、指定セクションだけ編集する共通フック。 */
function useSectionSettings(initial: TrialPricingSettings) {
  const tr = useTranslations();
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const patch = (p: Partial<TrialPricingSettings>) =>
    setSettings((s) => ({ ...s, ...p }));
  const save = (validate?: () => string | null) => {
    const err = validate?.();
    if (err) {
      notifications.show({
        title: tr("common.error2"),
        message: err,
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const res = await updateTrialPricingSettings(settings);
      if (res.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr(
            "settings.trialPricingScalarForms.thePriceEstimateSettingsWereUpdated",
          ),
          color: "green",
        });
        router.push(BASE);
      } else {
        notifications.show({
          title: tr("common.error2"),
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
  children,
}: {
  title: string;
  isPending: boolean;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const tr = useTranslations();
  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          tr("common.system"),
          { label: tr("common.priceEstimateEngine"), href: BASE },
          title,
        ]}
        title={title}
      />
      {children}
      <FormActions loading={isPending} onCancel={onCancel} onSave={onSave} />
    </Stack>
  );
}

// ── 材料参照価格ポリシー ───────────────────────────────────────────────────────
export function MaterialPolicyForm({
  initial,
}: {
  initial: TrialPricingSettings;
}) {
  const tr = useTranslations();
  const { settings, patch, save, isPending, router } =
    useSectionSettings(initial);
  return (
    <SectionShell
      isPending={isPending}
      onCancel={() => router.push(BASE)}
      onSave={() => save()}
      title={tr("common.materialReferencePricePolicy")}
    >
      <FormSection
        description={tr(
          "settings.trialPricingScalarForms.howTheReferencePriceForThe",
        )}
        title={tr("settings.trialPricingScalarForms.policy")}
      >
        <Stack gap="sm" maw={480}>
          <Select
            data={MATERIAL_PRICE_BASIS_OPTIONS}
            description={tr(
              "settings.trialPricingScalarForms.howTheReferencePriceIsDerived",
            )}
            label={tr("settings.trialPricingScalarForms.howItIsCalculated")}
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
            description={tr(
              "settings.trialPricingScalarForms.howManyMonthsOfPurchaseHistory",
            )}
            label={tr("settings.trialPricingScalarForms.lookbackPeriodMonths")}
            max={36}
            min={1}
            onChange={(v) =>
              patch({ materialPriceLookbackMonths: Number(v) || 1 })
            }
            value={settings.materialPriceLookbackMonths}
          />
          <NumberInput
            description={tr(
              "settings.trialPricingScalarForms.theDefaultPriceUsedWhenA",
            )}
            label={tr(
              "settings.trialPricingScalarForms.defaultMaterialUnitPrice1000mm",
            )}
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
  const tr = useTranslations();
  const { settings, patch, save, isPending, router } =
    useSectionSettings(initial);

  const INPUT_TYPE_OPTIONS: { value: CustomInputType; label: string }[] = [
    { value: "number", label: tr("settings.trialPricingScalarForms.number") },
    { value: "boolean", label: "ON/OFF" },
    { value: "text", label: tr("settings.trialPricingScalarForms.string") },
    { value: "select", label: tr("settings.trialPricingScalarForms.select") },
  ];

  const SCOPE_OPTIONS = [
    {
      value: "estimate",
      label: tr("settings.trialPricingScalarForms.estimateInputShownInThe"),
    },
    {
      value: "global",
      label: tr(
        "settings.trialPricingScalarForms.globalConstantFixedCoefficient",
      ),
    },
  ];

  const keyErrors = useMemo(() => {
    const errors: Record<number, string> = {};
    const seen = new Map<string, number>();
    settings.customInputs.forEach((d, i) => {
      if (d.scope === "global") return; // 固定係数はキー編集不可・検証対象外
      if (d.key && RESERVED_KEYS.has(d.key))
        errors[i] = tr("settings.trialPricingScalarForms.thatIsAReservedWord");
      if (d.key && seen.has(d.key))
        errors[i] = tr("settings.trialPricingScalarForms.theKeyIsDuplicated");
      if (d.key) seen.set(d.key, i);
    });
    return errors;
  }, [settings.customInputs, tr]);

  const setInputs = (customInputs: CustomInputDef[]) =>
    patch({ customInputs: customInputs.map((d, i) => ({ ...d, order: i })) });

  const validate = () =>
    Object.keys(keyErrors).length > 0
      ? tr("settings.trialPricingScalarForms.fixTheCustomInputKeysReserved")
      : null;

  return (
    <SectionShell
      isPending={isPending}
      onCancel={() => router.push(BASE)}
      onSave={() => save(validate)}
      title={tr("common.customInputs")}
    >
      <FormSection
        description={tr(
          "settings.trialPricingScalarForms.fieldsUsableAsVariablesInCriterion",
        )}
        title={tr("common.customInputs")}
      >
        <Stack gap="sm">
          {settings.customInputs.length === 0 && (
            <Text c="dimmed" size="sm">
              {tr("settings.trialPricingScalarForms.thereAreNoExtraFields")}
            </Text>
          )}
          {settings.customInputs.map((d, i) => (
            <Box key={`ci-${d.order}-${i}`}>
              {i > 0 && <Divider mb="sm" />}
              <Group align="flex-start" gap="sm" wrap="wrap">
                <TextInput
                  disabled={d.scope === "global"}
                  error={keyErrors[i]}
                  label={tr("settings.trialPricingScalarForms.keyVariableName")}
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
                  label={tr("settings.trialPricingScalarForms.label")}
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
                  label={tr("settings.trialPricingScalarForms.type")}
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
                  label={tr("common.scope")}
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
                    label={tr("common.default")}
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
                    label={tr("settings.trialPricingScalarForms.onByDefault")}
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
                      d.type === "select"
                        ? tr(
                            "settings.trialPricingScalarForms.defaultOptionsCommaSeparated",
                          )
                        : tr("common.default")
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
                    aria-label={tr("common.delete")}
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
            {tr("common.addAnItem")}
          </GhostButton>
        </Stack>
      </FormSection>
    </SectionShell>
  );
}
