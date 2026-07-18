/**
 * trial-pricing.ts — 見積試算 calculation engine (pure).
 *
 * Ports the cost chain from the master Excel「最新見積書試算」across its three
 * tool variants — ROUND_BAR (丸棒見積), CYLINDER (円筒見積), OH (OH付見積もり).
 * Per-piece cost is built from component costs, then per-lot pricing applies a
 * lot discount and the 2022 correction factor.
 *
 * Inputs are plain numbers/strings (UI-friendly); reference tables come from
 * `trial-pricing-data.ts`; the material bar price comes from purchase history
 * (`material-pricing.ts`) and is passed in as `materialBarPrice`.
 */

import type {
  Criterion,
  CustomInputDef,
  LookupTable,
} from "./trial-pricing-criteria";
import {
  CENTERLESS,
  COATING_FACTOR,
  CORRECTION_FACTOR,
  CYLINDER_MACHINING,
  CYLINDER_TYPE_OPTIONS,
  coatingRawCost,
  INSPECTION_OPTIONS,
  LAP_OPTIONS,
  LD_CHARGE_PER_10MIN,
  ldMinutes,
  lookupMatrix,
  lotDiscountRate,
  MATERIAL_BASIS_LENGTH_MM,
  NECK_MACHINING,
  NECK_TYPE_OPTIONS,
  STEP_MACHINING,
  STEP_TYPE_OPTIONS,
} from "./trial-pricing-data";
import { runCriteriaEngine } from "./trial-pricing-engine";
import { applyCustomScript } from "./trial-pricing-script";

export type ToolType = "ROUND_BAR" | "CYLINDER" | "OH";

export const TOOL_TYPE_OPTIONS = [
  { value: "ROUND_BAR", label: "丸棒" },
  { value: "CYLINDER", label: "円筒" },
  { value: "OH", label: "OH付" },
] as const;

export interface TrialInput {
  toolType: ToolType;
  maxDiameter: number; // 最大径 (mm)
  totalLength: number; // 全長 (mm)
  /** 仕入実績の参照単価 (¥/1000mm, 1000mm基準) — ROUND_BAR/OH 用 (purchase history より). */
  materialBarPrice: number;
  /** 黒皮材か (true でセンタレス費を加算). */
  isBlackSkin: boolean;
  /** CYLINDER: 手入力素材価格 (¥/本). */
  cylinderMaterialPrice?: number;
  cylinderType?: string; // CYLINDER_TYPE value
  // 段加工
  stepLength: number; // 段加工長 (mm)
  stepType: string; // STEP_TYPE value
  // 首下加工
  neckLength: number; // 首下加工長 (mm)
  neckType: string; // NECK_TYPE value
  // コート / 処理
  coating: string; // coating name ("無" = なし)
  lapType: string; // LAP value
  inspection: string; // INSPECTION value
  // LD
  ldEnabled: boolean;
  ldLocation: string;
  ldOuterDiameter: number;
  ldBladeLength: number;
  // 加工
  machiningMinutes: number; // 加工時間/分
  machiningRatePer10min: number; // 加工単価/10分
  spareShapeCount: number; // 予備形状本数
  // ロット (1–3 tiers)
  lotQuantities: number[];
  /**
   * ロット別の掛け率の手動指定（lotQuantities と同じ index）。
   * null/undefined の要素はロット別の自動掛け率を使う。
   */
  lotMarkups?: (number | null)[];
}

export interface CostBreakdown {
  material: number; // 材料原価 (centerless 含む)
  step: number; // 段加工費
  neck: number; // 首下加工費
  machining: number; // 加工単価
  coating: number; // コート代
  lap: number; // ラップ処理
  ld: number; // LD
  inspection: number; // 検査成績書
}

export interface LotResult {
  /** index into TrialInput.lotQuantities (for per-lot markup editing). */
  lotIndex: number;
  quantity: number;
  perPiece: number; // 1本単価 (形状出し ÷ lot)
  minimumPrice: number; // 最低単価
  autoRate: number; // ロット別の自動掛け率
  discountRate: number; // 適用掛け率 (override があればそれ)
  estimateUnitPrice: number; // 見積単価 (×補正値, ROUNDUP -1)
}

