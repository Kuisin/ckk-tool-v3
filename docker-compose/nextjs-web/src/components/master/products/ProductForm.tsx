"use client";

/**
 * ProductForm.tsx — 製品 新規作成 / 編集フォーム (MS13 / MS23).
 *
 * 製品コードは保存時に自動採番（PRD-YYYYMM-NNNN）。
 * 製品種別（SY05）を選ぶと、その種別が予め定義した入力項目が型付き（文字列/数値/
 * 真偽/選択/日付）で展開される。種別外の値は「追加項目」で 製品項目（SY04）で定義済みの
 * 項目のみを選んで追加できる（自由なキーは不可）。値は入力を型で検証し product.spec
 * （JSON）に保存。種別 id は予約キー `_product_type` に保持（編集時に再展開）。定義外の
 * 旧 spec キーは編集画面では触らず、そのまま保持する。
 */

import {
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconMinus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { z } from "zod";
import { searchStructuredMaterialTypeOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  createProduct,
  updateProduct,
} from "@/app/(dashboard)/master/products/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { GhostButton } from "@/components/ui/buttons";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { UNIT_OPTIONS } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";
import { diameterCodeFromMm, lengthCodeFromMm } from "@/lib/material-code";
import {
  defaultValuesFor,
  PRODUCT_TYPE_SPEC_KEY,
  type ProductItemDef,
  type ResolvedProductType,
  validateItemValue,
} from "@/lib/product-types";

const BASE_PATH = "/master/products";

// 直径/全長の許容範囲（素材ビルダーと同じ）。
const DIAMETER_MIN = 0.1;
const DIAMETER_MAX = 99.9;
const LENGTH_MIN = 1;
const LENGTH_MAX = 999;

const productSchema = z
  .object({
    nameJa: z.string().min(1, "名称（日本語）を入力してください"),
    nameEn: z.string(),
    materialTypeId: z.string().nullable(),
    materialTypeLabel: z.string(),
    diameterMm: z.number().nullable(),
    lengthMm: z.number().nullable(),
    unit: z.string().min(1, "単位を選択してください"),
    isActive: z.boolean(),
    notes: z.string(),
    spec: z.array(z.object({ key: z.string(), value: z.string() })),
  })
  .superRefine((v, ctx) => {
    if (!v.materialTypeId) return;
    if (
      v.diameterMm == null ||
      v.diameterMm < DIAMETER_MIN ||
      v.diameterMm > DIAMETER_MAX
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["diameterMm"],
        message: `直径は ${DIAMETER_MIN}〜${DIAMETER_MAX}mm で入力してください`,
      });
    }
    if (
      v.lengthMm == null ||
      v.lengthMm < LENGTH_MIN ||
      v.lengthMm > LENGTH_MAX
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lengthMm"],
        message: `全長は ${LENGTH_MIN}〜${LENGTH_MAX}mm で入力してください`,
      });
    }
  });

type FormValues = z.infer<typeof productSchema>;

export interface ProductFormInitial {
  id: number;
  code: string | null;
  nameJa: string;
  nameEn: string;
  materialTypeId: string | null;
  materialTypeLabel: string;
  diameterMm: number | null;
  lengthMm: number | null;
  unit: string;
  isActive: boolean;
  notes: string;
  spec: { key: string; value: string }[];
}

const typeLabel = (t: ResolvedProductType) => t.name.ja || t.name.en || t.id;

