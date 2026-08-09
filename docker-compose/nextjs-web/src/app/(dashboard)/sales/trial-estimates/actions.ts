"use server";

/**
 * Server Actions — 試算 (SA05 見積試算).
 *
 * sales.estimates は複合キー (year_month, seq) — EST-YYYYMM-NNNNN は
 * lib/doc-number.ts で導出する。試算は任意で製品にリンクでき（1製品に複数可）、
 * 確定後は価格表（顧客×製品）の作成時に基準単価ソースとして選択される
 * （初回使用時に REGISTERED へロック — sales/price-lists/actions.ts）。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import {
  type DocKey,
  formatEstimateNumber,
  parseDocKey,
} from "@/lib/doc-number";
import {
  fetchMaterialTypeDefaultPrice,
  fetchPriceHistoryByType,
  type MaterialTypeKey,
} from "@/lib/material-pricing";
import {
  computeReferencePrice,
  type MaterialPricePoint,
  type ReferencePriceResult,
} from "@/lib/material-pricing-core";
import { allocateDocumentKey } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { getTrialPricingSettings } from "@/lib/system-settings";
import { calcTrialPricing, type TrialInput } from "@/lib/trial-pricing";
import { toTrialPricingOptions } from "@/lib/trial-pricing-settings";

const BASE_PATH = "/sales/trial-estimates";

export interface MaterialPricing {
  history: MaterialPricePoint[];
  reference: ReferencePriceResult;
}

/** 材種構成キー（材種 × 直径 × 黒皮/研磨）を文字列入力から解決。未確定は null。 */
function toMaterialTypeKey(raw: {
  materialTypeId: string;
  diameterCode: string;
  surfaceFinishCode: string;
}): MaterialTypeKey | null {
  const typeId = Number(raw.materialTypeId);
  if (!Number.isInteger(typeId) || typeId <= 0) return null;
  if (!raw.diameterCode || !raw.surfaceFinishCode) return null;
  return {
    materialTypeId: typeId,
    diameterCode: raw.diameterCode,
    surfaceFinishCode: raw.surfaceFinishCode,
  };
}

/** 材種・直径・黒皮/研磨 の変更時の仕入実績＋ポリシー参照価格（試算フォーム用）。 */
export async function fetchMaterialPricing(raw: {
  materialTypeId: string;
  diameterCode: string;
  surfaceFinishCode: string;
}): Promise<ActionResult<MaterialPricing>> {
  try {
    const key = toMaterialTypeKey(raw);
    const [settings, history, typeDefault] = await Promise.all([
      getTrialPricingSettings(),
      key ? fetchPriceHistoryByType(key) : Promise.resolve([]),
      key ? fetchMaterialTypeDefaultPrice(key) : Promise.resolve(0),
    ]);
    // フォールバック単価: 材種既定単価（¥/1000mm）→ 設定のグローバル既定 → 0。
    const defaultPrice =
      typeDefault > 0 ? typeDefault : settings.defaultMaterialPrice;
    return actionOk({
      history,
      reference: computeReferencePrice(
        history,
        settings.materialPriceBasis,
        settings.materialPriceLookbackMonths,
        undefined,
        defaultPrice,
      ),
    });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "仕入実績の取得に失敗しました"));
  }
}

const trialInputSchema = z.looseObject({
  toolType: z.enum(["ROUND_BAR", "CYLINDER", "OH"]),
  maxDiameter: z.number(),
  totalLength: z.number(),
  materialBarPrice: z.number(),
  machiningMinutes: z.number(),
});

const createInput = z.object({
  name: z.string().min(1, "試算名を入力してください"),
  customerBpId: z.string().nullable(),
  /** 対象製品（任意）— 価格表作成時の基準単価ソース候補になる。 */
  productId: z.string().nullable(),
  materialTypeId: z.string().nullable(),
  diameterCode: z.string().nullable(),
  surfaceFinishCode: z.string().nullable(),
  input: trialInputSchema,
  referenceUnitPrice: z.number().nullable(),
  referenceDate: z.string().nullable(),
  referenceOverridden: z.boolean(),
});