export interface TrialResult {
  breakdown: CostBreakdown;
  shapeOutPrice: number; // 形状出し単価 = (材料+段加工+加工単価)×形状本数
  lots: LotResult[];
  warnings: string[];
}

const roundUp = (n: number, digits: number) => {
  const f = 10 ** -digits;
  return Math.ceil(n / f) * f;
};
const optAmount = (
  opts: readonly { value: string; amount: number | null }[],
  v: string,
) => opts.find((o) => o.value === v)?.amount ?? 0;
const optRate = (opts: readonly { value: string; rate: number }[], v: string) =>
  opts.find((o) => o.value === v)?.rate ?? 0;

/** Global constants overridable from system settings (else Excel defaults). */
export interface TrialPricingOptions {
  correctionFactor?: number;
  ldChargePer10min?: number;
  /** @deprecated カスタム計算 JS は廃止（設定 UI から削除）。既存データ互換のため残置。 */
  customScript?: string;
  /** @deprecated カスタム計算は適用しない。 */
  runCustomScript?: boolean;
  /** 設定された計算基準（未設定は既定の基準セット = 従来ロジック）。 */
  criteria?: Criterion[];
  /** 管理者が追加したカスタム入力項目（式の変数として利用可能）。 */
  customInputs?: CustomInputDef[];
  /** 管理者が定義したルックアップ表（式内で lookup("<name>", key)）。 */
  lookupTables?: LookupTable[];
}

/**
 * 見積試算のエントリポイント。計算は設定された criteria（既定 = 従来ロジックを
 * 再現する DEFAULT_CRITERIA）で行い、最後に管理者のカスタム計算 JS を後処理として
 * 適用する。従来の固定ロジックは `calcTrialPricingLegacy`（パリティテストの
 * 参照実装）として残す。シグネチャと `TrialResult` は不変。
 */
export function calcTrialPricing(
  input: TrialInput,
  opts: TrialPricingOptions = {},
): TrialResult {
  const base = runCriteriaEngine(input, opts);
  if (opts.runCustomScript && opts.customScript?.trim()) {
    const correction = opts.correctionFactor ?? CORRECTION_FACTOR;
    const ldCharge = opts.ldChargePer10min ?? LD_CHARGE_PER_10MIN;
    return applyCustomScript(opts.customScript, {
      input,
      result: base,
      settings: { correctionFactor: correction, ldChargePer10min: ldCharge },
    }).result;
  }
  return base;
}

/**
 * 従来の固定計算ロジック（Excel 由来）。criteria エンジン導入後は `DEFAULT_CRITERIA`
 * がこれを再現し、この関数はパリティテストの参照実装として保持する。
 */
