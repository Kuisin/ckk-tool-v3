/**
 * trial-pricing-criteria.ts — data model for the configurable 試算 calculation.
 *
 * The pricing result is the sum of an ordered list of admin-defined **criteria**,
 * each a JavaScript expression evaluated (per lot) against the simulation input
 * variables. Admins may also define extra **custom inputs** that appear in the
 * 試算 form and become variables in expressions. This module holds only the
 * shared types / zod schemas / defaults — it is client-safe (no `server-only`),
 * imported by the browser form, the engine, and the server settings adapter.
 *
 * The evaluation engine (trial-pricing-engine.ts) reads these; the seed
 * DEFAULT_CRITERIA reproduce the historical hardcoded formula 1:1.
 */

import { z } from "zod";
import type { ToolType } from "./trial-pricing";

/** 工具種（試算の product type）— 基準の適用対象の絞り込みに使う。 */
export const TRIAL_TOOL_TYPES: ToolType[] = ["ROUND_BAR", "CYLINDER", "OH"];

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
  /** 適用する工具種（未設定/空 = 全工具種）。指定時はその工具種の試算にのみ効く。 */
  toolTypes?: ToolType[];
}

export type CustomInputType = "number" | "boolean" | "text" | "select";

export interface CustomInputOption {
  value: string;
  label: string;
}

export interface CustomInputDef {
  /** Valid JS identifier, unique, not reserved — becomes a scope variable. */
  key: string;
  label: string;
  type: CustomInputType;
  default: number | boolean | string;
  /** select only. */
  options?: CustomInputOption[];
  order: number;
}

// ── zod (save-time validation) ───────────────────────────────────────────────
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const criterionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "基準名を入力してください"),
  role: z.enum(["component", "intermediate", "final"]),
  expression: z.string().max(4000),
  order: z.number(),
  enabled: z.boolean(),
  toolTypes: z.array(z.enum(["ROUND_BAR", "CYLINDER", "OH"])).optional(),
});

export const customInputDefSchema = z.object({
  key: z
    .string()
    .regex(IDENTIFIER, "キーは英字/アンダースコア始まりの識別子にしてください"),
  label: z.string().min(1, "ラベルを入力してください"),
  type: z.enum(["number", "boolean", "text", "select"]),
  default: z.union([z.number(), z.boolean(), z.string()]),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
  order: z.number(),
});

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
  "machiningRatePer10min",
  "spareShapeCount",
  "lotQuantities",
  "lotMarkups",
  // per-lot / running state
  "quantity",
  "subtotal",
  "r",
  "discountRate",
  "autoRate",
  "lotMarkup",
  // coefficients
  "correctionFactor",
  "ldChargePer10min",
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
  "CENTERLESS",
  "STEP_MACHINING",
  "NECK_MACHINING",
  "CYLINDER_MACHINING",
]);

/**
 * Seed criteria reproducing the legacy hardcoded chain term-for-term.
 * roundUp digit→unit mapping: roundUp(x,0) → round(x,1); roundUp(x,-1) → round(x,10).
 * Component ids equal CostBreakdown keys so the existing result views keep working.
 */
const BASE_CRITERIA: Criterion[] = [
  {
    id: "material",
    name: "材料原価",
    role: "component",
    order: 10,
    enabled: true,
    expression: `toolType === 'CYLINDER'
  ? ((lookupMatrix(CYLINDER_MACHINING, maxDiameter, totalLength) ?? 0) === 0
      ? warn('円筒加工費が範囲外です（最大径/全長を確認）') : null,
     (cylinderMaterialPrice ?? 0)
       + (lookupMatrix(CYLINDER_MACHINING, maxDiameter, totalLength) ?? 0)
         * cylinderTypeRate(cylinderType ?? 'NORMAL'))
  : (materialBarPrice <= 0
       ? warn('素材の仕入実績がありません（1000mm単価を入力）') : null,
     round(materialBarPrice * (totalLength / materialBasisLength), 1)
       + (isBlackSkin
           ? (toolType === 'OH'
               ? round((lookupMatrix(CENTERLESS, maxDiameter, totalLength) ?? 0) * 1.3, 1)
               : (lookupMatrix(CENTERLESS, maxDiameter, totalLength) ?? 0))
           : 0))`,
  },
  {
    id: "step",
    name: "段加工費",
    role: "component",
    order: 20,
    enabled: true,
    expression: `stepLength >= 0.01 && stepType !== 'NONE'
  ? (lookupMatrix(STEP_MACHINING, maxDiameter, stepLength) == null
       ? warn('段加工費が範囲外です') : null,
     (lookupMatrix(STEP_MACHINING, maxDiameter, stepLength) ?? 0) * stepTypeRate(stepType))
  : 0`,
  },
  {
    id: "neck",
    name: "首下加工費",
    role: "component",
    order: 30,
    enabled: true,
    expression: `neckLength >= 0.01 && neckType !== 'NONE'
  ? (lookupMatrix(NECK_MACHINING, maxDiameter, neckLength) == null
       ? warn('首下加工費が範囲外です') : null,
     (lookupMatrix(NECK_MACHINING, maxDiameter, neckLength) ?? 0) * neckTypeRate(neckType))
  : 0`,
  },
  {
    id: "machining",
    name: "加工単価",
    role: "component",
    order: 40,
    enabled: true,
    expression: `(machiningRatePer10min / 10) * machiningMinutes`,
  },
  {
    id: "coating",
    name: "コート代",
    role: "component",
    order: 50,
    enabled: true,
    expression: `coating && coating !== '無'
  ? round(coatingRawCost(coating, maxDiameter, totalLength) * coatingFactor, 10)
  : 0`,
  },
  {
    id: "lap",
    name: "ラップ処理",
    role: "component",
    order: 60,
    enabled: true,
    expression: `lapType === 'OSG' ? r.coating / 2 : lapAmount(lapType)`,
  },
  {
    id: "ld",
    name: "LD加工",
    role: "component",
    order: 70,
    enabled: true,
    expression: `ldEnabled
  ? (ldChargePer10min / 10) * ldMinutes(ldLocation, ldOuterDiameter, ldBladeLength)
  : 0`,
  },
  {
    id: "inspection",
    name: "検査成績書",
    role: "component",
    order: 80,
    enabled: true,
    expression: `inspectionAmount(inspection)`,
  },
  {
    id: "shapeOut",
    name: "形状出し単価",
    role: "intermediate",
    order: 90,
    enabled: true,
    expression: `(r.material + r.step + r.machining) * spareShapeCount`,
  },
  {
    id: "shapeOutPerPiece",
    name: "形状出し（1本按分）",
    role: "component",
    order: 100,
    enabled: true,
    expression: `r.shapeOut / quantity`,
  },
  {
    id: "final",
    name: "見積単価",
    role: "final",
    order: 999,
    enabled: true,
    expression: `round(subtotal * discountRate * correctionFactor, 10)`,
  },
];

/**
 * 既定は全工具種に適用（toolTypes を明示付与）。工具種は「未選択＝適用なし・
 * 全選択で全て」の仕様のため、既定は全て選択済みとして提供する。
 */
export const DEFAULT_CRITERIA: Criterion[] = BASE_CRITERIA.map((c) => ({
  ...c,
  toolTypes: [...TRIAL_TOOL_TYPES],
}));

export const DEFAULT_CUSTOM_INPUTS: CustomInputDef[] = [];

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
