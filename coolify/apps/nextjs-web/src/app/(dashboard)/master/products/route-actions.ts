"use server";

/**
 * Server Actions — 製品工程ルート（工程リスト）(MS24 工程タブ).
 *
 * ルートは製品ごとの名前付き工程リスト。バージョンは不変スナップショット
 * （作成のみ — 編集・削除不可）。工程構成の検証は指示書と同じ
 * validateAndOrderSteps（lib/workflow.ts）を共用する。
 * 指示書からの自動バージョン保存は work-orders/actions.ts 側
 * （resolveRouteVersionTx — work_order:CREATE/UPDATE 権限で実行。判断メモ:
 * 指示書保存の一部であり、マスタ権限を別途要求しない）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  createRouteVersionTx,
  createRouteWithVersionTx,
} from "@/lib/product-routes";
import { routeStepsEqual } from "@/lib/product-routes-core";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";
import { validateAndOrderSteps } from "@/lib/workflow";

const BASE_PATH = "/master/products";

type Tr = Awaited<ReturnType<typeof getTranslations>>;

const stepInput = z.object({
  processStepId: z.number().int().positive(),
  executionLocation: z.enum(["INTERNAL", "OUTSOURCE"]),
  plantId: z.number().int().positive().nullable(),
  supplierBpId: z.string().nullable(),
  // 標準作業時間 (h) — 任意（0.01〜9999.99）
  workHours: z.number().positive().max(9999.99).nullable(),
  // ロット入力の上書き（null/未指定 = 工程マスタの既定を継承）
  lotInputMode: z.enum(["REQUIRED", "OPTIONAL", "NONE"]).nullable().optional(),
});

function routeCreateInputSchema(tr: Tr) {
  return z.object({
    nameJa: z
      .string()
      .min(1, tr("master.products.enterTheRouteNameInJapanese")),
    nameEn: z.string().optional(),
    // 対象の受注元（取引先）。null = 汎用ルート。
    customerBpId: z.string().uuid().nullable().optional(),
    notes: z.string().optional(),
    steps: z
      .array(stepInput)
      .min(1, tr("master.products.selectAtLeastOneStep")),
  });
}

function routeVersionCreateInputSchema(tr: Tr) {
  return z.object({
    notes: z.string().optional(),
    steps: z
      .array(stepInput)
      .min(1, tr("master.products.selectAtLeastOneStep")),
  });
}

function routeUpdateInputSchema(tr: Tr) {
  return z.object({
    nameJa: z
      .string()
      .min(1, tr("master.products.enterTheRouteNameInJapanese")),
    nameEn: z.string().optional(),
    isActive: z.boolean(),
    notes: z.string().optional(),
  });
}

export type ProductRouteCreateInput = z.infer<
  ReturnType<typeof routeCreateInputSchema>
>;
export type ProductRouteVersionCreateInput = z.infer<
  ReturnType<typeof routeVersionCreateInputSchema>
>;
export type ProductRouteUpdateInput = z.infer<
  ReturnType<typeof routeUpdateInputSchema>
>;

function revalidate(productId: number) {
  revalidatePath(`${BASE_PATH}/${productId}`);
}

/** ルート新規作成（v1 を同時に作成）。 */
export async function createProductRoute(
  productId: number,
  input: ProductRouteCreateInput,
): Promise<ActionResult<{ routeId: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = routeCreateInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product)
      return actionError(
        tr("master.productRouteActions.targetProductNotFound"),
      );
    const built = await validateAndOrderSteps(v.steps);
    if (!built.ok) return actionError(built.error);
    const actor = await getCurrentActorId();

    const created = await prisma.$transaction((tx) =>
      createRouteWithVersionTx(tx, {
        productId,
        name: localizedInput(v.nameJa, v.nameEn),
        customerBpId: v.customerBpId ?? null,
        steps: built.creates,
        actor,
        notes: v.notes,
      }),
    );

    await recordAudit({
      action: "CREATE",
      tableName: "product_process_routes",
      recordId: String(created.routeId),
      after: {
        productId,
        nameJa: v.nameJa,
        customerBpId: v.customerBpId ?? null,
        stepCount: built.creates.length,
        version: 1,
      },
    });
    revalidate(productId);
    return actionOk({ routeId: created.routeId });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.productRouteActions.createFailed"), tr),
    );
  }
}