export function calcTrialPricingLegacy(
  input: TrialInput,
  opts: TrialPricingOptions = {},
): TrialResult {
  const warnings: string[] = [];
  const dia = input.maxDiameter;
  const len = input.totalLength;
  const correction = opts.correctionFactor ?? CORRECTION_FACTOR;
  const ldCharge = opts.ldChargePer10min ?? LD_CHARGE_PER_10MIN;

  // ── 材料原価 ──────────────────────────────────────────────────────────────
  let material = 0;
  if (input.toolType === "CYLINDER") {
    // 素材価格(手入力) + 円筒加工費(×種類掛け率)
    const cyl = lookupMatrix(CYLINDER_MACHINING, dia, len) ?? 0;
    const cylRate = optRate(
      CYLINDER_TYPE_OPTIONS,
      input.cylinderType ?? "NORMAL",
    );
    material = (input.cylinderMaterialPrice ?? 0) + cyl * cylRate;
    if (cyl === 0) warnings.push("円筒加工費が範囲外です（最大径/全長を確認）");
  } else {
    // 丸棒/OH: 材料原価 = 参照単価(¥/1000mm) × (全長 ÷ 1000mm) (+ センタレス if 黒皮)
    const perPieceMaterial = roundUp(
      input.materialBarPrice * (len / MATERIAL_BASIS_LENGTH_MM),
      0,
    );
    let centerless = 0;
    if (input.isBlackSkin) {
      centerless = lookupMatrix(CENTERLESS, dia, len) ?? 0;
      if (input.toolType === "OH") centerless = roundUp(centerless * 1.3, 0);
    }
    material = perPieceMaterial + centerless;
    if (input.materialBarPrice <= 0)
      warnings.push("素材の仕入実績がありません（1000mm単価を入力）");
  }

  // ── 段加工費 ──────────────────────────────────────────────────────────────
  let step = 0;
  if (input.stepLength >= 0.01 && input.stepType !== "NONE") {
    const base = lookupMatrix(STEP_MACHINING, dia, input.stepLength);
    if (base == null) warnings.push("段加工費が範囲外です");
    step = (base ?? 0) * optRate(STEP_TYPE_OPTIONS, input.stepType);
  }

  // ── 首下加工費 ────────────────────────────────────────────────────────────
  let neck = 0;
  if (input.neckLength >= 0.01 && input.neckType !== "NONE") {
    const base = lookupMatrix(NECK_MACHINING, dia, input.neckLength);
    if (base == null) warnings.push("首下加工費が範囲外です");
    neck = (base ?? 0) * optRate(NECK_TYPE_OPTIONS, input.neckType);
  }

  // ── 加工単価 ──────────────────────────────────────────────────────────────
  const machining = (input.machiningRatePer10min / 10) * input.machiningMinutes;

  // ── コート代 (×1.5, ROUNDUP -1) ──────────────────────────────────────────
  let coating = 0;
  if (input.coating && input.coating !== "無") {
    coating = roundUp(
      coatingRawCost(input.coating, dia, len) * COATING_FACTOR,
      -1,
    );
  }

  // ── ラップ処理 (有(OSG) = コート代/2) ────────────────────────────────────
  const lapBase = optAmount(LAP_OPTIONS, input.lapType);
  const lap = input.lapType === "OSG" ? coating / 2 : lapBase;

  // ── LD ────────────────────────────────────────────────────────────────────
  let ld = 0;
  if (input.ldEnabled) {
    const mins = ldMinutes(
      input.ldLocation,
      input.ldOuterDiameter,
      input.ldBladeLength,
    );
    ld = (ldCharge / 10) * mins;
  }

  // ── 検査成績書 ────────────────────────────────────────────────────────────
  const inspection = optAmount(INSPECTION_OPTIONS, input.inspection);

  const breakdown: CostBreakdown = {
    material,
    step,
    neck,
    machining,
    coating,
    lap,
    ld,
    inspection,
  };

  // ── 形状出し単価 = (材料原価 + 段加工費 + 加工単価) × 形状本数 ─────────────
  const shapeOutPrice = (material + step + machining) * input.spareShapeCount;

  // ── ロットごとの価格 ──────────────────────────────────────────────────────
  const lots: LotResult[] = input.lotQuantities
    .map((quantity, lotIndex) => ({ quantity, lotIndex }))
    .filter((x) => x.quantity >= 1)
    .map(({ quantity, lotIndex }) => {
      const perPiece = shapeOutPrice / quantity;
      // 最低単価 = 材料+段加工+首下+加工単価+コート+ラップ+LD+1本単価+検査
      const minimumPrice =
        material +
        step +
        neck +
        machining +
        coating +
        lap +
        ld +
        perPiece +
        inspection;
      const autoRate = lotDiscountRate(quantity);
      const override = input.lotMarkups?.[lotIndex];
      const discountRate =
        override != null && override > 0 ? override : autoRate;
      const estimateUnitPrice = roundUp(
        minimumPrice * discountRate * correction,
        -1,
      );
      return {
        lotIndex,
        quantity,
        perPiece,
        minimumPrice,
        autoRate,
        discountRate,
        estimateUnitPrice,
      };
    });

  const base: TrialResult = { breakdown, shapeOutPrice, lots, warnings };

  // ── カスタム計算（管理者設定の JS フック）─────────────────────────────────
  // system 権限者が設定した後処理スクリプトを、確定した result に適用する。
  // 失敗しても base を返す（applyCustomScript は throw しない）。
  if (opts.runCustomScript && opts.customScript?.trim()) {
    return applyCustomScript(opts.customScript, {
      input,
      result: base,
      settings: { correctionFactor: correction, ldChargePer10min: ldCharge },
    }).result;
  }
  return base;
}
