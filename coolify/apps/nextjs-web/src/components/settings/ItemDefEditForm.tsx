"use client";

/**
 * ItemDefEditForm — 製品項目（SY03）の項目定義を 1 件編集する。
 * 新規（itemKey 無し）/ 既存編集の両対応。保存で定義配列全体を updateProductItemDefs。
 */

import {
  ActionIcon,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateProductItemDefs } from "@/app/(dashboard)/settings/actions";
import { CancelButton, GhostButton, SaveButton } from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormActions, FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { fieldHelp } from "@/lib/field-help";
import {
  IDENTIFIER,
  PRODUCT_FIELD_TYPES,
  type ProductFieldOption,
  type ProductItemDef,
} from "@/lib/product-types";

const BASE = "/settings/product-items";

const blankDef = (order: number): ProductItemDef => ({
  key: "",
  label: { ja: "", en: "" },
  type: "string",
  required: false,
  order,
  enabled: true,
});

export function ItemDefEditForm({
  allDefs,
  itemKey,
}: {
  allDefs: ProductItemDef[];
  itemKey?: string;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = itemKey != null;
  const existing = allDefs.find((d) => d.key === itemKey);

  const [def, setDef] = useState<ProductItemDef>(
    existing ?? blankDef(allDefs.length),
  );
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<ProductItemDef>) => setDef((d) => ({ ...d, ...p }));

  const setOptions = (options: ProductFieldOption[]) => patch({ options });

  const handleSave = () => {
    // ローカル検証。
    if (!def.label.ja.trim())
      return setError(tr("common.enterTheItemNameInJapanese"));
    if (!IDENTIFIER.test(def.key))
      return setError(tr("settings.itemDefEditForm.theKeyMustBeAnIdentifier"));
    const dup = allDefs.some((d) => d.key === def.key && d.key !== itemKey);
    if (dup)
      return setError(tr("settings.itemDefEditForm.anItemWithTheSameKey"));
    if (def.type === "select" && (def.options ?? []).length === 0)
      return setError(tr("settings.itemDefEditForm.addAtLeastOneOption"));
    if (def.type === "string" && def.pattern) {
      try {
        new RegExp(def.pattern);
      } catch {
        return setError(
          tr("settings.itemDefEditForm.theRegularExpressionIsNotValid"),
        );
      }
    }
    setError(null);

    // 定義配列を組み立て（既存は置換、新規は追加）。
    const next = isEdit
      ? allDefs.map((d) => (d.key === itemKey ? def : d))
      : [...allDefs, def];

    startTransition(async () => {
      const res = await updateProductItemDefs(next);
      if (res.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: isEdit
            ? tr("settings.itemDefEditForm.theItemWasUpdated")
            : tr("settings.itemDefEditForm.theItemWasCreated"),
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

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          tr("common.system"),
          { label: tr("common.productItems"), href: BASE },
          isEdit
            ? tr("settings.itemDefEditForm.editItem")
            : tr("settings.itemDefEditForm.addAnItem"),
        ]}
        title={
          isEdit
            ? tr("settings.itemDefEditForm.editItemTitle", {
                name: def.label.ja || def.key,
              })
            : tr("settings.itemDefEditForm.addAnItem")
        }
      />

      <FormSection title={tr("settings.itemDefEditForm.itemDefinition")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("productType", "itemName", {
                  label: tr("common.itemNameJapanese"),
                })}
              />
            }
            onChange={(e) =>
              patch({ label: { ...def.label, ja: e.currentTarget.value } })
            }
            placeholder={tr("settings.itemDefEditForm.eGSurfaceTreatment")}
            value={def.label.ja}
            withAsterisk
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("productType", "itemName", {
                  label: tr("settings.itemDefEditForm.itemNameEnglish"),
                })}
              />
            }
            onChange={(e) =>
              patch({ label: { ...def.label, en: e.currentTarget.value } })
            }
            placeholder="e.g. Surface treatment"
            value={def.label.en}
          />
          <TextInput
            description={
              isEdit
                ? tr("settings.itemDefEditForm.itCannotBeChangedOnceCreated")
                : tr("settings.itemDefEditForm.anIdentifierStartingWithALetter")
            }
            disabled={isEdit}
            error={error?.includes(tr("common.key")) ? error : undefined}
            label={<HelpLabel {...fieldHelp("productType", "key")} />}
            onChange={(e) => patch({ key: e.currentTarget.value })}
            placeholder="surfaceTreatment"
            value={def.key}
            withAsterisk
          />
          <Select
            data={PRODUCT_FIELD_TYPES}
            label={<HelpLabel {...fieldHelp("productType", "type")} />}
            onChange={(v) =>
              patch({ type: (v as ProductItemDef["type"]) ?? "string" })
            }
            value={def.type}
          />
          <TextInput
            description={tr(
              "settings.itemDefEditForm.itCanBeOverriddenWhenAssigned",
            )}
            label={<HelpLabel {...fieldHelp("productType", "default")} />}
            onChange={(e) => patch({ default: e.currentTarget.value })}
            placeholder={
              def.type === "boolean" ? "true / false" : tr("common.optional2")
            }
            value={def.default ?? ""}
          />
          <TextInput
            label={<HelpLabel {...fieldHelp("productType", "placeholder")} />}
            onChange={(e) => patch({ placeholder: e.currentTarget.value })}
            placeholder={tr("settings.itemDefEditForm.exampleInputEtcOptional")}
            value={def.placeholder ?? ""}
          />
        </SimpleGrid>

        <Switch
          checked={def.required}
          label={<HelpLabel {...fieldHelp("productType", "required")} />}
          mt="sm"
          onChange={(e) => patch({ required: e.currentTarget.checked })}
        />

        {def.type === "string" && (
          <TextInput
            description={tr(
              "settings.itemDefEditForm.aRegularExpressionConstrainingTheInput",
            )}
            error={
              error?.includes(tr("settings.itemDefEditForm.regularExpression"))
                ? error
                : undefined
            }
            label={<HelpLabel {...fieldHelp("productType", "pattern")} />}
            mt="sm"
            onChange={(e) =>
              patch({ pattern: e.currentTarget.value || undefined })
            }
            placeholder="^[A-Z]{2}-\d{4}$"
            value={def.pattern ?? ""}
          />
        )}

        {def.type === "number" && (
          <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
            <NumberInput
              label={
                <HelpLabel
                  {...fieldHelp("productType", "range", {
                    label: tr("common.minimum"),
                  })}
                />
              }
              onChange={(v) =>
                patch({ min: v === "" || v == null ? undefined : Number(v) })
              }
              value={def.min ?? ""}
            />
            <NumberInput
              label={
                <HelpLabel
                  {...fieldHelp("productType", "range", {
                    label: tr("common.maximum"),
                  })}
                />
              }
              onChange={(v) =>
                patch({ max: v === "" || v == null ? undefined : Number(v) })
              }
              value={def.max ?? ""}
            />
          </SimpleGrid>
        )}

        {def.type === "select" && (
          <Stack gap={4} mt="sm">
            <Text c="dimmed" size="xs">
              {tr("settings.itemDefEditForm.optionsValueWhatIsStoredLabel")}
            </Text>
            {(def.options ?? []).map((o, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: option rows have no stable id
              <Group gap="xs" key={i} wrap="nowrap">
                <TextInput
                  onChange={(e) =>
                    setOptions(
                      (def.options ?? []).map((x, j) =>
                        j === i ? { ...x, value: e.currentTarget.value } : x,
                      ),
                    )
                  }
                  placeholder={tr("common.value")}
                  style={{ flex: 1 }}
                  value={o.value}
                />
                <TextInput
                  onChange={(e) =>
                    setOptions(
                      (def.options ?? []).map((x, j) =>
                        j === i ? { ...x, label: e.currentTarget.value } : x,
                      ),
                    )
                  }
                  placeholder={tr("settings.itemDefEditForm.displayLabel")}
                  style={{ flex: 1 }}
                  value={o.label}
                />
                <ActionIcon
                  aria-label={tr("common.removeOption")}
                  color="red"
                  onClick={() =>
                    setOptions((def.options ?? []).filter((_, j) => j !== i))
                  }
                  variant="default"
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            ))}
            <GhostButton
              leftSection={<IconPlus size={12} />}
              onClick={() =>
                setOptions([...(def.options ?? []), { value: "", label: "" }])
              }
              size="compact-xs"
            >
              {tr("common.addAnOption")}
            </GhostButton>
          </Stack>
        )}

        {error && !error.includes(tr("common.key")) && (
          <Text c="red" mt="sm" size="sm">
            {error}
          </Text>
        )}
      </FormSection>

      <FormActions>
        <Group justify={isMobile ? "stretch" : "flex-end"}>
          <CancelButton
            fullWidth={isMobile}
            onClick={() => router.push(BASE)}
          />
          <SaveButton
            fullWidth={isMobile}
            loading={isPending}
            onClick={handleSave}
          >
            {tr("common.save2")}
          </SaveButton>
        </Group>
      </FormActions>
    </Stack>
  );
}
