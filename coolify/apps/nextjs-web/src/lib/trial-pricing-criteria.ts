/**
 * trial-pricing-criteria.ts — data model for the configurable 価格試算 calculation.
 *
 * The pricing result is the sum of an ordered list of admin-defined **criteria**,
 * each a JavaScript expression evaluated (per lot) against the simulation input
 * variables. Admins may also define extra **custom inputs** that appear in the
 * 価格試算 form and become variables in expressions. This module holds only the
 * shared types / zod schemas / defaults — it is client-safe (no `server-only`),
 * imported by the browser form, the engine, and the server settings adapter.
 *
 * The evaluation engine (trial-pricing-engine.ts) reads these; the seed
 * DEFAULT_CRITERIA reproduce the historical hardcoded formula 1:1.
 */

import type { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { LocalizedText } from "./format";
import type { ToolType } from "./trial-pricing";
import {
  BASE_CRITERIA,
  DEFAULT_CUSTOM_INPUTS,
} from "./trial-pricing-criteria-seed";

export { DEFAULT_CUSTOM_INPUTS };

type Tr = Awaited<ReturnType<typeof getTranslations>>;

/** 組み込み工具種の値（旧 enum 互換）— 旧データの既定適用対象にも使う。 */
export const TRIAL_TOOL_TYPES: ToolType[] = ["ROUND_BAR", "CYLINDER", "OH"];

// ── 工具種（管理者定義）─────────────────────────────────────────────────────
//
// 工具種は SY02 工具種管理で追加/削除できる（trial_pricing.tool_types）。
// 組み込み 3 種は削除不可（フォームの入力分岐・レガシー互換の基盤）。カスタム種の
// 計算入力は丸棒系（参照単価ベース）で、適用する計算基準は基準側の toolTypes
// （適用工具種）で決まる。
export interface ToolTypeDef {
  /** 値（大文字識別子）。estimates.tool_type に保存される。作成後変更不可。 */
  value: ToolType;
  /** 表示名 e.g. 丸棒. */
  label: string;
  order: number;
  /** 組み込み種（ROUND_BAR/CYLINDER/OH）。削除・値変更不可。 */
  builtin?: boolean;
}

export const TOOL_TYPE_VALUE = /^[A-Z][A-Z0-9_]{0,31}$/;

export function toolTypeDefSchema(tr: Tr) {
  return z.object({
    value: z
      .string()
      .regex(
        TOOL_TYPE_VALUE,
        tr("settings.trialPricingCriteria.toolTypeValueFormat"),
      ),
    label: z
      .string()
      .min(1, tr("settings.trialPricingCriteria.enterADisplayName")),
    order: z.number(),
    builtin: z.boolean().optional(),
  });
}

// BUILTIN_TOOL_TYPES のラベルは画面表示では常に builtinToolTypeLabel(tr) へ
// 差し替わる（toToolTypeOptions）。ここは永続データの既定値・保存前フォーム
// 初期値としてのみ使う ja 固定値。
export const BUILTIN_TOOL_TYPES: ToolTypeDef[] = [
  { value: "ROUND_BAR", label: "丸棒", order: 10, builtin: true }, // i18n-ignore
  { value: "CYLINDER", label: "円筒", order: 20, builtin: true }, // i18n-ignore
  { value: "OH", label: "OH付", order: 30, builtin: true }, // i18n-ignore
];

/**
 * 永続化された工具種リストに組み込み 3 種を必ず含める（旧データ・空配列でも
 * 復元）。値の重複は先勝ちで除去し、order 順に整列して返す。
 */
export function mergeBuiltinToolTypes(persisted: ToolTypeDef[]): ToolTypeDef[] {
  const out: ToolTypeDef[] = [];
  const seen = new Set<string>();
  for (const t of [...BUILTIN_TOOL_TYPES, ...persisted]) {
    if (seen.has(t.value)) continue;
    seen.add(t.value);
    // 組み込みは builtin フラグ・値を強制（永続データでは上書き不可）
    const builtin = BUILTIN_TOOL_TYPES.find((b) => b.value === t.value);
    out.push(builtin ? { ...t, builtin: true } : { ...t, builtin: false });
  }
  return out.sort((a, b) => a.order - b.order);
}

/**
 * 基準がこの工具種に適用されるか。undefined（旧データ）= 全工具種、
 * 空配列 = 適用なし、指定時はメンバーシップ。
 */
export function criterionAppliesTo(c: Criterion, toolType: ToolType): boolean {
  return !c.toolTypes || c.toolTypes.includes(toolType);
}

/**
 * - `component`   … its value is ADDED to the running subtotal (最低単価).
 * - `intermediate`… computed and exposed as `r.<id>` for later criteria, but
 *                    NOT added to the subtotal (e.g. 形状出し単価).
 * - `final`       … maps the subtotal to the 見積単価 (見積単価 = f(subtotal)).
 *                    Exactly one enabled `final` criterion is expected.
 */
export type CriterionRole = "component" | "intermediate" | "final";

export interface Criterion {
  /** Stable slug; component ids "material".."inspection" map to breakdown keys. */
  id: string;
  /** 表示名 e.g. "材料原価". */
  name: string;
  role: CriterionRole;
  /** JS expression body returning a number. */
  expression: string;
  order: number;
  enabled: boolean;
  /** 適用する工具種（未設定/空 = 全工具種）。指定時はその工具種の価格試算にのみ効く。 */
  toolTypes?: ToolType[];
}

export type CustomInputType = "number" | "boolean" | "text" | "select";

export interface CustomInputOption {
  value: string;
  label: string;
}

/**
 * - `estimate` … editable per estimate (appears in the 価格試算 form; default is the
 *                initial value).
 * - `global`   … fixed global constant; hidden from the estimate form, always uses
 *                `default`. Edited only in the SY02 custom-values admin list.
 */
export type CustomInputScope = "estimate" | "global";

export interface CustomInputDef {
  /** Valid JS identifier, unique, not reserved — becomes a scope variable. */
  key: string;
  label: string;
  type: CustomInputType;
  default: number | boolean | string;
  /** select only. */
  options?: CustomInputOption[];
  order: number;
  /** 既定 = "estimate"。"global" は見積フォームに出さない固定係数。 */
  scope?: CustomInputScope;
}

// ── zod (save-time validation) ───────────────────────────────────────────────
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * 保存時の検証（Server Action から呼ぶ）。**`tr` の明示引数** — このスキーマは
 * client-safe な module（`server-only` 無し）でブラウザからも import されるため、
 * `next-intl` のフック（`useTranslations`/`getTranslations`）を module scope で
 * 呼べない。呼び出し側の `tr` を渡すこと。
 */
export function criterionSchema(tr: Tr) {
  return z.object({
    id: z.string().min(1),
    name: z
      .string()
      .min(1, tr("settings.trialPricingCriteria.enterACriterionName")),
    role: z.enum(["component", "intermediate", "final"]),
    expression: z.string().max(4000),
    order: z.number(),
    enabled: z.boolean(),
    // 工具種は管理者定義（値は文字列）。undefined = 全工具種 / 空 = 適用なし。
    toolTypes: z.array(z.string()).optional(),
  });
}

export function customInputDefSchema(tr: Tr) {
  return z.object({
    key: z
      .string()
      .regex(
        IDENTIFIER,
        tr("settings.itemDefEditForm.theKeyMustBeAnIdentifier"),
      ),
    label: z.string().min(1, tr("settings.trialPricingCriteria.enterALabel")),
    type: z.enum(["number", "boolean", "text", "select"]),
    default: z.union([z.number(), z.boolean(), z.string()]),
    options: z
      .array(z.object({ value: z.string(), label: z.string() }))
      .optional(),
    order: z.number(),
    scope: z.enum(["estimate", "global"]).optional(),
  });
}

/**
 * Names the engine binds into every expression's scope (input fields, per-lot
 * variables, coefficients, helpers). Custom-input keys may NOT collide with
 * these. Keep in sync with trial-pricing-engine.ts `buildScope`.
 */
export const RESERVED_KEYS: ReadonlySet<string> = new Set([
  // TrialInput fields
  "toolType",
  "maxDiameter",
  "totalLength",
  "materialBarPrice",
  "isBlackSkin",
  "cylinderMaterialPrice",
  "cylinderType",
  "stepLength",
  "stepType",
  "neckLength",
  "neckType",
  "coating",
  "lapType",
  "inspection",
  "ldEnabled",
  "ldLocation",
  "ldOuterDiameter",
  "ldBladeLength",
  "machiningMinutes",
  "lotQuantities",
  "lotMarkups",
  // per-lot / running state
  "quantity",
  "subtotal",
  "r",
  "discountRate",
  "autoRate",
  "lotMarkup",
  // coefficients (materialBasisLength/coatingFactor are engine constants; the four
  // migrated globals — machiningRatePer10min/spareShapeCount/correctionFactor/
  // ldChargePer10min — are now custom values, so intentionally NOT reserved here).
  "materialBasisLength",
  "coatingFactor",
  // helpers
  "round",
  "lookupMatrix",
  "matchDesc",
  "coatingRawCost",
  "ldMinutes",
  "lotDiscountRate",
  "stepTypeRate",
  "neckTypeRate",
  "cylinderTypeRate",
  "lapAmount",
  "inspectionAmount",
  "warn",
  "lookup",
  "CENTERLESS",
  "STEP_MACHINING",
  "NECK_MACHINING",
  "CYLINDER_MACHINING",
]);

// ── ルックアップ表（管理者が定義。多列キーの組み合わせ → 戻り値）─────────────────
//
// 式内では lookup("<表名>", key1, key2, ...) で参照する。keyColumns の順にキー値を
// 渡すと、その組み合わせに一致する行の value を返す（戻り値は数値 or 文字列）。
// キー列の組み合わせは表内で一意。該当なしは valueType に応じて 0 / "" を返す。
export type LookupValueType = "number" | "string";

/**
 * キー列ごとの照合方法（Excel の MATCH 相当）:
 * - `exact` … 完全一致（既定）。
 * - `ge`    … `MATCH(v, keysDesc, -1)`: v 以上で最小のキー（径×長マトリクス）。
 * - `le`    … `VLOOKUP(v, …, TRUE)`: v 以下で最大のキー（LD 1次元・ロット割引）。
 */
export type LookupKeyMatch = "exact" | "ge" | "le";

/** 1 行 = キー列の値（keyColumns 順）+ 戻り値（文字列で保持し valueType で解釈）。 */
export interface LookupRow {
  keys: string[];
  value: string;
}

export interface LookupTable {
  /** 不変の管理 ID。式内での参照キー（lookup("<id>", ...keys)）。作成後は変更不可。 */
  id: string;
  /** 表示名（多言語 { ja, en }）。参照には使わず一覧・詳細の表示のみ。 */
  name: LocalizedText;
  description?: string;
  /** キー列名（組み合わせが一意）。順序が lookup 引数の順序。 */
  keyColumns: string[];
  /** キー列ごとの照合方法（keyColumns と並行、未設定は全て exact）。 */
  keyMatch?: LookupKeyMatch[];
  /** 戻り値の型。 */
  valueType: LookupValueType;
  /** 一致なしのとき返す既定値（valueType で解釈。未設定は 0 / ""）。 */
  default?: string;
  rows: LookupRow[];
}

export const lookupRowSchema = z.object({
  keys: z.array(z.string()),
  value: z.string(),
});

/** ルックアップ表 ID の形式 — 英数字・ハイフン・アンダースコアのみ。 */
export const LOOKUP_TABLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function lookupTableSchema(tr: Tr) {
  return z.object({
    id: z
      .string()
      .min(1, tr("settings.criterionEditForm.enterAnId"))
      .regex(
        LOOKUP_TABLE_ID,
        tr("settings.trialPricingCriteria.idMustBeAlphanumericHyphens"),
      ),
    name: z.object({ ja: z.string(), en: z.string() }),
    description: z.string().optional(),
    keyColumns: z
      .array(z.string().min(1))
      .min(1, tr("settings.trialPricingCriteria.specifyAtLeastOneKey")),
    keyMatch: z.array(z.enum(["exact", "ge", "le"])).optional(),
    valueType: z.enum(["number", "string"]),
    default: z.string().optional(),
    rows: z.array(lookupRowSchema),
  });
}

export function lookupTablesArraySchema(tr: Tr) {
  return z.array(lookupTableSchema(tr));
}

/** 参照表の既定セット（Excel「最新見積書価格試算」由来）。lib/trial-pricing-lookups.ts。 */
export { DEFAULT_LOOKUP_TABLES } from "./trial-pricing-lookups";

/** キー配列 → 一意な合成キー文字列（区切りは NUL）。 */
export function lookupCompositeKey(keys: readonly string[]): string {
  return JSON.stringify(keys.map((k) => String(k)));
}

/**
 * 既定は全工具種に適用（toolTypes を明示付与）。工具種は「未選択＝適用なし・
 * 全選択で全て」の仕様のため、既定は全て選択済みとして提供する。
 */
export const DEFAULT_CRITERIA: Criterion[] = BASE_CRITERIA.map((c) => ({
  ...c,
  toolTypes: [...TRIAL_TOOL_TYPES],
}));

/** scope:"global" の既定カスタム入力（常に存在させる固定係数）。 */
export const GLOBAL_CUSTOM_INPUTS: CustomInputDef[] =
  DEFAULT_CUSTOM_INPUTS.filter((d) => d.scope === "global");

/** Component ids whose values populate the legacy CostBreakdown. */
export const BREAKDOWN_CRITERION_IDS = [
  "material",
  "step",
  "neck",
  "machining",
  "coating",
  "lap",
  "ld",
  "inspection",
] as const;