/** 新バージョン作成（最新と同一構成は拒否 — バージョンの空回りを防ぐ）。 */
export async function createProductRouteVersion(
  routeId: number,
  input: ProductRouteVersionCreateInput,
): Promise<ActionResult<{ version: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = routeVersionCreateInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const route = await prisma.productProcessRoute.findUnique({
      where: { id: routeId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          include: { steps: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (!route)
      return actionError(tr("master.productRouteActions.targetRouteNotFound"));
    const built = await validateAndOrderSteps(v.steps);
    if (!built.ok) return actionError(built.error);

    const latest = route.versions[0];
    if (
      latest &&
      routeStepsEqual(
        latest.steps.map((s) => ({
          processStepId: s.processStepId,
          sortOrder: s.sortOrder,
          executionLocation: s.executionLocation,
          plantId: s.plantId,
          supplierBpId: s.supplierBpId,
          workHours: s.workHours == null ? null : Number(s.workHours),
        })),
        built.creates,
      )
    ) {
      return actionError(
        tr("master.productRouteActions.sameAsLatestVersion", {
          version: latest.version,
        }),
      );
    }
    const actor = await getCurrentActorId();
    const created = await prisma.$transaction((tx) =>
      createRouteVersionTx(tx, {
        routeId,
        steps: built.creates,
        actor,
        notes: v.notes,
      }),
    );

    await recordAudit({
      action: "UPDATE",
      tableName: "product_process_routes",
      recordId: String(routeId),
      after: {
        newVersion: created.version,
        stepCount: built.creates.length,
        notes: v.notes?.trim() || null,
      },
    });
    revalidate(route.productId);
    return actionOk({ version: created.version });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.productRouteActions.newVersionCreateFailed"),
        tr,
      ),
    );
  }
}

/** ルートの名称・有効/無効・備考の更新（バージョンは不変）。 */
export async function updateProductRoute(
  routeId: number,
  input: ProductRouteUpdateInput,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = routeUpdateInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const prior = await prisma.productProcessRoute.findUnique({
      where: { id: routeId },
      select: { productId: true, name: true, isActive: true, notes: true },
    });
    if (!prior)
      return actionError(tr("master.productRouteActions.targetRouteNotFound"));
    await prisma.productProcessRoute.update({
      where: { id: routeId },
      data: {
        name: localizedInput(v.nameJa, v.nameEn),
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "product_process_routes",
      recordId: String(routeId),
      before: {
        name: prior.name,
        isActive: prior.isActive,
        notes: prior.notes,
      },
      after: {
        nameJa: v.nameJa,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    revalidate(prior.productId);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.productRouteActions.updateFailed"), tr),
    );
  }
}

/** ルート削除 — どのバージョンも指示書から参照されていない場合のみ。 */
export async function deleteProductRoute(
  routeId: number,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.productProcessRoute.findUnique({
      where: { id: routeId },
      select: { productId: true },
    });
    if (!prior)
      return actionError(tr("master.productRouteActions.targetRouteNotFound"));
    const usedBy = await prisma.workOrder.count({
      where: { routeVersion: { routeId } },
    });
    if (usedBy > 0) {
      return actionError(
        tr("master.productRouteActions.referencedByWorkOrdersCannotDelete", {
          count: usedBy,
        }),
      );
    }
    // バージョン・工程スナップショットは FK Cascade で削除される。
    await prisma.productProcessRoute.delete({ where: { id: routeId } });
    await recordAudit({
      action: "DELETE",
      tableName: "product_process_routes",
      recordId: String(routeId),
    });
    revalidate(prior.productId);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.productRouteActions.deleteFailed"), tr),
    );
  }
}
