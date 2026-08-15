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

import { type Access, rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  type DocKey,
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
import { computeFinishedQuantity } from "@/lib/workflow-core";

const BASE_PATH = "/shipping/shipping-orders";
const SCOPE_DENIED = "この操作の権限がありません（対象範囲外）";

/**
 * 対象出荷書がスコープ内か（PLANT = 出荷元拠点）。ALL は素通し。
 * 不存在は true — 既存の not-found 系エラー処理に委ねる。
 */
async function shippingOrderInScope(
  access: Access,
  userId: string,
  key: DocKey,
): Promise<boolean> {
  if (access.kind === "ALL") return true;
  const row = await prisma.shippingOrder.findUnique({
    where: { yearMonth_seq: key },
    select: { fromPlantId: true },
  });
  if (!row) return true;
  return rowInScope(access, { plantIds: [row.fromPlantId] }, userId);
}

const itemInput = z.object({
  productId: z.string().min(1, "製品を選択してください"),
  lotNumber: z.number().int().min(1).nullable(),
  quantity: z.number().int().min(1, "数量は1以上"),
  notes: z.string().nullable(),
});

const createInput = z.object({
  salesOrderId: z.string().min(1, "注文請書を選択してください"),
  type: z.enum(["DISPATCH", "STOCK_STORAGE"]),
  fromPlantId: z.string().nullable(),
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
  /** 出来高 — グラフ終端集計の残良品（未記録なら予定数量）。 */
  outputQuantity: number;
}

/** 出荷に使える在庫ロット（product_inventory を lot 単位に集約）。 */
export interface StockLotRef {
  /** ロット番号 = 指示書番号。 */
  lotNumber: number;
  /** 現物数量（非半製品バケット合計）。 */
  quantity: number;
  /** 予約中数量。 */
  reserved: number;
  /** この注文請書配下の指示書のロットか（他 SO / 在庫向け指示書由来 = false）。 */
  fromThisSalesOrder: boolean;
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
  /** 対象製品の在庫ロット（現物あり — この SO 以外の完成ロットも含む）。 */
  stockLots: StockLotRef[];
}

/**
 * 注文請書選択時のライブ取得 — 注文請書情報 + 完了済み指示書（ロット）+
 * 対象製品の在庫ロット一覧。明細の既定行（1 完了指示書 = 1 行、数量 =
 * グラフ終端集計の残良品）とロットピッカーの選択肢を組み立てる。
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
    const [workOrders, inventories] = await Promise.all([
      prisma.workOrder.findMany({
        where: { salesOrderId, status: "COMPLETED" },
        include: { steps: true, stepLinks: true },
        orderBy: { workOrderNumber: "asc" },
      }),
      // 対象製品の在庫ロット（非半製品・ロット番号あり）— 他 SO / 在庫向け
      // 指示書の完成ロットも出荷に充当できる。
      prisma.productInventory.findMany({
        where: {
          productId: so.productId,
          isSemiFinished: false,
          lotNumber: { not: null },
        },
        select: {
          lotNumber: true,
          quantity: true,
          reservedQuantity: true,
        },
      }),
    ]);
    const soLots = new Set(workOrders.map((wo) => wo.workOrderNumber));
    const byLot = new Map<number, { quantity: number; reserved: number }>();
    for (const inv of inventories) {
      if (inv.lotNumber == null) continue;
      const cur = byLot.get(inv.lotNumber) ?? { quantity: 0, reserved: 0 };
      cur.quantity += inv.quantity;
      cur.reserved += inv.reservedQuantity;
      byLot.set(inv.lotNumber, cur);
    }
    const stockLots: StockLotRef[] = [...byLot.entries()]
      .filter(([, v]) => v.quantity > 0)
      .map(([lotNumber, v]) => ({
        lotNumber,
        quantity: v.quantity,
        reserved: v.reserved,
        fromThisSalesOrder: soLots.has(lotNumber),
      }))
      .sort(
        (a, b) =>
          Number(b.fromThisSalesOrder) - Number(a.fromThisSalesOrder) ||
          a.lotNumber - b.lotNumber,
      );
    return {
      salesOrderId: so.id,
      salesOrderNumber: formatSalesOrderNumber(so),
      customerName: localized(so.customerBp.name as LocalizedText | null),
      productId: String(so.productId),
      productName: localized(so.product.name as LocalizedText | null),
      quantity: so.quantity,
      status: so.status,
      completedWorkOrders: workOrders.map((wo) => {
        // 出来高 = グラフ終端集計（分岐合流 DAG でも正しい残良品）
        const finished = computeFinishedQuantity(
          wo.steps.map((s) => ({
            id: s.id,
            processStepId: s.processStepId,
            status: s.status,
            sortOrder: s.sortOrder,
            inputQuantity: s.inputQuantity,
            outputSuccess: s.outputSuccessQuantity,
            defectSemiFinished: s.outputDefectSemiFinished,
            defectScrap: s.outputDefectScrap,
            defectRework: s.outputDefectRework,
            sessionLockedBy: s.sessionLockedBy,
          })),
          wo.stepLinks.map((l) => ({
            sourceStepId: l.sourceStepId,
            targetStepId: l.targetStepId,
            routedQuantity: l.routedQuantity,
          })),
        );
        return {
          workOrderNumber: wo.workOrderNumber,
          outputQuantity: finished > 0 ? finished : wo.plannedQuantity,
        };
      }),
      stockLots,
    };
  } catch (e) {
    console.error("fetchShippingSourceInfo failed", e);
    return null;
  }
}

/**
 * DISPATCH 明細のロット在庫検証（fail-fast — 出荷時の在庫ガードは
 * onShippingShippedTx が最終判定する）。ロット指定行のみ、現物数量
 * （非半製品バケット合計）に対して検証する。エラー時は文字列を返す。
 */
async function validateDispatchLots(
  items: { productId: string; lotNumber: number | null; quantity: number }[],
): Promise<string | null> {
  const byKey = new Map<
    string,
    { productId: number; lot: number; qty: number }
  >();
  for (const it of items) {
    if (it.lotNumber == null) continue;
    const key = `${it.productId}:${it.lotNumber}`;
    const cur = byKey.get(key) ?? {
      productId: Number(it.productId),
      lot: it.lotNumber,
      qty: 0,
    };
    cur.qty += it.quantity;
    byKey.set(key, cur);
  }
  for (const { productId, lot, qty } of byKey.values()) {
    const agg = await prisma.productInventory.aggregate({
      where: { productId, lotNumber: lot, isSemiFinished: false },
      _sum: { quantity: true },
      _count: { _all: true },
    });
    if ((agg._count._all ?? 0) === 0) {
      return `ロット #${lot} の在庫がありません（完了済み指示書のロット番号を指定してください）`;
    }
    const available = agg._sum.quantity ?? 0;
    if (qty > available) {
      return `ロット #${lot} の在庫が不足しています（現物 ${available} / 指定 ${qty}）`;
    }
  }
  return null;
}

/**
 * 明細ロットが単一の指示書ロットなら、その指示書 id を返す
 * （shipping_orders.work_order_id — 表示・トレース用）。
 */
async function resolveHeaderWorkOrderId(
  items: { lotNumber: number | null }[],
): Promise<string | null> {
  const lots = [
    ...new Set(
      items.map((it) => it.lotNumber).filter((l): l is number => l != null),
    ),
  ];
  if (lots.length !== 1) return null;
  const wo = await prisma.workOrder.findUnique({
    where: { workOrderNumber: lots[0] },
    select: { id: true },
  });
  return wo?.id ?? null;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/** 作成 — 採番1回 + ヘッダ・明細を一括作成。作成後は詳細ページへ。 */
export async function createShippingOrder(
  payload: ShippingOrderCreateInput,
): Promise<ActionResult<{ number: string }>> {
  const authz = await checkPermission("shipping_order", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = createInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  // スコープ行チェック（PLANT）: 出荷元拠点がスコープ内であること
  // （SCOPED ユーザーは拠点未設定の出荷書を作成できない — fail-closed）。
  if (
    authz.access.kind !== "ALL" &&
    !rowInScope(
      authz.access,
      { plantIds: [v.fromPlantId ? Number(v.fromPlantId) : null] },
      authz.userId,
    )
  ) {
    return actionError(SCOPE_DENIED);
  }
  try {
    // 発送（DISPATCH）はロット在庫を fail-fast 検証（最終ガードは出荷時）
    if (v.type === "DISPATCH") {
      const lotError = await validateDispatchLots(v.items);
      if (lotError) return actionError(lotError);
    }
    const workOrderId = await resolveHeaderWorkOrderId(v.items);
    const { yearMonth, seq } = await allocateDocumentKey("SHIPPING");
    await prisma.shippingOrder.create({
      data: {
        yearMonth,
        seq,
        salesOrderId: v.salesOrderId,
        workOrderId,
        type: v.type,
        fromPlantId: v.fromPlantId ? Number(v.fromPlantId) : null,
        notes: trimOrNull(v.notes),
        createdBy: authz.userId,
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
        fromPlantId: v.fromPlantId,
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
  const authz = await checkPermission("shipping_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "SHP");
  if (!key) return actionError("出荷書番号が不正です");
  const parsed = updateInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  if (!(await shippingOrderInScope(authz.access, authz.userId, key))) {
    return actionError(SCOPE_DENIED);
  }
  try {
    const prior = await prisma.shippingOrder.findUnique({
      where: { yearMonth_seq: key },
      select: {
        type: true,
        fromPlantId: true,
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
    // 発送（DISPATCH）はロット在庫を fail-fast 検証（最終ガードは出荷時）
    if (v.type === "DISPATCH") {
      const lotError = await validateDispatchLots(v.items);
      if (lotError) return actionError(lotError);
    }
    const workOrderId = await resolveHeaderWorkOrderId(v.items);
    await prisma.$transaction(async (tx) => {
      // status を where に含めた updateMany で原子的にガードする。
      const updated = await tx.shippingOrder.updateMany({
        where: { ...key, status: "DRAFT" },
        data: {
          type: v.type,
          workOrderId,
          fromPlantId: v.fromPlantId ? Number(v.fromPlantId) : null,
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
        fromPlantId: v.fromPlantId ? Number(v.fromPlantId) : null,
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
  const authz = await checkPermission("shipping_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "SHP");
  if (!key) return actionError("出荷書番号が不正です");
  if (!(await shippingOrderInScope(authz.access, authz.userId, key))) {
    return actionError(SCOPE_DENIED);
  }
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
  const authz = await checkPermission("shipping_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "SHP");
  if (!key) return actionError("出荷書番号が不正です");
  if (!(await shippingOrderInScope(authz.access, authz.userId, key))) {
    return actionError(SCOPE_DENIED);
  }
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
      // 累計出荷が受注数量を超える出荷を禁止（監査 P0-4 過出荷ガード）
      if (shipped > so.quantity) {
        throw new Error(
          `GUARD:受注数量 ${so.quantity} を超える出荷になります（累計 ${shipped}）`,
        );
      }
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

      // 在庫反映（同一 tx）: DISPATCH は出庫 + 予約按分解除、STOCK_STORAGE は
      // 保管入庫。在庫不足・台帳欠落はここで throw され全体がロールバック。
      const { onShippingShippedTx } = await import("@/lib/inventory");
      await onShippingShippedTx(tx, key);
    });

    await recordAudit({
      action: "UPDATE",
      tableName: "shipping_orders",
      recordId: number,
      before: { status: "CONFIRMED" },
      after: { status: "SHIPPED" },
    });
    // 出荷完了のハンドオフ通知（受注担当へ・best-effort — 監査 P2-6）
    try {
      const soRow = await prisma.salesOrder.findUnique({
        where: { id: row.salesOrderId },
        select: { createdBy: true },
      });
      if (soRow?.createdBy) {
        const { notify } = await import("@/lib/notifications");
        await notify({
          userIds: [soRow.createdBy],
          type: "SYSTEM",
          title: `出荷書 ${number} を出荷しました`,
          linkPath: `/shipping/shipping-orders/${encodeURIComponent(number)}`,
        });
      }
    } catch (err) {
      console.error("[shipping] 出荷通知に失敗:", err);
    }
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
    // 在庫ガード（lib/inventory）の業務エラーはそのまま表示する
    if (
      e instanceof Error &&
      (e.message.startsWith("在庫が不足") || e.message.includes("在庫台帳"))
    ) {
      return actionError(e.message);
    }
    return actionError(prismaErrorMessage(e, "出荷処理に失敗しました"));
  }
}

/** キャンセル（削除）— 下書きのみ hard delete（明細はカスケード削除）。 */
export async function deleteShippingOrder(
  number: string,
): Promise<ActionResult> {
  const authz = await checkPermission("shipping_order", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "SHP");
  if (!key) return actionError("出荷書番号が不正です");
  if (!(await shippingOrderInScope(authz.access, authz.userId, key))) {
    return actionError(SCOPE_DENIED);
  }
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