// zod validates the snapshot's load-bearing fields at runtime; the payload
// type keeps the full TrialInput shape for callers.
export type TrialEstimateCreateInput = Omit<
  z.infer<typeof createInput>,
  "input"
> & { input: TrialInput };

function revalidate(number?: string) {
  revalidatePath(BASE_PATH);
  if (number) revalidatePath(`${BASE_PATH}/${number}`);
}

function keyOf(number: string): DocKey | null {
  return parseDocKey(number, "EST");
}

/**
 * 試算価格を「その時点」で記録するためのスナップショット（estimate.result）。
 * 保存/確定時に現在の設定で計算した結果を固定して保存し、後から計算ロジック
 * （計算基準）を変更しても過去の試算の価格が変わらないようにする。
 */
function buildPriceSnapshot(
  input: TrialInput,
  settings: Awaited<ReturnType<typeof getTrialPricingSettings>>,
): Prisma.InputJsonValue {
  const result = calcTrialPricing(input, toTrialPricingOptions(settings));
  // 補正値は scope:"global" のカスタム固定係数から取得（記録用）。
  const correctionFactor = Number(
    settings.customInputs.find((d) => d.key === "correctionFactor")?.default ??
      1.25,
  );
  return {
    ...result,
    pricedAt: new Date().toISOString(),
    correctionFactor,
  } as unknown as Prisma.InputJsonValue;
}

export async function createTrialEstimate(
  payload: TrialEstimateCreateInput,
): Promise<ActionResult<{ number: string }>> {
  const parsed = createInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const authz = await checkPermission("price_list", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const v = parsed.data;
  try {
    const settings = await getTrialPricingSettings();
    const { yearMonth, seq } = await allocateDocumentKey("ESTIMATE");
    await prisma.estimate.create({
      data: {
        yearMonth,
        seq,
        name: v.name,
        toolType: v.input.toolType,
        status: "DRAFT",
        customerBpId: v.customerBpId,
        productId: v.productId ? Number(v.productId) : null,
        materialTypeId: v.materialTypeId ? Number(v.materialTypeId) : null,
        diameterCode: v.diameterCode || null,
        surfaceFinishCode: v.surfaceFinishCode || null,
        referenceUnitPrice: v.referenceUnitPrice,
        referenceDate: v.referenceDate ? new Date(v.referenceDate) : null,
        referenceOverridden: v.referenceOverridden,
        input: v.input as Prisma.InputJsonValue,
        // 作成時点の価格を記録（計算ロジック変更後も過去の価格は不変）。
        result: buildPriceSnapshot(payload.input, settings),
      },
    });
    const number = formatEstimateNumber({ yearMonth, seq });
    await recordAudit({
      action: "CREATE",
      tableName: "estimates",
      recordId: number,
      after: {
        name: v.name,
        toolType: v.input.toolType,
        productId: v.productId,
        materialTypeId: v.materialTypeId,
        diameterCode: v.diameterCode,
        surfaceFinishCode: v.surfaceFinishCode,
        customerBpId: v.customerBpId,
        status: "DRAFT",
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "試算の保存に失敗しました"));
  }
}

export async function confirmTrialEstimate(
  number: string,
): Promise<ActionResult> {
  const key = keyOf(number);
  if (!key) return actionError("試算番号が不正です");
  const authz = await checkPermission("price_list", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const estimate = await prisma.estimate.findUnique({
      where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    });
    if (!estimate) return actionError("試算が見つかりません");
    if (estimate.status !== "DRAFT") {
      return actionError("下書きの試算のみ確定できます");
    }
    // 確定時点の価格を再スナップショット（この時点の設定で固定）。
    const settings = await getTrialPricingSettings();
    const result = buildPriceSnapshot(
      estimate.input as unknown as TrialInput,
      settings,
    );
    await prisma.estimate.update({
      where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
      data: { status: "CONFIRMED", result },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "estimates",
      recordId: number,
      before: { status: "DRAFT" },
      after: { status: "CONFIRMED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "確定に失敗しました"));
  }
}
