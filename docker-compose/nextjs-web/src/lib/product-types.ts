/**
 * product-types.ts — 製品種別（Product Type）の型・zod・既定値・検証。
 *
 * 製品種別 = テンプレート。各種別は「予め決めた入力項目（items）」を持ち、
 * 新規製品作成時に種別を選ぶとその項目が（既定値入りで）フォームに展開される。
 * 項目ごとに型（文字列/数値/真偽/選択/日付）を持ち、入力を型で検証する。
 *
 * client-safe（`server-only` 無し）: フォーム（クライアント）と Server Action /
 * アダプタ（サーバー）の両方から使う。永続化は lib/product-settings.ts が
 * app.system_settings の名前空間 `product_type` に保存する。
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

/** 種別が予め持つ入力項目の定義。 */
export interface ProductTypeItem {
  /** spec のキー（識別子・種別内で一意）。 */
  key: string;
  label: { ja: string; en: string };
  type: ProductFieldType;
  required: boolean;
  /** 既定値（文字列表現）。真偽は "true"/"false"、選択は option.value。 */
  default?: string;
  /** select のみ。 */
  options?: ProductFieldOption[];
  /** number のみ（任意の範囲検証）。 */
  min?: number;
  max?: number;
  /** 入力補助の説明・プレースホルダ。 */
  placeholder?: string;
  order: number;
}

export interface ProductType {
  id: string;
  name: { ja: string; en: string };
  description?: string;
  enabled: boolean;
  order: number;
  items: ProductTypeItem[];
}

/** product.spec に種別 id を保持する予約キー（通常の spec 行としては見せない）。 */
export const PRODUCT_TYPE_SPEC_KEY = "_product_type";

export function isReservedSpecKey(key: string): boolean {
  return key === PRODUCT_TYPE_SPEC_KEY;
}

// ── zod（保存時検証） ─────────────────────────────────────────────────────────
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const productFieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const productTypeItemSchema = z.object({
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
  items: z.array(productTypeItemSchema),
});

export const productTypesArraySchema = z.array(productTypeSchema);

/**
 * 1 項目の入力値（文字列表現）を型で検証。エラーメッセージ or null（OK）を返す。
 * client（フォーム）と server（Server Action）の両方から呼ぶ。
 */
export function validateItemValue(
  item: ProductTypeItem,
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
      // YYYY-MM-DD もしくは Date で解釈できる文字列
      const t = Date.parse(v);
      return Number.isNaN(t) ? `${labelJa} は日付で入力してください` : null;
    }
    default:
      return null; // string: 非空ならOK
  }
}

/** 種別の既定値マップ（key→default 文字列）。未設定は空文字。 */
export function defaultValuesFor(type: ProductType): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of type.items) out[it.key] = it.default ?? "";
  return out;
}

// ── 既定の製品種別（編集可能。SY04 未設定時に使用） ─────────────────────────────
export const DEFAULT_PRODUCT_TYPES: ProductType[] = [
  {
    id: "standard",
    name: { ja: "標準品", en: "Standard" },
    description: "一般的な製品の標準項目。",
    enabled: true,
    order: 0,
    items: [
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
      },
      {
        key: "tolerance",
        label: { ja: "公差", en: "Tolerance" },
        type: "string",
        required: false,
        placeholder: "例: ±0.01",
        order: 2,
      },
      {
        key: "drawingNo",
        label: { ja: "図番", en: "Drawing No." },
        type: "string",
        required: false,
        order: 3,
      },
    ],
  },
  {
    id: "coated",
    name: { ja: "コーティング品", en: "Coated" },
    description: "コーティングを施す製品の項目。",
    enabled: true,
    order: 1,
    items: [
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
        order: 0,
      },
      {
        key: "coatingThicknessUm",
        label: { ja: "膜厚 (μm)", en: "Thickness (μm)" },
        type: "number",
        required: false,
        min: 0,
        placeholder: "例: 3",
        order: 1,
      },
      {
        key: "pretreatment",
        label: { ja: "前処理あり", en: "Pretreatment" },
        type: "boolean",
        required: false,
        default: "false",
        order: 2,
      },
    ],
  },
];
