// AUTO-GENERATED-STYLE seed data for the configurable 価格試算 calculation
// (trial-pricing-criteria.ts). BASE_CRITERIA reproduces the legacy hardcoded
// formula term-for-term (Excel「最新見積書価格試算」); DEFAULT_CUSTOM_INPUTS
// migrates the old global 係数 (補正値・LDチャージ 等) into named inputs.
//
// **Every `name`/`label`/`expression` here is a starting value for an
// admin-editable field** — 各基準は SY02 の編集ページで `name` と
// `expression`（JS 風の式）を管理者が書き換えられる（criterionSchema）。
// カスタム入力の `label` も同様（customInputDefSchema）。DB に入るデータと
// 同じ扱いで翻訳の対象外（_specs/i18n-glossary.md §1）——
// trial-pricing-lookups.ts の keyColumns と同じ理由。
//
// この分離自体もそのため: `expression` は複数行の warn(...) 呼び出しを含み、
// 中の日本語に `i18n-ignore` を行内コメントで付けると式の中身が壊れる
// （テンプレートリテラルの一部になってしまう）。ファイル単位の除外
// （tools/i18n/lib/scan.mjs の EXCLUDED）で扱えるよう、この 2 定数だけを
// 独立ファイルへ出した。

import type { Criterion, CustomInputDef } from "./trial-pricing-criteria";

/**
 * Seed criteria reproducing the legacy hardcoded chain term-for-term.
 * roundUp digit→unit mapping: roundUp(x,0) → round(x,1); roundUp(x,-1) → round(x,10).
 * Component ids equal CostBreakdown keys so the existing result views keep working.
 */
export const BASE_CRITERIA: Criterion[] = [
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
    expression: `lapAmount(lapType)`,
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
 * 既定のカスタム入力。旧「既定値・係数（グローバル）」の 4 値を scope:"global" の
 * 固定係数として移行（見積フォームには出さず、式内で同名変数として参照）。キー名は
 * 従来の予約語と同一だが、予約語からは外したので式の互換性を保ちつつ衝突しない。
 */
export const DEFAULT_CUSTOM_INPUTS: CustomInputDef[] = [
  {
    key: "machiningRatePer10min",
    label: "加工単価（¥/10分）",
    type: "number",
    default: 2000,
    order: 1,
    scope: "global",
  },
  {
    key: "spareShapeCount",
    label: "予備形状本数",
    type: "number",
    default: 3,
    order: 2,
    scope: "global",
  },
  {
    key: "correctionFactor",
    label: "補正値（2022補正値）",
    type: "number",
    default: 1.25,
    order: 3,
    scope: "global",
  },
  {
    key: "ldChargePer10min",
    label: "LDチャージ（¥/10分）",
    type: "number",
    default: 7500,
    order: 4,
    scope: "global",
  },
];
