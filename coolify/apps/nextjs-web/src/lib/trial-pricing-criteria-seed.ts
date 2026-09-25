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
    description:
      "素材（丸棒）の 1 本分の費用。参照単価（¥/1000mm、仕入実績または材種の既定単価）× 全長 ÷ 1000mm。黒皮材はセンタレス加工費を加算（OH付は 1.3 倍）。円筒は手入力の素材価格 + 円筒加工費。",
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
    description:
      "段加工の費用。最大径と段加工長から表を引き、加工の種類（仕上げ・粗など）の掛け率を掛けます。段加工長が 0 または種類が「なし」なら 0 円。",
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
    description:
      "首下加工の費用。最大径と首下加工長から表を引き、加工の種類の掛け率を掛けます。首下加工長が 0 または種類が「なし」なら 0 円。",
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
    description:
      "加工にかかる時間の費用。加工単価（¥/10分）÷ 10 × 加工時間（分）。",
    role: "component",
    order: 40,
    enabled: true,
    expression: `(machiningRatePer10min / 10) * machiningMinutes`,
  },
  {
    id: "coating",
    name: "コート代",
    description:
      "コーティングの費用。コートの種類・最大径・全長から表を引き、コート倍率（丸棒 1.5 / 円筒・OH付 1.3）を掛けて 10 円単位に切り上げます。「無」なら 0 円。",
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
    description: "ラップ処理の費用。選んだ種類ごとの定額です。",
    role: "component",
    order: 60,
    enabled: true,
    expression: `lapAmount(lapType)`,
  },
  {
    id: "ld",
    name: "LD加工",
    description:
      "LD 加工の費用。LD チャージ（¥/10分）÷ 10 × 加工分数（位置・外径・刃長から表で決まります）。LD 加工が「あり」のときだけ加算します。",
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
    description: "検査成績書の費用。選んだ種類ごとの定額です。",
    role: "component",
    order: 80,
    enabled: true,
    expression: `inspectionAmount(inspection)`,
  },
  {
    id: "shapeOut",
    name: "形状出し単価",
    description:
      "形状出し（段取りのための予備形状の試作）にかかる合計。（材料原価 + 段加工費 + 加工単価）× 予備形状本数。最低単価には入らず、1 本あたりに按分した額が「形状出し（1本按分）」として入ります。",
    role: "intermediate",
    order: 90,
    enabled: true,
    expression: `(r.material + r.step + r.machining) * spareShapeCount`,
  },
  {
    id: "shapeOutPerPiece",
    name: "形状出し（1本按分）",
    description:
      "形状出しの合計を按分本数（SY02 の固定値）で割った 1 本あたりの額。段取りの費用を 1 本ずつに薄めて最低単価に含めます。",
    role: "component",
    order: 100,
    enabled: true,
    expression: `r.shapeOut / quantity`,
  },
  {
    id: "final",
    name: "見積単価",
    description:
      "最低単価（上の費用の合計）に補正値を掛けて 10 円単位に切り上げた、基準の見積単価。数量ごとの単価は、価格表の数量段階（倍率）で決まります。",
    role: "final",
    order: 999,
    enabled: true,
    expression: `round(subtotal * correctionFactor, 10)`,
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
  {
    key: "shapeOutBaseQuantity",
    label: "形状出し按分本数",
    type: "number",
    default: 100,
    order: 5,
    scope: "global",
  },
];
