"use server";

/**
 * Server Actions — 出荷書 (app.shipping_orders, SH01).
 *
 * 作成は allocateDocumentKey("SHIPPING") で (yearMonth, seq) を1回採番し、
 * 明細を nested create で一括作成する。表示番号 SHP-YYYYMM-NNNNN は導出。
 *
 * ステータス遷移: DRAFT →(確定)→ CONFIRMED →(出荷)→ SHIPPED。
 * 出荷時（DISPATCH のみ）は注文請書の出荷進捗を再計算し、注文請書ステータスを
 * PARTIAL_SHIPPED / SHIPPED へ更新する（STOCK_STORAGE は請求フロー外のため
 * 注文請書ステータスに影響しない）。削除（キャンセル）は下書きのみ hard delete。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  formatDocNumber,
  formatSalesOrderNumber,
  parseDocKey,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { allocateDocumentKey } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/shipping/shipping-orders";

const itemInput = z.object({
  productId: z.string().min(1, "製品を選択してください"),
  lotNumber: z.number().int().min(1).nullable(),
  quantity: z.number().int().min(1, "数量は1以上"),
  notes: z.string().nullable(),
});

const createInput = z.object({
  salesOrderId: z.string().min(1, "注文請書を選択してください"),
  type: z.enum(["DISPATCH", "STOCK_STORAGE"]),
  fromFactoryId: z.string().nullable(),
  notes: z.string().nullable(),
  items: z.array(itemInput).min(1, "明細を1件以上追加してください"),
});

const updateInput = createInput.omit({ salesOrderId: true });

export type ShippingOrderCreateInput = z.infer<typeof createInput>;
export type ShippingOrderUpdateInput = z.infer<typeof updateInput>;

function revalidate(number?: string) {
  revalidatePath(BASE_PATH);
  if (number) {
    revalidatePath(`${BASE_PATH}/${number}`);
    revalidatePath(`${BASE_PATH}/${number}/edit`);
  }
}

const trimOrNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t || null;
};

// ── 注文請書情報（フォーム用ライブ取得） ──────────────────────────────────────

/** 出荷書フォームの明細既定行（完了指示書 1 件 = 1 行）。 */
export interface CompletedWorkOrderRef {
  /** 指示書番号 = ロット番号。 */
  workOrderNumber: number;
  /** 出来高 — 最終工程の良品数（未記録なら予定数量）。 */
  outputQuantity: number;
}

export interface ShippingSourceInfo {
  salesOrderId: string;
  salesOrderNumber: string;
  customerName: string;
  /** 注文請書の製品（明細の既定製品）。 */
  productId: string;
  productName: string;
  quantity: number;
  status: string;
  completedWorkOrders: CompletedWorkOrderRef[];
}

/**
 * 注文請書選択時のライブ取得 — 注文請書情報 + 完了済み指示書（ロット）一覧。
 * 明細の既定行（1 完了指示書 = 1 行、数量 = 最終工程の良品数）を組み立てる。
 */
