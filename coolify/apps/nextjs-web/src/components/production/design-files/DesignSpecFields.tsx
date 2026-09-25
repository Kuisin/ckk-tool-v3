"use client";

/**
 * DesignSpecFields — 設計図の版の仕様を入れる欄（PD16 と版の詳細の「編集」）。
 *
 * 以前は製品マスタ (MS04) のフォームにあった「素材指定」「製品種別」「追加項目」を
 * ここへ移し、図面の表題欄（図面情報）を足したもの。組み立てと検証の規則は
 * lib/design-spec-core.ts が唯一の定義元で、サーバーも同じ関数を通す。
 *
 * 状態は親が持つ（制御コンポーネント）。図脳 SXF を読んだ値の差し込みも親が
 * applySxfReading で行う — 読み取りはファイルの欄で起きるので、欄どうしを
 * 親でつなぐほうが素直。
 */

import {
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Switch,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconMinus } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { searchStructuredMaterialTypeOptions } from "@/app/(dashboard)/_shared/option-search";
import { GhostButton } from "@/components/ui/buttons";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  TITLE_BLOCK_FIELDS,
  type TitleBlock,
  type TitleBlockField,
} from "@/lib/design-files-core";
import {
  applySpecValues,
  DIAMETER_MAX,
  DIAMETER_MIN,
  decomposeSpec,
  LENGTH_MAX,
  LENGTH_MIN,
  materialSpecErrors,
  mergeSpec,
  type SpecEditorState,
} from "@/lib/design-spec-core";
import type { Tr } from "@/lib/i18n";
import { diameterCodeFromMm, lengthCodeFromMm } from "@/lib/material-code";
import {
  defaultValuesFor,
  type ProductItemDef,
  type ResolvedProductType,
  validateItemValue,
} from "@/lib/product-types";
import {
  type SxfDrawingReading,
  sxfSpecPatch,
  sxfTitleBlock,
} from "@/lib/sxf-core";

/** 画面が持つ仕様の状態。 */
export interface DesignSpecFormState {
  materialTypeId: string | null;
  materialTypeLabel: string;
  diameterMm: number | null;
  lengthMm: number | null;
  editor: SpecEditorState;
  titleBlock: TitleBlock;
  notes: string;
}

/** 欄ごとのエラー（種別・追加項目はキー単位）。 */
export interface DesignSpecErrors {
  diameterMm?: string;
  lengthMm?: string;
  items?: Record<string, string>;
}

export function initialDesignSpecState(
  from: {
    materialTypeId: number | null;
    materialTypeLabel: string | null;
    diameterMm: number | null;
    lengthMm: number | null;
    spec: Record<string, string>;
    titleBlock: TitleBlock;
    notes: string | null;
  } | null,
  types: readonly ResolvedProductType[],
  defs: readonly ProductItemDef[],
): DesignSpecFormState {
  return {
    materialTypeId:
      from?.materialTypeId != null ? String(from.materialTypeId) : null,
    materialTypeLabel: from?.materialTypeLabel ?? "",
    diameterMm: from?.diameterMm ?? null,
    lengthMm: from?.lengthMm ?? null,
    editor: decomposeSpec(from?.spec ?? {}, types, defs),
    titleBlock: { ...(from?.titleBlock ?? {}) },
    notes: from?.notes ?? "",
  };
}

/** 状態 → サーバーへ送る形（lib/design-spec.ts versionSpecSchema）。 */
export function toVersionSpecPayload(
  s: DesignSpecFormState,
  types: readonly ResolvedProductType[],
) {
  return {
    materialTypeId: s.materialTypeId ? Number(s.materialTypeId) : null,
    diameterMm: s.diameterMm,
    lengthMm: s.lengthMm,
    spec: mergeSpec(s.editor, types),
    titleBlock: s.titleBlock,
    notes: s.notes.trim() || null,
  };
}

