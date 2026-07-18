/**
 * product-types.ts — 製品項目（Product Items）の型・zod・既定値・検証。
 *
 * 2 つの概念に分離:
 *   1. 項目定義（ProductItemDef）… 再利用可能な入力項目の定義（キー・型・選択肢など）。
 *   2. 製品種別（ProductType）… 項目定義を「割り当て」て作るテンプレート。割り当てごとに
 *      既定値を上書きできる（with/without default）。
 * 新規製品作成時に種別を選ぶと、割り当てられた項目が型付きで展開され、入力を型で検証する。
 *
 * client-safe（`server-only` 無し）: フォームと Server Action / アダプタの両方から使う。
 * 永続化は lib/product-settings.ts が app.system_settings の名前空間 `product_item`
 * （キー `product_item.definitions` / `product_item.types`）に保存する。
 */

import { z } from "zod";

export type ProductFieldType =
  | "string"
  | "number"
  | "boolean"
  | "select"
  | "date";

export const PRODUCT_FIELD_TYPES: {
  value: ProductFieldType;
  label: string;
}[] = [
  { value: "string", label: "文字列" },
  { value: "number", label: "数値" },
  { value: "boolean", label: "真偽（はい/いいえ）" },
  { value: "select", label: "選択" },
  { value: "date", label: "日付" },
];

export interface ProductFieldOption {
  value: string;
  label: string;
}

/** 再利用可能な入力項目の定義（項目ライブラリの 1 エントリ）。 */
export interface ProductItemDef {
  /** spec のキー（識別子・全体で一意）。 */
  key: string;
  label: { ja: string; en: string };
  type: ProductFieldType;
  required: boolean;
  /** 基本の既定値（文字列表現）。種別割り当てで上書き可。 */
  default?: string;
  /** select のみ。 */
  options?: ProductFieldOption[];
  /** number のみ（任意の範囲検証）。 */
  min?: number;
  max?: number;
  placeholder?: string;
  order: number;
  enabled: boolean;
}

/** 製品種別への項目割り当て（項目定義への参照 + 任意の既定値上書き）。 */
export interface ProductTypeAssignment {
  itemKey: string;
  /** この種別での既定値（未指定なら項目定義の default を使う）。 */
  defaultValue?: string;
  order: number;
}

export interface ProductType {
  id: string;
  name: { ja: string; en: string };
  description?: string;
  enabled: boolean;
  order: number;
  assignments: ProductTypeAssignment[];
}

/**
 * 種別に割り当てた項目を、定義と結合して解決した形（フォーム描画用）。
 * items は ProductItemDef と同形（default は実効値に置換済み）。
 */
export interface ResolvedProductType {
  id: string;
  name: { ja: string; en: string };
  description?: string;
  enabled: boolean;
  items: ProductItemDef[];
}

/** product.spec に種別 id を保持する予約キー（通常の spec 行としては見せない）。 */
export const PRODUCT_TYPE_SPEC_KEY = "_product_type";

export function isReservedSpecKey(key: string): boolean {
  return key === PRODUCT_TYPE_SPEC_KEY;
}

/** 種別 + 項目定義 → 解決済み種別（割り当て順、実効既定値）。 */
export function resolveProductType(
  type: ProductType,
  defs: ProductItemDef[],
): ResolvedProductType {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const items: ProductItemDef[] = [];
  for (const a of [...type.assignments].sort((x, y) => x.order - y.order)) {
    const def = byKey.get(a.itemKey);
    if (!def) continue; // 定義が削除された割り当てはスキップ
    items.push({
      ...def,
      default: a.defaultValue ?? def.default ?? "",
    });
  }
  return {
    id: type.id,
    name: type.name,
    description: type.description,
    enabled: type.enabled,
    items,
  };
}

// ── zod（保存時検証） ─────────────────────────────────────────────────────────
export const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const productFieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const productItemDefSchema = z.object({
  key: z
    .string()
    .regex(IDENTIFIER, "キーは英字/アンダースコア始まりの識別子にしてください"),
  label: z.object({
    ja: z.string().min(1, "項目名を入力してください"),
    en: z.string(),
  }),
  type: z.enum(["string", "number", "boolean", "select", "date"]),
  required: z.boolean(),
  default: z.string().optional(),
  options: z.array(productFieldOptionSchema).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  placeholder: z.string().optional(),
  order: z.number(),
  enabled: z.boolean(),
});

export const productTypeAssignmentSchema = z.object({
  itemKey: z.string().min(1),
  defaultValue: z.string().optional(),
  order: z.number(),
});

export const productTypeSchema = z.object({
  id: z.string().min(1),
  name: z.object({
    ja: z.string().min(1, "種別名を入力してください"),
    en: z.string(),
  }),
  description: z.string().optional(),
  enabled: z.boolean(),
  order: z.number(),
  assignments: z.array(productTypeAssignmentSchema),
});