export async function fetchShippingSourceInfo(
  salesOrderId: string,
): Promise<ShippingSourceInfo | null> {
  if (!salesOrderId) return null;
  try {
    const so = await prisma.salesOrder.findUnique({
      where: { id: salesOrderId },
      include: { customerBp: true, product: true },
    });
    if (!so) return null;
    const workOrders = await prisma.workOrder.findMany({
      where: { salesOrderId, status: "COMPLETED" },
      include: {
        // 最終工程（sortOrder 最大）の良品数を出来高として採用する。
        steps: { orderBy: { sortOrder: "desc" }, take: 1 },
      },
      orderBy: { workOrderNumber: "asc" },
    });
    return {
      salesOrderId: so.id,
      salesOrderNumber: formatSalesOrderNumber(so),
      customerName: localized(so.customerBp.name as LocalizedText | null),
      productId: String(so.productId),
      productName: localized(so.product.name as LocalizedText | null),
      quantity: so.quantity,
      status: so.status,
      completedWorkOrders: workOrders.map((wo) => ({
        workOrderNumber: wo.workOrderNumber,
        outputQuantity:
          wo.steps[0]?.outputSuccessQuantity ?? wo.plannedQuantity,
      })),
    };
  } catch (e) {
    console.error("fetchShippingSourceInfo failed", e);
    return null;
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/** 作成 — 採番1回 + ヘッダ・明細を一括作成。作成後は詳細ページへ。 */
export async function createShippingOrder(
  payload: ShippingOrderCreateInput,
): Promise<ActionResult<{ number: string }>> {
  const parsed = createInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const { yearMonth, seq } = await allocateDocumentKey("SHIPPING");
    await prisma.shippingOrder.create({
      data: {
        yearMonth,
        seq,
        salesOrderId: v.salesOrderId,
        type: v.type,
        fromFactoryId: v.fromFactoryId ? Number(v.fromFactoryId) : null,
        notes: trimOrNull(v.notes),
        items: {
          create: v.items.map((it, i) => ({
            productId: Number(it.productId),
            lotNumber: it.lotNumber,
            quantity: it.quantity,
            notes: trimOrNull(it.notes),
            sortOrder: i,
          })),
        },
      },
    });
    const number = formatDocNumber("SHP", { yearMonth, seq });
    await recordAudit({
      action: "CREATE",
      tableName: "shipping_orders",
      recordId: number,
      after: {
        salesOrderId: v.salesOrderId,
        type: v.type,
        fromFactoryId: v.fromFactoryId,
        status: "DRAFT",
        notes: trimOrNull(v.notes),
        items: v.items,
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "出荷書の作成に失敗しました"));
  }
}

/** 更新 — 下書きのみ（明細は全置換）。サーバー側でも必ずガード。 */
export async function updateShippingOrder(
  number: string,
  payload: ShippingOrderUpdateInput,
): Promise<ActionResult<{ number: string }>> {
  const key = parseDocKey(number, "SHP");
  if (!key) return actionError("出荷書番号が不正です");
  const parsed = updateInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.shippingOrder.findUnique({
      where: { yearMonth_seq: key },
      select: {
        type: true,
        fromFactoryId: true,
        notes: true,
        items: {
          orderBy: { sortOrder: "asc" },
          select: {
            productId: true,
            lotNumber: true,
            quantity: true,
            notes: true,
          },
        },
      },
    });
    await prisma.$transaction(async (tx) => {
      // status を where に含めた updateMany で原子的にガードする。
      const updated = await tx.shippingOrder.updateMany({
        where: { ...key, status: "DRAFT" },
        data: {
          type: v.type,
          fromFactoryId: v.fromFactoryId ? Number(v.fromFactoryId) : null,
          notes: trimOrNull(v.notes),
        },
      });
      if (updated.count === 0) {
        throw new Error("GUARD:下書きの出荷書のみ編集できます");
      }
      // 明細は全置換（DRAFT のみのため参照はまだ無い）。
      await tx.shippingOrderItem.deleteMany({
        where: {
          shippingOrderYearMonth: key.yearMonth,
          shippingOrderSeq: key.seq,
        },
      });
      await tx.shippingOrderItem.createMany({
        data: v.items.map((it, i) => ({
          shippingOrderYearMonth: key.yearMonth,
          shippingOrderSeq: key.seq,
          productId: Number(it.productId),
          lotNumber: it.lotNumber,
          quantity: it.quantity,
          notes: trimOrNull(it.notes),
          sortOrder: i,
        })),
      });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "shipping_orders",
      recordId: number,
      before: prior ?? undefined,
      after: {
        type: v.type,
        fromFactoryId: v.fromFactoryId ? Number(v.fromFactoryId) : null,
        notes: trimOrNull(v.notes),
        items: v.items,
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("GUARD:")) {
      return actionError(e.message.slice("GUARD:".length));
    }
    return actionError(prismaErrorMessage(e, "出荷書の更新に失敗しました"));
  }
}

/** 確定 (DRAFT → CONFIRMED)。 */
export async function confirmShippingOrder(
  number: string,
): Promise<ActionResult> {
  const key = parseDocKey(number, "SHP");
  if (!key) return actionError("出荷書番号が不正です");
  try {
    const updated = await prisma.shippingOrder.updateMany({
      where: { ...key, status: "DRAFT" },
      data: { status: "CONFIRMED" },
    });
    if (updated.count === 0) {
      return actionError("下書きの出荷書のみ確定できます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "shipping_orders",
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

/**
 * 出荷 (CONFIRMED → SHIPPED + shippedAt=now)。
 *
 * DISPATCH（発送）の場合は注文請書の出荷進捗を再計算する: その注文請書の
 * SHIPPED な DISPATCH 出荷書の明細数量合計 vs 受注数量 → PARTIAL_SHIPPED /
 * SHIPPED。STOCK_STORAGE（在庫保管）は注文請書ステータスを変更しない。
 */
export async function shipShippingOrder(number: string): Promise<ActionResult> {
  const key = parseDocKey(number, "SHP");
  if (!key) return actionError("出荷書番号が不正です");
  try {
    const row = await prisma.shippingOrder.findUnique({
      where: { yearMonth_seq: key },
      select: { type: true, salesOrderId: true },
    });
    if (!row) return actionError("対象の出荷書が見つかりません");

    // 注文請書ステータス変更の監査用（トランザクション後に記録）。
    let soAudit: {
      number: string;
      before: string;
      after: string;
    } | null = null;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.shippingOrder.updateMany({
        where: { ...key, status: "CONFIRMED" },
        data: { status: "SHIPPED", shippedAt: new Date() },
      });
      if (updated.count === 0) {
        throw new Error("GUARD:確定済みの出荷書のみ出荷できます");
      }
      if (row.type !== "DISPATCH") return;

      const so = await tx.salesOrder.findUnique({
        where: { id: row.salesOrderId },
        select: {
          yearMonth: true,
          seq: true,
          branch: true,
          quantity: true,
          status: true,
        },
      });
      if (!so || so.status === "CANCELLED") return;

      const agg = await tx.shippingOrderItem.aggregate({
        _sum: { quantity: true },
        where: {
          shippingOrder: {
            salesOrderId: row.salesOrderId,
            type: "DISPATCH",
            status: "SHIPPED",
          },
        },
      });
      const shipped = agg._sum.quantity ?? 0;
      const next = shipped >= so.quantity ? "SHIPPED" : "PARTIAL_SHIPPED";
      if (next !== so.status) {
        await tx.salesOrder.update({
          where: { id: row.salesOrderId },
          data: { status: next },
        });
        soAudit = {
          number: formatSalesOrderNumber(so),
          before: so.status,
          after: next,
        };
      }
    });

    // 在庫反映: DISPATCH は出庫 + 予約解除、STOCK_STORAGE は保管入庫（PR 5）。
    const { onShippingShipped } = await import("@/lib/inventory");
    await onShippingShipped(key);

    await recordAudit({
      action: "UPDATE",
      tableName: "shipping_orders",
      recordId: number,
      before: { status: "CONFIRMED" },
      after: { status: "SHIPPED" },
    });
    if (soAudit) {
      const { number: soNumber, before, after } = soAudit;
      await recordAudit({
        action: "UPDATE",
        tableName: "sales_orders",
        recordId: soNumber,
        before: { status: before },
        after: { status: after },
      });
      revalidatePath(`/production/sales-orders/${soNumber}`);
      revalidatePath("/production/sales-orders");
    }
    revalidate(number);
    return actionOk();
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("GUARD:")) {
      return actionError(e.message.slice("GUARD:".length));
    }
    return actionError(prismaErrorMessage(e, "出荷処理に失敗しました"));
  }
}

/** キャンセル（削除）— 下書きのみ hard delete（明細はカスケード削除）。 */
export async function deleteShippingOrder(
  number: string,
): Promise<ActionResult> {
  const key = parseDocKey(number, "SHP");
  if (!key) return actionError("出荷書番号が不正です");
  try {
    const deleted = await prisma.shippingOrder.deleteMany({
      where: { ...key, status: "DRAFT" },
    });
    if (deleted.count === 0) {
      return actionError("下書きの出荷書のみキャンセルできます");
    }
    await recordAudit({
      action: "DELETE",
      tableName: "shipping_orders",
      recordId: number,
      before: { status: "DRAFT" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "キャンセルに失敗しました"));
  }
}
