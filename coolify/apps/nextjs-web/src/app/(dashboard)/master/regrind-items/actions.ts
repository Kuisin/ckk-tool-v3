"use server";

/**
 * Server Actions — 再研磨品目 (MS0H).
 *
 * ## これは何のマスタか
 *
 * **再研磨という役務そのものを 1 つの品目として持つ。** 値段はここに付く。
 * 旧 FileMaker の 再研マスタ（材料 × 加工箇所 × 刃数 × サイズ帯 → ¥390 / ¥540）
 * が 1 行 1 品目になったもので、条件の組み合わせぶんだけ行が並ぶ。
 *
 * 研ぎ直す**工具**のほうは製品マスタ (MS04) の行（他社製品を含む）で、
 * 注文明細では別の欄（`order_lines.tool_item_id`）が指す。売る物と預かる物を
 * 分けてあるので、値段は工具の型番ごとに作らずに済む。
 *
 * ## 値段の決まり方（S/4HANA と同じ 2 段）
 *
 *   1. ここの**標準価格**（顧客を問わない定価）
 *   2. 顧客ごとの**価格表**（あればこちらが勝つ）
 *
 * 落とし込みは `lib/standard-price.ts` と `resolvePriceFromEntries`。
 *
 * 詳細ページを持たない小マスタなので、編集は一覧のモーダルで完結する
 * （料金マスタ MS0G・不良種類 MS0A と同じ作り）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { normalizeKeywords } from "@/lib/master-keywords";
import { nextDocumentNumber } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/master/regrind-items";

function regrindItemInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z
    .object({
      nameJa: z.string().min(1, tr("common.nameJaRequired")),
      nameTranslations: z.record(z.string(), z.string()).optional(),
      unit: z.string().min(1),
      /** 標準価格（円）。空 = 顧客の価格表でしか値段が付かない品目。 */
      standardUnitPrice: z.number().min(0).nullable(),
      /** 工具の種類（例: 超硬ヘリカルエンドミル）。 */
      toolClass: z.string().nullable(),
      /** 加工箇所（例: 外周 + 溝）。 */
      location: z.string().nullable(),
      /** 刃数。空 = 刃数で値段が変わらない品目。 */
      flutes: z.number().int().min(1).nullable(),
      /** サイズ帯（mm）— min < 径 ≤ max。片側だけでもよい。 */
      sizeMinMm: z.number().min(0).nullable(),
      sizeMaxMm: z.number().min(0).nullable(),
      matchNames: z.array(z.string()).default([]),
      isActive: z.boolean(),
      notes: z.string().optional(),
    })
    .superRefine((v, ctx) => {
      // 逆に入れられると「決して当たらない帯」が静かにできる（DB の CHECK
      // items_regrind_size_band と同じ判断を、入力の時点で言葉にして返す）。
      if (
        v.sizeMinMm != null &&
        v.sizeMaxMm != null &&
        v.sizeMinMm >= v.sizeMaxMm
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["sizeMaxMm"],
          message: tr("master.regrindItems.sizeBandOrder"),
        });
      }
    });
}

export type RegrindItemInput = z.infer<
  ReturnType<typeof regrindItemInputSchema>
>;

function revalidate() {
  revalidatePath(BASE_PATH);
}

const trimOrNull = (v: string | null | undefined) => v?.trim() || null;

/** items の列に落とす形（create / update が同じ形を書く）。 */
function itemData(v: RegrindItemInput) {
  return {
    name: localizedInput(v.nameJa, undefined, v.nameTranslations),
    unit: v.unit,
    standardUnitPrice: v.standardUnitPrice,
    regrindToolClass: trimOrNull(v.toolClass),
    regrindLocation: trimOrNull(v.location),
    regrindFlutes: v.flutes,
    regrindSizeMinMm: v.sizeMinMm,
    regrindSizeMaxMm: v.sizeMaxMm,
    matchNames: normalizeKeywords(v.matchNames),
    isActive: v.isActive,
    notes: trimOrNull(v.notes),
  };
}

