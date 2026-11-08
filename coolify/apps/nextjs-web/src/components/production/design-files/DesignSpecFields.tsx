"use client";

/**
 * DesignSpecFields — 設計図の版の仕様を入れる欄（PD16 と版の詳細の「編集」）。
 *
 * 以前は製品マスタ (MS04) のフォームにあった「素材指定」「製品種別」「追加項目」を
 * ここへ移し、図面の表題欄（図面情報）を足したもの。組み立てと検証の規則は
 * lib/design-spec-core.ts が唯一の定義元で、サーバーも同じ関数を通す。
 *
 * **図面から読み取った欄は読み取り専用**（lib/design-extract-core.ts）。欄ごとの
 * 「手入力」で上書きでき、上書きしても図面の値は欄の下に参照として残る。
 * 「図面の値に戻す」で読み取り専用へ戻る。
 *
 * 状態は親が持つ（制御コンポーネント）。図脳 SXF を読んだ値の差し込みも親が
 * applySxfReading で行う — 読み取りはファイルの欄で起きるので、欄どうしを
 * 親でつなぐほうが素直。
 *
 * `flat` にすると節をカードにせず見出し + 区切り線で並べる。すでにカードの中に
 * 置く画面（版の詳細の「編集」）でカードを入れ子にしないため。
 */

import {
  Alert,
  Badge,
  Divider,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconArrowBackUp,
  IconFileSearch,
  IconMinus,
  IconPencil,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { searchStructuredMaterialTypeOptions } from "@/app/(dashboard)/_shared/option-search";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { GhostButton } from "@/components/ui/buttons";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  type DesignExtract,
  extractCounts,
  extractedValue,
  extractFromSxf,
  isLocked,
  replaceExtract,
  setOverride,
} from "@/lib/design-extract-core";
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
import type { SxfDrawingReading } from "@/lib/sxf-core";

/** 画面が持つ仕様の状態。 */
export interface DesignSpecFormState {
  materialTypeId: string | null;
  materialTypeLabel: string;
  diameterMm: number | null;
  lengthMm: number | null;
  editor: SpecEditorState;
  titleBlock: TitleBlock;
  notes: string;
  /** 図面から読み取った値（読み取り専用・手入力の別もここ）。 */
  extract: DesignExtract | null;
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
    extract?: DesignExtract | null;
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
    extract: from?.extract ?? null,
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
    extract: s.extract,
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
 * 読み取り専用の欄を図面の値に揃える（手入力にした欄には触らない）。
 * lib/design-extract-core enforceExtract の画面の状態版。
 */
function enforceForm(
  s: DesignSpecFormState,
  types: readonly ResolvedProductType[],
): DesignSpecFormState {
  const ex = s.extract;
  if (!ex) return s;
  const next: DesignSpecFormState = { ...s, titleBlock: { ...s.titleBlock } };
  const specValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(ex.values)) {
    if (ex.overridden.includes(key)) continue;
    if (key === "diameterMm") next.diameterMm = Number(value);
    else if (key === "lengthMm") next.lengthMm = Number(value);
    else if (key.startsWith("titleBlock.")) {
      next.titleBlock[key.slice("titleBlock.".length) as TitleBlockField] =
        value;
    } else if (key.startsWith("spec.")) {
      specValues[key.slice("spec.".length)] = value;
    }
  }
  next.editor = applySpecValues(next.editor, specValues, types);
  return next;
}

/**
 * 図脳 SXF の読み取り結果を差し込む。読み取った欄は読み取り専用になり、
 * **手入力にしていた欄はそのまま**（人が決めた値を図面で消さない）。
 * 図面に書かれていない欄は触らない。
 */
export function applySxfReading(
  s: DesignSpecFormState,
  reading: SxfDrawingReading,
  types: readonly ResolvedProductType[],
  defs: readonly ProductItemDef[],
  fileName: string | null = null,
): { state: DesignSpecFormState; filled: number } {
  const extract = replaceExtract(
    s.extract,
    extractFromSxf(reading, defs, fileName, new Date()),
  );
  return {
    state: enforceForm({ ...s, extract }, types),
    filled: Object.keys(extract.values).length,
  };
}

const typeLabel = (t: ResolvedProductType) => t.name.ja || t.name.en || t.id;