export const productItemDefsArraySchema = z.array(productItemDefSchema);
export const productTypesArraySchema = z.array(productTypeSchema);

/** 検証対象の最小形（項目定義 or 解決済み項目）。 */
type ValidatableItem = Pick<
  ProductItemDef,
  "key" | "label" | "type" | "required" | "options" | "min" | "max"
>;

/**
 * 1 項目の入力値（文字列表現）を型で検証。エラーメッセージ or null（OK）を返す。
 * client（フォーム）と server（Server Action）の両方から呼ぶ。
 */
export function validateItemValue(
  item: ValidatableItem,
  raw: string | null | undefined,
): string | null {
  const v = (raw ?? "").trim();
  const labelJa = item.label.ja || item.key;
  if (v === "") {
    return item.required ? `${labelJa} は必須です` : null;
  }
  switch (item.type) {
    case "number": {
      const n = Number(v);
      if (!Number.isFinite(n)) return `${labelJa} は数値で入力してください`;
      if (item.min != null && n < item.min)
        return `${labelJa} は ${item.min} 以上で入力してください`;
      if (item.max != null && n > item.max)
        return `${labelJa} は ${item.max} 以下で入力してください`;
      return null;
    }
    case "boolean":
      return v === "true" || v === "false"
        ? null
        : `${labelJa} は真偽値で入力してください`;
    case "select": {
      const ok = (item.options ?? []).some((o) => o.value === v);
      return ok ? null : `${labelJa} は選択肢から選んでください`;
    }
    case "date": {
      const t = Date.parse(v);
      return Number.isNaN(t) ? `${labelJa} は日付で入力してください` : null;
    }
    default:
      return null; // string: 非空ならOK
  }
}

/** 解決済み種別の既定値マップ（key→default 文字列）。 */
export function defaultValuesFor(
  type: ResolvedProductType,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of type.items) out[it.key] = it.default ?? "";
  return out;
}

// ── 既定値（編集可能。未設定時に使用） ───────────────────────────────────────
export const DEFAULT_PRODUCT_ITEM_DEFS: ProductItemDef[] = [
  {
    key: "surfaceTreatment",
    label: { ja: "表面処理", en: "Surface treatment" },
    type: "select",
    required: false,
    default: "none",
    options: [
      { value: "none", label: "なし" },
      { value: "coating", label: "コーティング" },
      { value: "polishing", label: "研磨" },
    ],
    order: 0,
    enabled: true,
  },
  {
    key: "hardnessHrc",
    label: { ja: "硬度 (HRC)", en: "Hardness (HRC)" },
    type: "number",
    required: false,
    min: 0,
    max: 100,
    placeholder: "例: 60",
    order: 1,
    enabled: true,
  },
  {
    key: "tolerance",
    label: { ja: "公差", en: "Tolerance" },
    type: "string",
    required: false,
    placeholder: "例: ±0.01",
    order: 2,
    enabled: true,
  },
  {
    key: "drawingNo",
    label: { ja: "図番", en: "Drawing No." },
    type: "string",
    required: false,
    order: 3,
    enabled: true,
  },
  {
    key: "coatingType",
    label: { ja: "コーティング種類", en: "Coating type" },
    type: "select",
    required: true,
    default: "tin",
    options: [
      { value: "tin", label: "TiN" },
      { value: "ticn", label: "TiCN" },
      { value: "tialn", label: "TiAlN" },
      { value: "dlc", label: "DLC" },
    ],
    order: 4,
    enabled: true,
  },
  {
    key: "coatingThicknessUm",
    label: { ja: "膜厚 (μm)", en: "Thickness (μm)" },
    type: "number",
    required: false,
    min: 0,
    placeholder: "例: 3",
    order: 5,
    enabled: true,
  },
  {
    key: "pretreatment",
    label: { ja: "前処理あり", en: "Pretreatment" },
    type: "boolean",
    required: false,
    default: "false",
    order: 6,
    enabled: true,
  },
];

export const DEFAULT_PRODUCT_TYPES: ProductType[] = [
  {
    id: "standard",
    name: { ja: "標準品", en: "Standard" },
    description: "一般的な製品の標準項目。",
    enabled: true,
    order: 0,
    assignments: [
      { itemKey: "surfaceTreatment", order: 0 },
      { itemKey: "hardnessHrc", order: 1 },
      { itemKey: "tolerance", order: 2 },
      { itemKey: "drawingNo", order: 3 },
    ],
  },
  {
    id: "coated",
    name: { ja: "コーティング品", en: "Coated" },
    description: "コーティングを施す製品の項目。",
    enabled: true,
    order: 1,
    assignments: [
      { itemKey: "coatingType", order: 0 },
      { itemKey: "coatingThicknessUm", order: 1 },
      { itemKey: "pretreatment", order: 2 },
    ],
  },
];