/** 保存前の検証（サーバーでも同じ規則で見る）。 */
export function validateDesignSpec(
  s: DesignSpecFormState,
  types: readonly ResolvedProductType[],
  defs: readonly ProductItemDef[],
  tr: Tr,
): DesignSpecErrors | null {
  const errors: DesignSpecErrors = {
    ...materialSpecErrors(s, tr),
    items: {},
  };
  const type = types.find((t) => t.id === s.editor.typeId);
  for (const it of type?.items ?? []) {
    const msg = validateItemValue(it, s.editor.typeValues[it.key], tr);
    if (msg && errors.items) errors.items[it.key] = msg;
  }
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  for (const k of s.editor.extraKeys) {
    const def = defByKey.get(k);
    if (!def) continue;
    const msg = validateItemValue(def, s.editor.extraValues[k], tr);
    if (msg && errors.items) errors.items[k] = msg;
  }
  const hasItemErrors = Object.keys(errors.items ?? {}).length > 0;
  return errors.diameterMm || errors.lengthMm || hasItemErrors ? errors : null;
}

/**
 * 図脳 SXF の読み取り結果を差し込む。**読めた欄だけ上書きする**（空の欄は
 * 触らない）— 手で入れた値を、図面に書かれていない項目で消さない。
 */
export function applySxfReading(
  s: DesignSpecFormState,
  reading: SxfDrawingReading,
  types: readonly ResolvedProductType[],
  defs: readonly ProductItemDef[],
): { state: DesignSpecFormState; filled: number } {
  const patch = sxfSpecPatch(reading, defs);
  const title = sxfTitleBlock(reading);
  const next: DesignSpecFormState = {
    ...s,
    diameterMm: patch.diameterMm ?? s.diameterMm,
    lengthMm: patch.lengthMm ?? s.lengthMm,
    editor: applySpecValues(s.editor, patch.specValues, types),
    titleBlock: { ...s.titleBlock, ...title },
  };
  const filled =
    (patch.diameterMm != null ? 1 : 0) +
    (patch.lengthMm != null ? 1 : 0) +
    Object.keys(patch.specValues).length +
    Object.keys(title).length;
  return { state: next, filled };
}

const typeLabel = (t: ResolvedProductType) => t.name.ja || t.name.en || t.id;