export function DesignSpecFields({
  value,
  onChange,
  errors,
  productTypes,
  itemDefs,
  flat = false,
}: {
  value: DesignSpecFormState;
  onChange: (next: DesignSpecFormState) => void;
  errors?: DesignSpecErrors | null;
  productTypes: ResolvedProductType[];
  itemDefs: ProductItemDef[];
  /** 節をカードにしない（すでにカードの中に置くとき）。 */
  flat?: boolean;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const set = (patch: Partial<DesignSpecFormState>) =>
    onChange({ ...value, ...patch });
  const setEditor = (patch: Partial<SpecEditorState>) =>
    set({ editor: { ...value.editor, ...patch } });

  const ex = value.extract;
  const locked = (key: string) => isLocked(ex, key);

  /** 手入力の切り替え。戻すときは図面の値へ揃え直す。 */
  const toggleOverride = (key: string, on: boolean) => {
    if (!ex) return;
    onChange(
      enforceForm(
        { ...value, extract: setOverride(ex, key, on) },
        productTypes,
      ),
    );
  };

  /**
   * 欄の説明に出す「図面から」の印と切り替え。読み取っていない欄は何も出さない。
   * 読み取り専用 = 「図面から」+「手入力」／手入力 = 図面の値 +「図面の値に戻す」。
   */
  const extractNote = (key: string, display?: (v: string) => string) => {
    const raw = extractedValue(ex, key);
    if (raw == null) return undefined;
    const shown = display ? display(raw) : raw;
    return locked(key) ? (
      <Group component="span" gap={6} wrap="wrap">
        <Badge color="blue" component="span" size="xs" variant="light">
          {tr("production.designVersion.extract.fromDrawing")}
        </Badge>
        <GhostButton
          leftSection={<IconPencil size={12} />}
          onClick={() => toggleOverride(key, true)}
          size="compact-xs"
        >
          {tr("production.designVersion.extract.editManually")}
        </GhostButton>
      </Group>
    ) : (
      <Group component="span" gap={6} wrap="wrap">
        <Badge color="orange" component="span" size="xs" variant="light">
          {tr("production.designVersion.extract.manual")}
        </Badge>
        <Text c="dimmed" component="span" size="xs">
          {tr("production.designVersion.extract.drawingValue", {
            value: shown,
          })}
        </Text>
        <GhostButton
          leftSection={<IconArrowBackUp size={12} />}
          onClick={() => toggleOverride(key, false)}
          size="compact-xs"
        >
          {tr("production.designVersion.extract.revert")}
        </GhostButton>
      </Group>
    );
  };

  /** 読み取り専用の欄の見た目（入力できないことが一目で判るように塗る）。 */
  const lockProps = (key: string) =>
    locked(key) ? { readOnly: true, variant: "filled" as const } : {};

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
    onChange(
      enforceForm(
        {
          ...value,
          editor: {
            ...value.editor,
            typeId: id,
            typeValues: t ? defaultValuesFor(t) : {},
            // 種別に含まれる項目は追加項目から外す（重複防止）。
            extraKeys: value.editor.extraKeys.filter((k) => !keys.has(k)),
          },
        },
        productTypes,
      ),
    );
  };

  const setTitle = (field: TitleBlockField, v: string) =>
    set({ titleBlock: { ...value.titleBlock, [field]: v } });

  const counts = extractCounts(ex);

  return (
    <>
      {ex && (
        <Alert
          color="blue"
          icon={<IconFileSearch size={16} />}
          title={tr("production.designVersion.extract.summaryTitle", {
            file: ex.source.fileName ?? ex.source.sheetNumber ?? "—",
          })}
        >
          <Stack gap={4}>
            <Text size="xs">
              {tr("production.designVersion.extract.summaryCounts", {
                read: counts.read,
                overridden: counts.overridden,
                at: fmt.dateTime(ex.source.readAt),
              })}
            </Text>
            <Text c="dimmed" size="xs">
              {tr("production.designVersion.extract.summaryHint")}
            </Text>
            <Group>
              <GhostButton
                c="red"
                onClick={() => set({ extract: null })}
                size="compact-xs"
              >
                {tr("production.designVersion.extract.detach")}
              </GhostButton>
            </Group>
          </Stack>
        </Alert>
      )}

      <Section
        description={tr("production.designVersion.titleBlockHint")}
        flat={flat}
        title={tr("production.designVersion.titleBlock")}
      >
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="sm">
          {TITLE_BLOCK_FIELDS.map((f) => {
            const key = `titleBlock.${f}`;
            return (
              <TextInput
                description={extractNote(key)}
                key={f}
                label={tr(`production.designVersion.titleBlockField.${f}`)}
                onChange={(e) => setTitle(f, e.currentTarget.value)}
                value={value.titleBlock[f] ?? ""}
                {...lockProps(key)}
              />
            );
          })}
        </SimpleGrid>
      </Section>

      <Section
        description={tr("master.products.theMaterialAProductNeedsIs")}
        flat={flat}
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
            description={
              extractNote("diameterMm", (v) => `φ${v}`) ??
              tr("master.productForm.diameterCodeLabel", {
                code:
                  value.diameterMm != null &&
                  value.diameterMm >= DIAMETER_MIN &&
                  value.diameterMm <= DIAMETER_MAX
                    ? diameterCodeFromMm(value.diameterMm)
                    : "—",
              })
            }
            error={errors?.diameterMm}
            label={tr("common.diameterMm")}
            max={DIAMETER_MAX}
            min={DIAMETER_MIN}
            onChange={(v) =>
              set({ diameterMm: v === "" || v == null ? null : Number(v) })
            }
            step={0.1}
            value={value.diameterMm ?? ""}
            {...lockProps("diameterMm")}
          />
          <NumberInput
            decimalScale={3}
            description={
              extractNote("lengthMm") ??
              tr("master.productForm.lengthCodeLabel", {
                code:
                  value.lengthMm != null &&
                  value.lengthMm >= LENGTH_MIN &&
                  value.lengthMm <= LENGTH_MAX
                    ? lengthCodeFromMm(value.lengthMm)
                    : "—",
              })
            }
            error={errors?.lengthMm}
            label={tr("common.overallLengthMm")}
            max={LENGTH_MAX}
            min={LENGTH_MIN}
            onChange={(v) =>
              set({ lengthMm: v === "" || v == null ? null : Number(v) })
            }
            value={value.lengthMm ?? ""}
            {...lockProps("lengthMm")}
          />
        </SimpleGrid>
      </Section>

      {typeOptions.length > 0 && (
        <Section
          description={tr("master.products.choosingATypeUnfoldsTheInput")}
          flat={flat}
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
                  description={extractNote(`spec.${it.key}`)}
                  error={errors?.items?.[it.key]}
                  item={it}
                  key={it.key}
                  onChange={(v) =>
                    setEditor({
                      typeValues: { ...value.editor.typeValues, [it.key]: v },
                    })
                  }
                  readOnly={locked(`spec.${it.key}`)}
                  value={value.editor.typeValues[it.key] ?? ""}
                />
              ))}
            </SimpleGrid>
          )}
        </Section>
      )}

      {(value.editor.extraKeys.length > 0 || addableOptions.length > 0) && (
        <Section
          description={tr("master.products.onlyFieldsDefinedUnderProductItems")}
          flat={flat}
          title={tr("master.products.extraFields")}
        >
          {value.editor.extraKeys.length > 0 && (
            <SimpleGrid cols={isMobile ? 1 : 2} mb="sm" spacing="sm">
              {value.editor.extraKeys.map((key) => {
                const def = defByKey.get(key);
                if (!def) return null;
                const exKey = `spec.${key}`;
                return (
                  <Group align="flex-end" gap="xs" key={key} wrap="nowrap">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <SpecItemInput
                        description={extractNote(exKey)}
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
                        readOnly={locked(exKey)}
                        value={value.editor.extraValues[key] ?? ""}
                      />
                    </div>
                    {/* 図面から読んだ項目は外せない（外しても保存で戻るため）。 */}
                    {!locked(exKey) && (
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
                    )}
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
        </Section>
      )}

      <Section flat={flat} title={tr("common.memo")}>
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
      </Section>
    </>
  );
}

/** 節。`flat` なら見出し + 区切り線だけ（カードを入れ子にしない）。 */
function Section({
  flat,
  title,
  description,
  children,
}: {
  flat: boolean;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  if (!flat) {
    return (
      <FormSection description={description} title={title}>
        {children}
      </FormSection>
    );
  }
  return (
    <Stack gap={0}>
      <Title mb={description ? 2 : "xs"} order={5}>
        {title}
      </Title>
      {description && (
        <Text c="dimmed" mb="xs" size="xs">
          {description}
        </Text>
      )}
      <Divider mb="sm" />
      {children}
    </Stack>
  );
}

/** 製品項目を型に応じた入力で描画する。値は文字列表現で保持する。 */
function SpecItemInput({
  item,
  value,
  error,
  description,
  readOnly = false,
  onChange,
}: {
  item: ProductItemDef;
  value: string;
  error?: string;
  description?: ReactNode;
  /** 図面から読んだ値で固定されている。 */
  readOnly?: boolean;
  onChange: (v: string) => void;
}) {
  const tr = useTranslations();
  const label = item.label.ja || item.label.en || item.key;
  const common = {
    label,
    withAsterisk: item.required,
    error,
    description,
    ...(readOnly ? { readOnly: true, variant: "filled" as const } : {}),
  };
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
          description={error ?? description}
          disabled={readOnly}
          label={label}
          mt="lg"
          onChange={(e) => onChange(e.currentTarget.checked ? "true" : "false")}
        />
      );
    case "select":
      return (
        <Select
          {...common}
          clearable={!item.required && !readOnly}
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