/** 監査に残す形（金額・寸法は数値のまま — 履歴で「390 → 540」が読める）。 */
function auditShape(v: RegrindItemInput) {
  return {
    nameJa: v.nameJa,
    unit: v.unit,
    standardUnitPrice: v.standardUnitPrice,
    regrindToolClass: trimOrNull(v.toolClass),
    regrindLocation: trimOrNull(v.location),
    regrindFlutes: v.flutes,
    regrindSizeMinMm: v.sizeMinMm,
    regrindSizeMaxMm: v.sizeMaxMm,
    isActive: v.isActive,
  };
}

export async function createRegrindItem(
  input: RegrindItemInput,
): Promise<ActionResult<{ id: number; code: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = regrindItemInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    // コードは採番（RGD-YYYYMM-NNNN）。何百と並ぶマスタなので、人に
    // 考えさせない — 見分けるのは条件（種類 / 箇所 / 刃数 / サイズ帯）のほう。
    const code = await nextDocumentNumber("REGRIND_ITEM");
    const created = await prisma.item.create({
      data: { itemType: "REGRIND", code, ...itemData(v) },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "items",
      recordId: String(created.id),
      after: { code, ...auditShape(v) },
    });
    revalidate();
    return actionOk({ id: created.id, code });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.regrindItems.createFailed"), tr),
    );
  }
}

export async function updateRegrindItem(
  id: number,
  input: RegrindItemInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = regrindItemInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const prior = await prisma.item.findFirst({
      where: { id, itemType: "REGRIND" },
      select: {
        code: true,
        standardUnitPrice: true,
        regrindToolClass: true,
        regrindLocation: true,
        regrindFlutes: true,
        regrindSizeMinMm: true,
        regrindSizeMaxMm: true,
        isActive: true,
      },
    });
    if (!prior) return actionError(tr("master.regrindItems.notFound"));
    // ★ 値段を直しても**すでに書いた明細は動かない** — 見積・注文請書の
    //   単価は行に焼き込んである（価格表と同じ考え方）。
    await prisma.item.update({ where: { id }, data: itemData(v) });
    await recordAudit({
      action: "UPDATE",
      tableName: "items",
      recordId: String(id),
      before: {
        ...prior,
        standardUnitPrice:
          prior.standardUnitPrice != null
            ? Number(prior.standardUnitPrice)
            : null,
        regrindSizeMinMm:
          prior.regrindSizeMinMm != null
            ? Number(prior.regrindSizeMinMm)
            : null,
        regrindSizeMaxMm:
          prior.regrindSizeMaxMm != null
            ? Number(prior.regrindSizeMaxMm)
            : null,
      },
      after: { code: prior.code, ...auditShape(v) },
    });
    revalidate();
    return actionOk({ id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.regrindItems.updateFailed"), tr),
    );
  }
}

export async function setRegrindItemsActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));
  try {
    await prisma.item.updateMany({
      where: { id: { in: ids }, itemType: "REGRIND" },
      data: { isActive },
    });
    for (const id of ids) {
      await recordAudit({
        action: "UPDATE",
        tableName: "items",
        recordId: String(id),
        after: { isActive },
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.statusUpdateFailed"), tr),
    );
  }
}

export async function deleteRegrindItems(ids: number[]): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));
  try {
    // 使われている品目は消させない。**FK は Restrict なので DB も守る**が、
    // 先に数えて「どこで使われているか」を言えるようにする（P2003 の文言は
    // それを言えない）。無効化のほうが普通の運用 — 値段を変えるときは
    // 古い行を無効にして新しい行を足す。
    const [inLines, inQuotes, inPriceLists] = await Promise.all([
      prisma.orderLine.count({ where: { itemId: { in: ids } } }),
      prisma.quoteItem.count({ where: { itemId: { in: ids } } }),
      prisma.priceListEntry.count({ where: { itemId: { in: ids } } }),
    ]);
    if (inLines + inQuotes + inPriceLists > 0) {
      return actionError(
        tr("master.regrindItems.inUseCannotDelete", {
          orderLines: inLines,
          quotes: inQuotes,
          priceLists: inPriceLists,
        }),
      );
    }
    await prisma.item.deleteMany({
      where: { id: { in: ids }, itemType: "REGRIND" },
    });
    for (const id of ids) {
      await recordAudit({
        action: "DELETE",
        tableName: "items",
        recordId: String(id),
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.regrindItems.deleteFailed"), tr),
    );
  }
}
