"use server";

/**
 * Server Actions — 価格試算 (SA01 価格試算).
 *
 * sales.estimates は複合キー (year_month, seq) — EST-YYYYMM-NNNNN は
 * lib/doc-number.ts で導出する。価格試算は任意で製品にリンクでき（1製品に複数可）、
 * 確定後は価格表（顧客×製品）の作成時に基準単価ソースとして選択される
 * （初回使用時に REGISTERED へロック — sales/price-lists/actions.ts）。
 */

import { type Access, rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
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
import { resolveSalesRepId } from "@/lib/sales-rep";
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

/** 取得済みの価格試算行がスコープ内か（OWN 行チェック）。ALL は素通し。 */
function estimateInScope(
  access: Access,
  userId: string,
  row: { createdBy: string | null },
): boolean {
  return rowInScope(access, { createdBy: row.createdBy }, userId);
}

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

/** 材種・直径・黒皮/研磨 の変更時の仕入実績＋ポリシー参照価格（価格試算フォーム用）。 */
export async function fetchMaterialPricing(raw: {
  materialTypeId: string;
  diameterCode: string;
  surfaceFinishCode: string;
}): Promise<ActionResult<MaterialPricing>> {
  const authz = await checkPermission("price_list", "READ");
  if (!authz.ok) return actionError(authz.error);
  const tr = await getTranslations();
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
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.trialEstimateActions.purchaseHistoryFetchFailed"),
        tr,
      ),
    );
  }
}

const trialInputSchema = z.looseObject({
  // 工具種は管理者定義（trial_pricing.tool_types）— 実在チェックは保存時に
  // 設定リストと突き合わせる。
  toolType: z.string().min(1),
  maxDiameter: z.number(),
  totalLength: z.number(),
  materialBarPrice: z.number(),
  machiningMinutes: z.number(),
});

function createInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    name: z.string().min(1, tr("sales.trialEstimates.enterAPriceEstimateName")),
    customerBpId: z.string().nullable(),
    /** 営業担当 — 未指定なら顧客の主担当が入る（lib/sales-rep）。 */
    salesRepId: z.string().nullable().optional(),
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
}

// zod validates the snapshot's load-bearing fields at runtime; the payload
// type keeps the full TrialInput shape for callers.
export type TrialEstimateCreateInput = Omit<
  z.infer<ReturnType<typeof createInputSchema>>,
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
 * 価格試算価格を「その時点」で記録するためのスナップショット（estimate.result）。
 * 保存/確定時に現在の設定で計算した結果を固定して保存し、後から計算ロジック
 * （計算基準）を変更しても過去の価格試算の価格が変わらないようにする。
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
  const tr = await getTranslations();
  const parsed = createInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const authz = await checkPermission("price_list", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const v = parsed.data;
  try {
    const settings = await getTrialPricingSettings();
    if (!settings.toolTypes.some((t) => t.value === v.input.toolType)) {
      return actionError(
        tr("sales.trialEstimateActions.toolTypeNotDefined", {
          toolType: v.input.toolType,
        }),
      );
    }
    const { yearMonth, seq } = await allocateDocumentKey("ESTIMATE");
    const salesRepId = await resolveSalesRepId(
      v.salesRepId,
      v.customerBpId,
      null,
    );
    await prisma.estimate.create({
      data: {
        yearMonth,
        seq,
        name: v.name,
        toolType: v.input.toolType,
        status: "DRAFT",
        customerBpId: v.customerBpId,
        salesRepId,
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
        createdBy: authz.userId,
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
        salesRepId,
        status: "DRAFT",
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("sales.trialEstimateActions.saveFailed"), tr),
    );
  }
}

/**
 * 製品リンクの設定/解除（詳細画面から）。REGISTERED は価格表が参照済みのため
 * 変更不可。productId = null で解除。
 */
export async function linkTrialEstimateProduct(
  number: string,
  productId: string | null,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = keyOf(number);
  if (!key)
    return actionError(tr("sales.trialEstimateActions.invalidEstimateNumber"));
  const authz = await checkPermission("price_list", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const estimate = await prisma.estimate.findUnique({
      where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    });
    if (!estimate)
      return actionError(tr("sales.trialEstimateActions.notFound"));
    if (!estimateInScope(authz.access, authz.userId, estimate)) {
      return actionError(tr("common.outOfScope"));
    }
    if (estimate.status === "REGISTERED") {
      return actionError(
        tr("sales.trialEstimateActions.productLinkLockedByPriceList"),
      );
    }
    let idNum: number | null = null;
    if (productId !== null) {
      idNum = Number(productId);
      if (!Number.isInteger(idNum) || idNum <= 0) {
        return actionError(tr("sales.trialEstimateActions.invalidProduct"));
      }
      const product = await prisma.product.findUnique({
        where: { id: idNum },
      });
      if (!product)
        return actionError(tr("sales.trialEstimateActions.productNotFound"));
    }
    if ((estimate.productId ?? null) === idNum) return actionOk();
    await prisma.estimate.update({
      where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
      data: { productId: idNum },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "estimates",
      recordId: number,
      before: {
        productId:
          estimate.productId != null ? String(estimate.productId) : null,
      },
      after: { productId: idNum != null ? String(idNum) : null },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.trialEstimateActions.productLinkUpdateFailed"),
        tr,
      ),
    );
  }
}

export async function confirmTrialEstimate(
  number: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = keyOf(number);
  if (!key)
    return actionError(tr("sales.trialEstimateActions.invalidEstimateNumber"));
  const authz = await checkPermission("price_list", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const estimate = await prisma.estimate.findUnique({
      where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    });
    if (!estimate)
      return actionError(tr("sales.trialEstimateActions.notFound"));
    if (!estimateInScope(authz.access, authz.userId, estimate)) {
      return actionError(tr("common.outOfScope"));
    }
    if (estimate.status !== "DRAFT") {
      return actionError(
        tr("sales.trialEstimateActions.onlyDraftCanBeConfirmed"),
      );
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
    return actionError(
      prismaErrorMessage(e, tr("sales.trialEstimateActions.confirmFailed"), tr),
    );
  }
}