export function ProductForm({
  initial,
  productTypes,
  itemDefs,
}: {
  initial?: ProductFormInitial;
  productTypes: ResolvedProductType[];
  /** 製品項目（SY04）で定義された入力項目ライブラリ。追加項目の候補になる。 */
  itemDefs: ProductItemDef[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  // 解決済み種別（アダプタで order 順に整列済み・items は割り当て順）。
  const allTypes = productTypes;
  const defByKey = useMemo(
    () => new Map(itemDefs.map((d) => [d.key, d])),
    [itemDefs],
  );

  // 初期 spec を「種別 id / 種別項目値 / 追加項目（ライブラリ）/ 保持（未知キー）」に分解。
  const { initialTypeId, initialTypeValues, initialExtra, preservedRows } =
    useMemo(() => {
      const spec = initial?.spec ?? [];
      const reserved = spec.find((r) => r.key === PRODUCT_TYPE_SPEC_KEY);
      const typeId = reserved?.value ?? null;
      const type = allTypes.find((t) => t.id === typeId) ?? null;
      const typeKeys = new Set(type?.items.map((i) => i.key) ?? []);
      const values: Record<string, string> = {};
      if (type) {
        for (const it of type.items) {
          values[it.key] =
            spec.find((r) => r.key === it.key)?.value ?? it.default ?? "";
        }
      }
      const extra: Record<string, string> = {};
      const preserved: { key: string; value: string }[] = [];
      for (const r of spec) {
        if (r.key === PRODUCT_TYPE_SPEC_KEY || typeKeys.has(r.key)) continue;
        if (defByKey.has(r.key))
          extra[r.key] = r.value; // 定義済み項目 = 追加項目
        else preserved.push(r); // 定義外の旧キーはそのまま保持
      }
      return {
        initialTypeId: typeId,
        initialTypeValues: values,
        initialExtra: extra,
        preservedRows: preserved,
      };
    }, [initial, allTypes, defByKey]);

  const [typeId, setTypeId] = useState<string | null>(initialTypeId);
  const [typeValues, setTypeValues] =
    useState<Record<string, string>>(initialTypeValues);
  const [typeErrors, setTypeErrors] = useState<Record<string, string>>({});
  // 追加項目（ライブラリの項目定義から選ぶ）。
  const [extraKeys, setExtraKeys] = useState<string[]>(
    Object.keys(initialExtra),
  );
  const [extraValues, setExtraValues] =
    useState<Record<string, string>>(initialExtra);
  const [extraErrors, setExtraErrors] = useState<Record<string, string>>({});

  const selectedType = allTypes.find((t) => t.id === typeId) ?? null;
  const typeOptions = allTypes
    .filter((t) => t.enabled || t.id === typeId)
    .map((t) => ({ value: t.id, label: typeLabel(t) }));

  const typeItemKeys = new Set(selectedType?.items.map((i) => i.key) ?? []);
  // 追加候補 = 有効な定義のうち、種別に含まれず未追加のもの。
  const addableOptions = itemDefs
    .filter(
      (d) =>
        d.enabled && !typeItemKeys.has(d.key) && !extraKeys.includes(d.key),
    )
    .map((d) => ({ value: d.key, label: d.label.ja || d.key }));

  const form = useForm<FormValues>({
    validate: zodResolver(productSchema),
    initialValues: {
      nameJa: initial?.nameJa ?? "",
      nameEn: initial?.nameEn ?? "",
      materialTypeId: initial?.materialTypeId ?? null,
      materialTypeLabel: initial?.materialTypeLabel ?? "",
      diameterMm: initial?.diameterMm ?? null,
      lengthMm: initial?.lengthMm ?? null,
      unit: initial?.unit ?? "本",
      isActive: initial?.isActive ?? true,
      notes: initial?.notes ?? "",
      spec: [],
    },
  });

  const onTypeChange = (v: string | null) => {
    setTypeId(v);
    setTypeErrors({});
    const t = allTypes.find((x) => x.id === v) ?? null;
    setTypeValues(t ? defaultValuesFor(t) : {});
    // 種別に含まれる項目は追加項目から外す（重複防止）。
    const keys = new Set(t?.items.map((i) => i.key) ?? []);
    setExtraKeys((ks) => ks.filter((k) => !keys.has(k)));
  };

  const setItemVal = (key: string, val: string) => {
    setTypeValues((s) => ({ ...s, [key]: val }));
    setTypeErrors((e) => {
      if (!e[key]) return e;
      const { [key]: _drop, ...rest } = e;
      return rest;
    });
  };

  const addExtra = (key: string | null) => {
    if (!key) return;
    const def = defByKey.get(key);
    setExtraKeys((ks) => (ks.includes(key) ? ks : [...ks, key]));
    setExtraValues((s) => ({ ...s, [key]: s[key] ?? def?.default ?? "" }));
  };

  const removeExtra = (key: string) => {
    setExtraKeys((ks) => ks.filter((k) => k !== key));
    setExtraErrors((e) => {
      const { [key]: _d, ...rest } = e;
      return rest;
    });
  };

  const setExtraVal = (key: string, val: string) => {
    setExtraValues((s) => ({ ...s, [key]: val }));
    setExtraErrors((e) => {
      if (!e[key]) return e;
      const { [key]: _drop, ...rest } = e;
      return rest;
    });
  };

  const handleSubmit = (values: FormValues) => {
    // 種別項目を型で検証。
    if (selectedType) {
      const errs: Record<string, string> = {};
      for (const it of selectedType.items) {
        const msg = validateItemValue(it, typeValues[it.key]);
        if (msg) errs[it.key] = msg;
      }
      if (Object.keys(errs).length > 0) {
        setTypeErrors(errs);
        notifications.show({
          title: "入力エラー",
          message: "製品種別の項目を確認してください",
          color: "red",
        });
        return;
      }
    }
    // 追加項目を型で検証。
    const exErrs: Record<string, string> = {};
    for (const key of extraKeys) {
      const def = defByKey.get(key);
      if (!def) continue;
      const msg = validateItemValue(def, extraValues[key]);
      if (msg) exErrs[key] = msg;
    }
    if (Object.keys(exErrs).length > 0) {
      setExtraErrors(exErrs);
      notifications.show({
        title: "入力エラー",
        message: "追加項目を確認してください",
        color: "red",
      });
      return;
    }

    // spec を合成（種別項目 + 追加項目 + 保持キー + 予約キー）。定義済み項目のみ。
    const mergedSpec: { key: string; value: string }[] = [...preservedRows];
    if (selectedType) {
      for (const it of selectedType.items) {
        const val = (typeValues[it.key] ?? "").trim();
        if (val !== "") mergedSpec.push({ key: it.key, value: val });
      }
      mergedSpec.push({ key: PRODUCT_TYPE_SPEC_KEY, value: selectedType.id });
    }
    for (const key of extraKeys) {
      const val = (extraValues[key] ?? "").trim();
      if (val !== "") mergedSpec.push({ key, value: val });
    }

    startTransition(async () => {
      const payload = { ...values, spec: mergedSpec };
      const result = isEdit
        ? await updateProduct(initial.id, payload)
        : await createProduct(payload);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit ? "製品を更新しました" : "製品を作成しました",
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.id}`);
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={[
        "マスタ",
        { label: "製品", href: BASE_PATH },
        isEdit ? "編集" : "新規作成",
      ]}
      isPending={isPending}
      onCancel={() =>
        router.push(isEdit ? `${BASE_PATH}/${initial.id}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={isEdit ? <ActiveBadge active={initial.isActive} /> : undefined}
      title={
        isEdit
          ? `製品 編集 — ${initial.code ?? initial.nameJa}`
          : "製品 新規作成"
      }
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            description="形式: PRD-YYYYMM-NNNN（自動採番）"
            disabled
            label="製品コード"
            placeholder="保存時に自動採番"
            value={initial?.id ?? ""}
          />
          <Select
            data={UNIT_OPTIONS}
            label="単位"
            withAsterisk
            {...form.getInputProps("unit")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            enProps={form.getInputProps("nameEn")}
            jaProps={form.getInputProps("nameJa")}
            label="名称"
            required
          />
          <Switch
            label="有効"
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </Stack>
        <Textarea
          label="備考"
          mt="sm"
          placeholder="備考・特記事項"
          rows={3}
          {...form.getInputProps("notes")}
        />
      </FormSection>

      <FormSection
        description="製品が要求する素材を「材種 + 直径 + 全長」で指定します。同一材種・直径の素材を全長に合わせて切断して使用します（特定の素材コードには紐付けません）。"
        title="素材仕様"
      >
        <SearchSelect
          description="変換済（コード構成あり）の材種のみ選択できます"
          label="材種"
          onChange={(value, option) => {
            form.setFieldValue("materialTypeId", value);
            form.setFieldValue("materialTypeLabel", option?.label ?? "");
          }}
          onSearch={searchStructuredMaterialTypeOptions}
          placeholder="材種コード・名称で検索"
          storageKey="product-material-type"
          value={form.values.materialTypeId}
        />
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <NumberInput
            decimalScale={1}
            description={`コード: ${
              form.values.diameterMm != null &&
              form.values.diameterMm >= DIAMETER_MIN &&
              form.values.diameterMm <= DIAMETER_MAX
                ? diameterCodeFromMm(form.values.diameterMm)
                : "—"
            }（径×10）`}
            error={form.errors.diameterMm}
            label="直径 (mm)"
            max={DIAMETER_MAX}
            min={DIAMETER_MIN}
            onChange={(val) =>
              form.setFieldValue(
                "diameterMm",
                val === "" || val == null ? null : Number(val),
              )
            }
            step={0.1}
            value={form.values.diameterMm ?? ""}
          />
          <NumberInput
            description={`コード: ${
              form.values.lengthMm != null &&
              form.values.lengthMm >= LENGTH_MIN &&
              form.values.lengthMm <= LENGTH_MAX
                ? lengthCodeFromMm(form.values.lengthMm)
                : "—"
            }`}
            error={form.errors.lengthMm}
            label="全長 (mm)"
            max={LENGTH_MAX}
            min={LENGTH_MIN}
            onChange={(val) =>
              form.setFieldValue(
                "lengthMm",
                val === "" || val == null ? null : Number(val),
              )
            }
            value={form.values.lengthMm ?? ""}
          />
        </SimpleGrid>
      </FormSection>

      {typeOptions.length > 0 && (
        <FormSection
          description="種別を選ぶと、その種別が予め定義した入力項目が展開されます（製品項目 SY04 で編集）。"
          title="製品種別"
        >
          <Select
            clearable
            data={typeOptions}
            description={selectedType?.description || "種別を選択（任意）"}
            label="製品種別"
            onChange={onTypeChange}
            placeholder="種別を選択"
            value={typeId}
          />
          {selectedType && selectedType.items.length > 0 && (
            <SimpleGrid cols={isMobile ? 1 : 2} mt="md" spacing="sm">
              {selectedType.items.map((it) => (
                <ProductTypeItemInput
                  error={typeErrors[it.key]}
                  item={it}
                  key={it.key}
                  onChange={(v) => setItemVal(it.key, v)}
                  value={typeValues[it.key] ?? ""}
                />
              ))}
            </SimpleGrid>
          )}
        </FormSection>
      )}

      {(extraKeys.length > 0 || addableOptions.length > 0) && (
        <FormSection
          description="製品項目（SY04）で定義された項目のみ追加できます。自由なキーは使えません。"
          title="追加項目"
        >
          {extraKeys.length > 0 && (
            <SimpleGrid cols={isMobile ? 1 : 2} mb="sm" spacing="sm">
              {extraKeys.map((key) => {
                const def = defByKey.get(key);
                if (!def) return null;
                return (
                  <Group align="flex-end" gap="xs" key={key} wrap="nowrap">
                    <div style={{ flex: 1 }}>
                      <ProductTypeItemInput
                        error={extraErrors[key]}
                        item={def}
                        onChange={(v) => setExtraVal(key, v)}
                        value={extraValues[key] ?? ""}
                      />
                    </div>
                    <GhostButton
                      aria-label="この項目を外す"
                      color="red"
                      onClick={() => removeExtra(key)}
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
            label="項目を追加"
            onChange={addExtra}
            placeholder={
              addableOptions.length === 0
                ? "追加できる項目がありません"
                : "項目を選択して追加"
            }
            searchable
            value={null}
          />
        </FormSection>
      )}
    </FormShell>
  );
}

/** 種別項目を型に応じた入力で描画する。値は文字列表現で保持する。 */
function ProductTypeItemInput({
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
  const label = item.label.ja || item.label.en || item.key;
  const common = {
    label,
    withAsterisk: item.required,
    error,
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
          placeholder={item.placeholder ?? "選択"}
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
