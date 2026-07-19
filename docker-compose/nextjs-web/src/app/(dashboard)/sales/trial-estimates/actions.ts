"use server";

/**
 * Server Actions — 試算 (SA05 見積試算).
 *
 * sales.estimates は複合キー (year_month, seq) — EST-YYYYMM-NNNNN は
 * lib/doc-number.ts で導出する。「価格表に登録」は price_list_entries
 * ((year_month, seq) 採番 = PRC-番号) + 既定 tier を作成し、試算を
 * REGISTERED にロックする。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import {
  type DocKey,
  formatEstimateNumber,
  formatPriceListNumber,
  parseDocKey,
} from "@/lib/doc-number";
import { fetchPriceHistory } from "@/lib/material-pricing";
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

/** 素材変更時の仕入実績＋ポリシー参照価格（試算フォーム用）。 */
export async function fetchMaterialPricing(
  materialId: string,
): Promise<ActionResult<MaterialPricing>> {
  try {
    const idNum = Number(materialId);
    const [settings, history] = await Promise.all([
      getTrialPricingSettings(),
      Number.isInteger(idNum) && idNum > 0
        ? fetchPriceHistory(idNum)
        : Promise.resolve([]),
    ]);
    return actionOk({
      history,
      reference: computeReferencePrice(
        history,
        settings.materialPriceBasis,
        settings.materialPriceLookbackMonths,
        undefined,
        settings.defaultMaterialPrice,
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
  materialId: z.string().min(1, "素材を選択してください"),
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
        materialId: Number(v.materialId),
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
        materialId: v.materialId,
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

const registerInput = z.object({
  estimateNumber: z.string(),
  customerBpId: z.string().min(1, "顧客を選択してください"),
  productId: z.string().min(1, "製品を選択してください"),
  orderType: z.enum(["PRODUCTION", "TEST", "SAMPLE", "OTHER"]),
  baseUnitPrice: z.number().min(0),
  validFrom: z.string().min(1, "有効開始日を選択してください"),
  validUntil: z.string().nullable(),
});

export type RegisterPriceListInput = z.infer<typeof registerInput>;

/**
 * 試算 → 価格表登録 (CONFIRMED → REGISTERED).
 * Creates the entry + a default tier (1本〜 ×1.00) in one transaction and
 * locks the 試算. Fails when the (顧客, 製品, 注文種別) entry already exists.
 */
export async function registerPriceListFromEstimate(
  payload: RegisterPriceListInput,
): Promise<ActionResult<{ entryId: string }>> {
  const parsed = registerInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  const key = keyOf(v.estimateNumber);
  if (!key) return actionError("試算番号が不正です");
  const authz = await checkPermission("price_list", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const estimate = await prisma.estimate.findUnique({
      where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    });
    if (!estimate) return actionError("試算が見つかりません");
    if (estimate.status !== "CONFIRMED") {
      return actionError("確定済みの試算のみ価格表に登録できます");
    }
    const entryKey = await allocateDocumentKey("PRICE_LIST");
    await prisma.$transaction([
      prisma.priceListEntry.create({
        data: {
          yearMonth: entryKey.yearMonth,
          seq: entryKey.seq,
          customerBpId: v.customerBpId,
          productId: Number(v.productId),
          orderType: v.orderType,
          baseUnitPrice: v.baseUnitPrice,
          validFrom: new Date(v.validFrom),
          validUntil: v.validUntil ? new Date(v.validUntil) : null,
          estimateYearMonth: key.yearMonth,
          estimateSeq: key.seq,
          tiers: {
            create: [
              {
                minQuantity: 1,
                maxQuantity: null,
                multiplier: 1,
                priceOverride: null,
                sortOrder: 0,
              },
            ],
          },
        },
      }),
      prisma.estimate.update({
        where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
        data: { status: "REGISTERED", registeredAt: new Date() },
      }),
    ]);
    const entryId = formatPriceListNumber(entryKey);
    await recordAudit({
      action: "UPDATE",
      tableName: "estimates",
      recordId: v.estimateNumber,
      before: { status: "CONFIRMED" },
      after: { status: "REGISTERED", priceListEntry: entryId },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "price_list_entries",
      recordId: entryId,
      after: {
        baseUnitPrice: v.baseUnitPrice,
        validFrom: v.validFrom,
        validUntil: v.validUntil,
        source: `試算 ${v.estimateNumber}`,
      },
    });
    revalidate(v.estimateNumber);
    revalidatePath("/sales/price-lists");
    revalidatePath(`/sales/price-lists/${entryId}`);
    return actionOk({ entryId });
  } catch (e) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code: unknown }).code)
        : undefined;
    if (code === "P2002") {
      return actionError(
        "同一の顧客・製品・注文種別の価格表が既に存在します。既存の価格表を編集してください。",
      );
    }
    return actionError(prismaErrorMessage(e, "価格表への登録に失敗しました"));
  }
}