export function DesignSpecFields({
  value,
  onChange,
  errors,
  productTypes,
  itemDefs,
}: {
  value: DesignSpecFormState;
  onChange: (next: DesignSpecFormState) => void;
  errors?: DesignSpecErrors | null;
  productTypes: ResolvedProductType[];
  itemDefs: ProductItemDef[];
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();
  const set = (patch: Partial<DesignSpecFormState>) =>
    onChange({ ...value, ...patch });
  const setEditor = (patch: Partial<SpecEditorState>) =>
    set({ editor: { ...value.editor, ...patch } });

  const defByKey = new Map(itemDefs.map((d) => [d.key, d]));
  const selectedType =
    productTypes.find((t) => t.id === value.editor.typeId) ?? null;
  const typeOptions = productTypes
    .filter((t) => t.enabled || t.id === value.editor.typeId)
    .map((t) => ({ value: t.id, label: typeLabel(t) }));
  const typeItemKeys = new Set(selectedType?.items.map((i) => i.key) ?? []);
  const addableOptions = itemDefs
    .filter(
      (d) =>
        d.enabled &&
        !typeItemKeys.has(d.key) &&
        !value.editor.extraKeys.includes(d.key),
    )
    .map((d) => ({ value: d.key, label: d.label.ja || d.key }));

  const onTypeChange = (id: string | null) => {
    const t = productTypes.find((x) => x.id === id) ?? null;
    const keys = new Set(t?.items.map((i) => i.key) ?? []);
    setEditor({
      typeId: id,
      typeValues: t ? defaultValuesFor(t) : {},
      // 種別に含まれる項目は追加項目から外す（重複防止）。
      extraKeys: value.editor.extraKeys.filter((k) => !keys.has(k)),
    });
  };

  const setTitle = (field: TitleBlockField, v: string) =>
    set({ titleBlock: { ...value.titleBlock, [field]: v } });

  return (
    <>
      <FormSection
        description={tr("production.designVersion.titleBlockHint")}
        title={tr("production.designVersion.titleBlock")}
      >
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="sm">
          {TITLE_BLOCK_FIELDS.map((f) => (
            <TextInput
              key={f}
              label={tr(`production.designVersion.titleBlockField.${f}`)}
              onChange={(e) => setTitle(f, e.currentTarget.value)}
              value={value.titleBlock[f] ?? ""}
            />
          ))}
        </SimpleGrid>
      </FormSection>

      <FormSection
        description={tr("master.products.theMaterialAProductNeedsIs")}
        title={tr("common.materialSpecification")}
      >
        <SearchSelect
          description={tr("common.onlyConvertedMaterialTypesWithA")}
          initialOption={
            value.materialTypeId
              ? { value: value.materialTypeId, label: value.materialTypeLabel }
              : undefined
          }
          label={tr("common.materialTypes")}
          onChange={(v, option) =>
            set({ materialTypeId: v, materialTypeLabel: option?.label ?? "" })
          }
          onSearch={searchStructuredMaterialTypeOptions}
          placeholder={tr("common.searchByMaterialTypeCodeOr")}
          storageKey="design-version-material-type"
          value={value.materialTypeId}
        />
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <NumberInput
            decimalScale={3}
            description={tr("master.productForm.diameterCodeLabel", {
              code:
                value.diameterMm != null &&
                value.diameterMm >= DIAMETER_MIN &&
                value.diameterMm <= DIAMETER_MAX
                  ? diameterCodeFromMm(value.diameterMm)
                  : "—",
            })}
            error={errors?.diameterMm}
            label={tr("common.diameterMm")}
            max={DIAMETER_MAX}
            min={DIAMETER_MIN}
            onChange={(v) =>
              set({ diameterMm: v === "" || v == null ? null : Number(v) })
            }
            step={0.1}
            value={value.diameterMm ?? ""}
          />
          <NumberInput
            decimalScale={3}
            description={tr("master.productForm.lengthCodeLabel", {
              code:
                value.lengthMm != null &&
                value.lengthMm >= LENGTH_MIN &&
                value.lengthMm <= LENGTH_MAX
                  ? lengthCodeFromMm(value.lengthMm)
                  : "—",
            })}
            error={errors?.lengthMm}
            label={tr("common.overallLengthMm")}
            max={LENGTH_MAX}
            min={LENGTH_MIN}
            onChange={(v) =>
              set({ lengthMm: v === "" || v == null ? null : Number(v) })
            }
            value={value.lengthMm ?? ""}
          />
        </SimpleGrid>
      </FormSection>

      {typeOptions.length > 0 && (
        <FormSection
          description={tr("master.products.choosingATypeUnfoldsTheInput")}
          title={tr("common.productTypes")}
        >
          <Select
            clearable
            data={typeOptions}
            description={
              selectedType?.description ||
              tr("master.products.selectATypeOptional")
            }
            label={tr("common.productTypes")}
            onChange={onTypeChange}
            placeholder={tr("common.selectAType")}
            value={value.editor.typeId}
          />
          {selectedType && selectedType.items.length > 0 && (
            <SimpleGrid cols={isMobile ? 1 : 2} mt="md" spacing="sm">
              {selectedType.items.map((it) => (
                <SpecItemInput
                  error={errors?.items?.[it.key]}
                  item={it}
                  key={it.key}
                  onChange={(v) =>
                    setEditor({
                      typeValues: { ...value.editor.typeValues, [it.key]: v },
                    })
                  }
                  value={value.editor.typeValues[it.key] ?? ""}
                />
              ))}
            </SimpleGrid>
          )}
        </FormSection>
      )}

      {(value.editor.extraKeys.length > 0 || addableOptions.length > 0) && (
        <FormSection
          description={tr("master.products.onlyFieldsDefinedUnderProductItems")}
          title={tr("master.products.extraFields")}
        >
          {value.editor.extraKeys.length > 0 && (
            <SimpleGrid cols={isMobile ? 1 : 2} mb="sm" spacing="sm">
              {value.editor.extraKeys.map((key) => {
                const def = defByKey.get(key);
                if (!def) return null;
                return (
                  <Group align="flex-end" gap="xs" key={key} wrap="nowrap">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <SpecItemInput
                        error={errors?.items?.[key]}
                        item={def}
                        onChange={(v) =>
                          setEditor({
                            extraValues: {
                              ...value.editor.extraValues,
                              [key]: v,
                            },
                          })
                        }
                        value={value.editor.extraValues[key] ?? ""}
                      />
                    </div>
                    <GhostButton
                      aria-label={tr("master.products.removeThisField")}
                      color="red"
                      onClick={() =>
                        setEditor({
                          extraKeys: value.editor.extraKeys.filter(
                            (k) => k !== key,
                          ),
                        })
                      }
                      px={6}
                    >
                      <IconMinus size={14} />
                    </GhostButton>
                  </Group>
                );
              })}
            </SimpleGrid>
          )}
          <Select
            clearable
            data={addableOptions}
            disabled={addableOptions.length === 0}
            label={tr("common.addAnItem")}
            onChange={(key) => {
              if (!key) return;
              const def = defByKey.get(key);
              setEditor({
                extraKeys: [...value.editor.extraKeys, key],
                extraValues: {
                  ...value.editor.extraValues,
                  [key]: value.editor.extraValues[key] ?? def?.default ?? "",
                },
              });
            }}
            placeholder={
              addableOptions.length === 0
                ? tr("master.products.thereAreNoFieldsLeftTo")
                : tr("master.products.selectAFieldAndAddIt")
            }
            searchable
            value={null}
          />
        </FormSection>
      )}

      <FormSection title={tr("common.memo")}>
        <Textarea
          autosize
          label={tr("common.memo")}
          minRows={2}
          onChange={(e) => set({ notes: e.currentTarget.value })}
          placeholder={tr(
            "production.designFiles.whatChangedInThisVersionOptional",
          )}
          value={value.notes}
        />
      </FormSection>
    </>
  );
}

/** 製品項目を型に応じた入力で描画する。値は文字列表現で保持する。 */
function SpecItemInput({
  item,
  value,
  error,
  onChange,
}: {
  item: ProductItemDef;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const tr = useTranslations();
  const label = item.label.ja || item.label.en || item.key;
  const common = { label, withAsterisk: item.required, error };
  switch (item.type) {
    case "number":
      return (
        <NumberInput
          {...common}
          max={item.max}
          min={item.min}
          onChange={(v) => onChange(v === "" || v == null ? "" : String(v))}
          placeholder={item.placeholder}
          value={value === "" ? "" : Number(value)}
        />
      );
    case "boolean":
      return (
        <Switch
          checked={value === "true"}
          description={error}
          label={label}
          mt="lg"
          onChange={(e) => onChange(e.currentTarget.checked ? "true" : "false")}
        />
      );
    case "select":
      return (
        <Select
          {...common}
          clearable={!item.required}
          data={(item.options ?? []).map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          onChange={(v) => onChange(v ?? "")}
          placeholder={item.placeholder ?? tr("common.select")}
          value={value || null}
        />
      );
    case "date":
      return (
        <TextInput
          {...common}
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder="YYYY-MM-DD"
          type="date"
          value={value}
        />
      );
    default:
      return (
        <TextInput
          {...common}
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder={item.placeholder}
          value={value}
        />
      );
  }
}
