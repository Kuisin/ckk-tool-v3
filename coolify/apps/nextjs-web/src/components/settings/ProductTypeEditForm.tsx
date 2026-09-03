"use client";

/**
 * ProductTypeEditForm — 製品項目（SY03）の製品種別を 1 件編集する。
 * 種別の基本情報 + 項目の割り当て（項目定義の参照 + 任意の既定値上書き）を編集。
 * 保存で種別配列全体を updateProductTypes。
 */

import {
  ActionIcon,
  Group,
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
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateProductTypes } from "@/app/(dashboard)/settings/actions";
import { CancelButton, GhostButton, SaveButton } from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormActions, FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { fieldHelp } from "@/lib/field-help";
import {
  type ProductItemDef,
  type ProductType,
  type ProductTypeAssignment,
  productFieldTypeLabel,
} from "@/lib/product-types";

const BASE = "/settings/product-types";

function newId(): string {
  return crypto.randomUUID();
}

export function ProductTypeEditForm({
  allTypes,
  typeId,
  defs,
}: {
  allTypes: ProductType[];
  typeId?: string;
  defs: ProductItemDef[];
}) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = typeId != null;
  const existing = allTypes.find((t) => t.id === typeId);

  const [type, setType] = useState<ProductType>(
    existing ?? {
      id: newId(),
      name: { ja: "", en: "" },
      description: "",
      enabled: true,
      order: allTypes.length,
      assignments: [],
    },
  );
  const [error, setError] = useState<string | null>(null);

  const defByKey = new Map(defs.map((d) => [d.key, d]));
  const defOptions = defs
    .filter((d) => d.enabled)
    .map((d) => ({
      value: d.key,
      label: `${d.label.ja || d.key}（${productFieldTypeLabel(d.type, tr)}）`,
    }));

  const patch = (p: Partial<ProductType>) => setType((t) => ({ ...t, ...p }));

  const setAssignments = (assignments: ProductTypeAssignment[]) =>
    patch({ assignments: assignments.map((a, i) => ({ ...a, order: i })) });

  const patchAssign = (i: number, p: Partial<ProductTypeAssignment>) =>
    setAssignments(
      type.assignments.map((a, j) => (j === i ? { ...a, ...p } : a)),
    );

  const addAssign = () =>
    setAssignments([
      ...type.assignments,
      { itemKey: "", order: type.assignments.length },
    ]);

  const removeAssign = (i: number) =>
    setAssignments(type.assignments.filter((_, j) => j !== i));

  const moveAssign = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= type.assignments.length) return;
    const next = type.assignments.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setAssignments(next);
  };

  const handleSave = () => {
    if (!type.name.ja.trim())
      return setError(
        tr("settings.productTypeEditForm.enterTheTypeNameInJapanese"),
      );
    const seen = new Set<string>();
    for (const a of type.assignments) {
      if (!a.itemKey)
        return setError(
          tr("settings.productTypeEditForm.selectTheFieldToAssign"),
        );
      if (seen.has(a.itemKey))
        return setError(
          tr("settings.productTypeEditForm.theSameFieldIsAssignedTwice"),
        );
      seen.add(a.itemKey);
    }
    setError(null);

    const next = isEdit
      ? allTypes.map((t) => (t.id === typeId ? type : t))
      : [...allTypes, type];

    startTransition(async () => {
      const res = await updateProductTypes(next);
      if (res.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: isEdit
            ? tr("settings.productTypeEditForm.theProductTypeWasUpdated")
            : tr("settings.productTypeEditForm.theProductTypeWasCreated"),
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
          { label: tr("common.productTypes"), href: BASE },
          isEdit
            ? tr("settings.productTypeEditForm.editType")
            : tr("settings.productTypeEditForm.addAType"),
        ]}
        title={
          isEdit
            ? tr("settings.productTypeEditForm.editTypeName", {
                name: type.name.ja || type.id,
              })
            : tr("settings.productTypeEditForm.addAType")
        }
      />

      <FormSection title={tr("settings.productTypeEditForm.typeInformation")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp(tr, "productType", "typeName", {
                  label: tr("settings.productTypeEditForm.typeNameJapanese"),
                })}
              />
            }
            onChange={(e) =>
              patch({ name: { ...type.name, ja: e.currentTarget.value } })
            }
            placeholder={tr("settings.productTypeEditForm.eGStandardItem")}
            value={type.name.ja}
            withAsterisk
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp(tr, "productType", "typeName", {
                  label: tr("settings.productTypeEditForm.typeNameEnglish"),
                })}
              />
            }
            onChange={(e) =>
              patch({ name: { ...type.name, en: e.currentTarget.value } })
            }
            placeholder="e.g. Standard"
            value={type.name.en}
          />
        </SimpleGrid>
        <Textarea
          label={
            <HelpLabel {...fieldHelp(tr, "productType", "typeDescription")} />
          }
          mt="sm"
          onChange={(e) => patch({ description: e.currentTarget.value })}
          placeholder={tr("settings.productTypeEditForm.whatThisTypeIsForEtc")}
          rows={2}
          value={type.description ?? ""}
        />
        <Switch
          checked={type.enabled}
          label={
            <HelpLabel
              {...fieldHelp(tr, "productType", "typeActive", {
                label: tr(
                  "settings.productTypeEditForm.enabledOfferedWhenCreatingAProduct",
                ),
              })}
            />
          }
          mt="sm"
          onChange={(e) => patch({ enabled: e.currentTarget.checked })}
        />
      </FormSection>

      <FormSection
        description={tr(
          "settings.productTypeEditForm.assignedFromTheFieldDefinitionLibrary",
        )}
        title={tr("settings.productTypeEditForm.assignedFields")}
      >
        <Stack gap="sm">
          {type.assignments.length === 0 && (
            <Text c="dimmed" size="sm">
              {tr("settings.productTypeEditForm.noFieldsAreAssignedYet")}
            </Text>
          )}
          {type.assignments.map((a, i) => {
            const def = defByKey.get(a.itemKey);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: assignment rows have no stable id
              <Paper key={i} p="sm" radius="sm" withBorder>
                <Group align="flex-end" gap="sm" wrap="nowrap">
                  <Select
                    data={defOptions}
                    label={
                      <HelpLabel
                        {...fieldHelp(tr, "productType", "typeItems")}
                      />
                    }
                    onChange={(v) => patchAssign(i, { itemKey: v ?? "" })}
                    placeholder={tr("common.selectAnItem")}
                    searchable
                    style={{ flex: 1 }}
                    value={a.itemKey || null}
                  />
                  {def?.type === "select" ? (
                    <Select
                      clearable
                      data={(def.options ?? []).map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                      description={tr(
                        "settings.productTypeEditForm.defaultOverrideOptional",
                      )}
                      label={
                        <HelpLabel
                          {...fieldHelp(tr, "productType", "typeDefault")}
                        />
                      }
                      onChange={(v) =>
                        patchAssign(i, { defaultValue: v || undefined })
                      }
                      placeholder={def.default ?? tr("common.optional2")}
                      style={{ flex: 1 }}
                      value={a.defaultValue ?? null}
                    />
                  ) : (
                    <TextInput
                      description={
                        def?.default
                          ? tr(
                              "settings.productTypeEditForm.defaultValueIfEmptyDefault",
                              { default: def.default },
                            )
                          : tr("common.optional")
                      }
                      label={
                        <HelpLabel
                          {...fieldHelp(tr, "productType", "typeDefault")}
                        />
                      }
                      onChange={(e) =>
                        patchAssign(i, {
                          defaultValue: e.currentTarget.value || undefined,
                        })
                      }
                      placeholder={def?.default ?? tr("common.optional2")}
                      style={{ flex: 1 }}
                      value={a.defaultValue ?? ""}
                    />
                  )}
                  <ActionIcon.Group>
                    <ActionIcon
                      aria-label={tr("common.moveUp")}
                      disabled={i === 0}
                      onClick={() => moveAssign(i, -1)}
                      variant="default"
                    >
                      <IconArrowUp size={16} />
                    </ActionIcon>
                    <ActionIcon
                      aria-label={tr("common.moveDown")}
                      disabled={i === type.assignments.length - 1}
                      onClick={() => moveAssign(i, 1)}
                      variant="default"
                    >
                      <IconArrowDown size={16} />
                    </ActionIcon>
                    <ActionIcon
                      aria-label={tr(
                        "settings.productTypeEditForm.removeTheAssignment",
                      )}
                      color="red"
                      onClick={() => removeAssign(i)}
                      variant="default"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </ActionIcon.Group>
                </Group>
              </Paper>
            );
          })}
          <GhostButton
            fullWidth={isMobile}
            leftSection={<IconPlus size={14} />}
            onClick={addAssign}
          >
            {tr("settings.productTypeEditForm.assignAField")}
          </GhostButton>
          {defOptions.length === 0 && (
            <Text c="dimmed" size="xs">
              {tr("settings.productTypeEditForm.thereAreNoFieldsToAssign")}
            </Text>
          )}
        </Stack>
      </FormSection>

      {error && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}

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
