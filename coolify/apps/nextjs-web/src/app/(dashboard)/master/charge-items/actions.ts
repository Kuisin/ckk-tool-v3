"use server";

/**
 * Server Actions — 料金マスタ (MS0G).
 *
 * 送料・梱包費など、製品の代金以外に請求する項目。金額の決まり方は 2 通りで、
 * その判断は lib/charge-core.ts が唯一の定義元（画面の入力欄の活性とサーバーの
 * 保存が同じ関数を見る）。
 *
 * 詳細ページを持たない小マスタなので、編集は一覧のモーダルで完結する
 * （不良種類 MS0A と同じ作り）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/master/charge-items";

function chargeItemInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z
    .object({
      code: z.string().min(1, tr("common.codeRequired")),
      nameJa: z.string().min(1, tr("common.nameJaRequired")),
      nameTranslations: z.record(z.string(), z.string()).optional(),
      amountMode: z.enum(["FIXED", "VARIABLE"]),
      /** 円。FIXED では必須、VARIABLE では既定値（空 = 既定値を出さない）。 */
      defaultAmount: z.number().min(0).nullable(),
      /** 課税区分 id（UI の Select 値。空 = 税区分マスタの既定に従う）。 */
      taxCategoryId: z.string().nullable().default(null),
      sortOrder: z
        .number()
        .int(tr("master.processSteps.sortOrderInteger"))
        .min(0),
      isActive: z.boolean(),
      notes: z.string().optional(),
    })
    .superRefine((v, ctx) => {
      // 固定なのに金額が無いのは設定漏れ。0 円として黙って通すと請求から落ちる
      // （lib/charge-core.ts chargeInputError と同じ判断を、登録の時点で止める）。
      if (v.amountMode === "FIXED" && v.defaultAmount == null) {
        ctx.addIssue({
          code: "custom",
          path: ["defaultAmount"],
          message: tr("master.chargeItems.fixedNeedsAmount"),
        });
      }
    });
}

export type ChargeItemInput = z.infer<ReturnType<typeof chargeItemInputSchema>>;

function revalidate() {
  revalidatePath(BASE_PATH);
}

/** 監査に残す形（金額は数値のまま — 履歴で「500 → 600」が読めるように）。 */
function auditShape(v: ChargeItemInput) {
  return {
    code: v.code.trim(),
    nameJa: v.nameJa,
    amountMode: v.amountMode,
    defaultAmount: v.defaultAmount,
    taxCategoryId: v.taxCategoryId ? Number(v.taxCategoryId) : null,
    sortOrder: v.sortOrder,
    isActive: v.isActive,
  };
}

export async function createChargeItem(
  input: ChargeItemInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = chargeItemInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const created = await prisma.chargeItem.create({
      data: {
        code: v.code.trim(),
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        amountMode: v.amountMode,
        defaultAmount: v.defaultAmount,
        taxCategoryId: v.taxCategoryId ? Number(v.taxCategoryId) : null,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "charge_items",
      recordId: String(created.id),
      after: auditShape(v),
    });
    revalidate();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.chargeItems.createFailed"), tr),
    );
  }
}

export async function updateChargeItem(
  id: number,
  input: ChargeItemInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = chargeItemInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const prior = await prisma.chargeItem.findUnique({
      where: { id },
      select: {
        amountMode: true,
        defaultAmount: true,
        taxCategoryId: true,
        sortOrder: true,
        isActive: true,
      },
    });
    // code は識別子のため更新しない（編集モーダルでも disabled）。
    // ★ 金額を直しても**すでに書いた行は動かない** — 指示書・出荷書の追加料金は
    //   行に単価と金額を焼き込んである（見積・受注の単価と同じ考え方）。
    await prisma.chargeItem.update({
      where: { id },
      data: {
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        amountMode: v.amountMode,
        defaultAmount: v.defaultAmount,
        taxCategoryId: v.taxCategoryId ? Number(v.taxCategoryId) : null,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "charge_items",
      recordId: String(id),
      before: prior
        ? {
            ...prior,
            defaultAmount:
              prior.defaultAmount != null ? Number(prior.defaultAmount) : null,
          }
        : undefined,
      after: auditShape(v),
    });
    revalidate();
    return actionOk({ id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.chargeItems.updateFailed"), tr),
    );
  }
}

export async function setChargeItemsActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));
  try {
    await prisma.chargeItem.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    for (const id of ids) {
      await recordAudit({
        action: "UPDATE",
        tableName: "charge_items",
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

export async function deleteChargeItems(ids: number[]): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));
  try {
    // 使われている項目は消させない。**FK は Restrict なので DB も守る**が、
    // 先に数えて「何に使われているか」を言えるようにする（P2003 の文言は
    // どの書類かを言えない）。
    const [inWorkOrders, inDeliveryOrders] = await Promise.all([
      prisma.workOrderCharge.count({ where: { chargeItemId: { in: ids } } }),
      prisma.deliveryOrderCharge.count({
        where: { chargeItemId: { in: ids } },
      }),
    ]);
    if (inWorkOrders + inDeliveryOrders > 0) {
      return actionError(
        tr("master.chargeItems.inUseCannotDelete", {
          workOrders: inWorkOrders,
          deliveryOrders: inDeliveryOrders,
        }),
      );
    }
    await prisma.chargeItem.deleteMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      await recordAudit({
        action: "DELETE",
        tableName: "charge_items",
        recordId: String(id),
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.chargeItems.deleteFailed"), tr),
    );
  }
}
