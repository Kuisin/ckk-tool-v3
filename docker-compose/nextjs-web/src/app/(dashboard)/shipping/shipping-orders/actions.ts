"use server";

/**
 * Server Actions — 出荷書 (app.shipping_orders, SH01).
 *
 * 作成は allocateDocumentKey("SHIPPING") で (yearMonth, seq) を1回採番し、
 * 明細を nested create で一括作成する。表示番号 SHP-YYYYMM-NNNNN は導出。
 *
 * ステータス遷移: DRAFT →(確定)→ CONFIRMED →(出荷)→ SHIPPED。
 * 出荷時（DISPATCH のみ）は注文明細の出荷進捗を再計算し、注文明細ステータスを
 * PARTIAL_SHIPPED / SHIPPED へ更新する（STOCK_STORAGE は請求フロー外のため
 * 注文明細ステータスに影響しない）。削除（キャンセル）は下書きのみ hard delete。
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
  formatOrderLineNumber,
  parseDocKey,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { allocateDocumentKey } from "@/lib/numbering";
import { lineShipStatus } from "@/lib/order-line-core";
import { resolveSalesRepId } from "@/lib/sales-rep";
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
  /** 出荷元の注文明細。DISPATCH では必須（下の superRefine で強制）。 */
  orderLineId: z.string().nullable(),
  productId: z.string().min(1, "製品を選択してください"),
  lotNumber: z.number().int().min(1).nullable(),
  quantity: z.number().int().min(1, "数量は1以上"),
  notes: z.string().nullable(),
});

const createInput = z
  .object({
    customerBpId: z.string().min(1, "顧客を選択してください"),
    customerBranchBpId: z.string().nullable(),
    /** 営業担当 — 未指定なら顧客の主担当が入る（lib/sales-rep）。 */
    salesRepId: z.string().nullable().optional(),
    type: z.enum(["DISPATCH", "STOCK_STORAGE"]),
    fromPlantId: z.string().nullable(),
    notes: z.string().nullable(),
    items: z.array(itemInput).min(1, "明細を1件以上追加してください"),
  })
  .superRefine((v, ctx) => {
    // 発送は必ず注文明細に紐付く（請求の起点になるため）。在庫保管は
    // 予備製作分なので注文明細を持たない行を許す。
    if (v.type !== "DISPATCH") return;
    v.items.forEach((it, i) => {
      if (!it.orderLineId) {
        ctx.addIssue({
          code: "custom",
          path: ["items", i, "orderLineId"],
          message: `明細 ${i + 1} 行目: 発送には注文明細の指定が必要です`,
        });
      }
    });
  });

const updateInput = z
  .object({
    /** 営業担当。顧客は作成後不変なので選ばれた値をそのまま保存する。 */
    salesRepId: z.string().nullable().optional(),
    type: z.enum(["DISPATCH", "STOCK_STORAGE"]),
    fromPlantId: z.string().nullable(),
    notes: z.string().nullable(),
    items: z.array(itemInput).min(1, "明細を1件以上追加してください"),
  })
  .superRefine((v, ctx) => {
    if (v.type !== "DISPATCH") return;
    v.items.forEach((it, i) => {
      if (!it.orderLineId) {
        ctx.addIssue({
          code: "custom",
          path: ["items", i, "orderLineId"],
          message: `明細 ${i + 1} 行目: 発送には注文明細の指定が必要です`,
        });
      }
    });
  });

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

// ── 注文明細情報（フォーム用ライブ取得） ──────────────────────────────────────

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
  /** この注文明細配下の指示書のロットか（他 SO / 在庫向け指示書由来 = false）。 */
  fromThisOrderLine: boolean;
}

export interface ShippingSourceInfo {
  orderLineId: string;
  orderLineNumber: string;
  /** 出荷書ヘッダの顧客を決めるのに使う（1 出荷書 = 1 顧客の検証にも）。 */
  customerBpId: string | null;
  customerName: string;
  /** 既に出荷済みの数量（残数の算出用）。 */
  shippedQuantity: number;
  /** 注文明細の製品（明細の既定製品）。 */
  productId: string;
  productName: string;
  quantity: number;
  status: string;
  completedWorkOrders: CompletedWorkOrderRef[];
  /** 対象製品の在庫ロット（現物あり — この SO 以外の完成ロットも含む）。 */
  stockLots: StockLotRef[];
}

/**
 * 注文明細選択時のライブ取得 — 注文明細情報 + 完了済み指示書（ロット）+
 * 対象製品の在庫ロット一覧。明細の既定行（1 完了指示書 = 1 行、数量 =
 * グラフ終端集計の残良品）とロットピッカーの選択肢を組み立てる。
 */
export async function fetchShippingSourceInfo(
  orderLineId: string,
): Promise<ShippingSourceInfo | null> {
  if (!orderLineId) return null;
  try {
    const so = await prisma.orderLine.findUnique({
      where: { id: orderLineId },
      include: {
        acceptance: { include: { customerBp: true } },
        product: true,
      },
    });
    // 確定前（枝番なし・製品未特定）の明細は出荷対象にならない。
    if (!so || so.branch == null || so.productId == null) return null;
    const productId = so.productId;
    const [workOrders, inventories] = await Promise.all([
      prisma.workOrder.findMany({
        where: { orderLineId, status: "COMPLETED" },
        include: { steps: true, stepLinks: true },
        orderBy: { workOrderNumber: "asc" },
      }),
      // 対象製品の在庫ロット（非半製品・ロット番号あり）— 他 SO / 在庫向け
      // 指示書の完成ロットも出荷に充当できる。
      prisma.productInventory.findMany({
        where: {
          productId,
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
        fromThisOrderLine: soLots.has(lotNumber),
      }))
      .sort(
        (a, b) =>
          Number(b.fromThisOrderLine) - Number(a.fromThisOrderLine) ||
          a.lotNumber - b.lotNumber,
      );
    return {
      orderLineId: so.id,
      orderLineNumber: formatOrderLineNumber({
        yearMonth: so.acceptanceYearMonth,
        seq: so.acceptanceSeq,
        branch: so.branch,
      }),
      customerBpId: so.acceptance.customerBpId,
      customerName: localized(
        so.acceptance.customerBp?.name as LocalizedText | null,
      ),
      shippedQuantity: await shippedQuantityForLine(so.id),
      productId: String(productId),
      productName: localized(so.product?.name as LocalizedText | null),
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
 * 1 出荷書 = 1 顧客の不変条件。明細の注文明細がヘッダの顧客と食い違うと、
 * 請求の顧客判定と納品書の宛先が壊れる。
 */
async function validateSingleCustomer(
  items: { orderLineId: string | null }[],
  customerBpId: string,
): Promise<string | null> {
  const ids = [
    ...new Set(
      items
        .map((it) => it.orderLineId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 0) return null;
  const lines = await prisma.orderLine.findMany({
    where: { id: { in: ids } },
    select: { acceptance: { select: { customerBpId: true } } },
  });
  const mismatched = lines.some(
    (l) => l.acceptance.customerBpId !== customerBpId,
  );
  return mismatched
    ? "1 つの出荷書には同じ顧客の注文明細だけを載せられます"
    : null;
}

/**
 * ある注文明細の出荷済み数量（SHIPPED × DISPATCH の明細合計）。
 * 過出荷ガードと残数表示の唯一の集計元。
 */
async function shippedQuantityForLine(orderLineId: string): Promise<number> {
  const agg = await prisma.shippingOrderItem.aggregate({
    _sum: { quantity: true },
    where: {
      orderLineId,
      shippingOrder: { type: "DISPATCH", status: "SHIPPED" },
    },
  });
  return agg._sum?.quantity ?? 0;
}

/**
 * 明細が参照する注文明細の残数を超えていないか（作成・更新時の fail-fast）。
 * 確定的なガードは shipShippingOrder 側（出荷時点で数え直す）。
 */
async function validateLineRemaining(
  items: { orderLineId: string | null; quantity: number }[],
  excludeKey?: DocKey,
): Promise<string | null> {
  const byLine = new Map<string, number>();
  for (const it of items) {
    if (!it.orderLineId) continue;
    byLine.set(it.orderLineId, (byLine.get(it.orderLineId) ?? 0) + it.quantity);
  }
  for (const [orderLineId, requested] of byLine) {
    const line = await prisma.orderLine.findUnique({
      where: { id: orderLineId },
      select: {
        quantity: true,
        acceptanceYearMonth: true,
        acceptanceSeq: true,
        branch: true,
      },
    });
    if (!line || line.branch == null) {
      return "確定済みの注文明細を指定してください";
    }
    // 自分自身の未出荷ぶんは累計に含まれない（SHIPPED のみ数える）が、
    // 編集時に同じ出荷書の行を二重に数えないよう除外キーを見る。
    const agg = await prisma.shippingOrderItem.aggregate({
      _sum: { quantity: true },
      where: {
        orderLineId,
        shippingOrder: { type: "DISPATCH", status: "SHIPPED" },
        ...(excludeKey
          ? {
              NOT: {
                shippingOrderYearMonth: excludeKey.yearMonth,
                shippingOrderSeq: excludeKey.seq,
              },
            }
          : {}),
      },
    });
    const shipped = agg._sum?.quantity ?? 0;
    const remaining = line.quantity - shipped;
    if (requested > remaining) {
      const number = formatOrderLineNumber({
        yearMonth: line.acceptanceYearMonth,
        seq: line.acceptanceSeq,
        branch: line.branch,
      });
      return `${number} の残数を超えています（残 ${remaining} / 指定 ${requested}）`;
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
      const remainingError = await validateLineRemaining(v.items);
      if (remainingError) return actionError(remainingError);
      const customerError = await validateSingleCustomer(
        v.items,
        v.customerBpId,
      );
      if (customerError) return actionError(customerError);
    }
    const workOrderId = await resolveHeaderWorkOrderId(v.items);
    const { yearMonth, seq } = await allocateDocumentKey("SHIPPING");
    const salesRepId = await resolveSalesRepId(
      v.salesRepId,
      v.customerBpId,
      null,
    );
    await prisma.shippingOrder.create({
      data: {
        yearMonth,
        seq,
        customerBpId: v.customerBpId,
        customerBranchBpId: v.customerBranchBpId,
        salesRepId,
        workOrderId,
        type: v.type,
        fromPlantId: v.fromPlantId ? Number(v.fromPlantId) : null,
        notes: trimOrNull(v.notes),
        createdBy: authz.userId,
        items: {
          create: v.items.map((it, i) => ({
            orderLineId: it.orderLineId,
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
        customerBpId: v.customerBpId,
        salesRepId,
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
        salesRepId: true,
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
          salesRepId: v.salesRepId?.trim() || null,
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
          orderLineId: it.orderLineId,
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
        salesRepId: v.salesRepId?.trim() || null,
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
 * DISPATCH（発送）の場合は注文明細の出荷進捗を再計算する: その注文明細の
 * SHIPPED な DISPATCH 出荷書の明細数量合計 vs 受注数量 → PARTIAL_SHIPPED /
 * SHIPPED。STOCK_STORAGE（在庫保管）は注文明細ステータスを変更しない。
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
      select: {
        type: true,
        items: { select: { orderLineId: true } },
      },
    });
    if (!row) return actionError("対象の出荷書が見つかりません");

    // 注文明細ステータス変更の監査用（トランザクション後に記録）。
    // 1 出荷書が複数の注文明細を束ねるため、行ごとに 1 件ずつ積む。
    const lineAudits: {
      number: string;
      before: string;
      after: string;
    }[] = [];

    await prisma.$transaction(async (tx) => {
      const updated = await tx.shippingOrder.updateMany({
        where: { ...key, status: "CONFIRMED" },
        data: { status: "SHIPPED", shippedAt: new Date() },
      });
      if (updated.count === 0) {
        throw new Error("GUARD:確定済みの出荷書のみ出荷できます");
      }
      if (row.type !== "DISPATCH") return;

      // この出荷書が触る注文明細ごとに、累計出荷を数え直して判定する。
      // 出荷書単位で合算すると、複数明細を束ねた瞬間に別の受注の数量まで
      // 巻き込んで過出荷ガードが誤作動する。
      const lineIds = [
        ...new Set(
          row.items
            .map((it) => it.orderLineId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      for (const lineId of lineIds) {
        const line = await tx.orderLine.findUnique({
          where: { id: lineId },
          select: {
            acceptanceYearMonth: true,
            acceptanceSeq: true,
            branch: true,
            quantity: true,
            status: true,
          },
        });
        if (!line || line.status === "CANCELLED" || line.branch == null) {
          continue;
        }

        const agg = await tx.shippingOrderItem.aggregate({
          _sum: { quantity: true },
          where: {
            orderLineId: lineId,
            shippingOrder: { type: "DISPATCH", status: "SHIPPED" },
          },
        });
        const shipped = agg._sum?.quantity ?? 0;
        // 累計出荷が受注数量を超える出荷を禁止（監査 P0-4 過出荷ガード）
        const lineNumber = formatOrderLineNumber({
          yearMonth: line.acceptanceYearMonth,
          seq: line.acceptanceSeq,
          branch: line.branch,
        });
        if (shipped > line.quantity) {
          throw new Error(
            `GUARD:${lineNumber} の受注数量 ${line.quantity} を超える出荷になります（累計 ${shipped}）`,
          );
        }
        const next = lineShipStatus(line.quantity, shipped);
        if (next && next !== line.status) {
          await tx.orderLine.update({
            where: { id: lineId },
            data: { status: next },
          });
          lineAudits.push({
            number: lineNumber,
            before: line.status,
            after: next,
          });
        }
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
    // 出荷完了のハンドオフ通知（受注担当へ・best-effort — 監査 P2-6）。
    // 複数の注文明細を束ねられるので、担当者は重複排除して一斉に通知する。
    try {
      const lineIds = [
        ...new Set(
          row.items
            .map((it) => it.orderLineId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (lineIds.length > 0) {
        const lines = await prisma.orderLine.findMany({
          where: { id: { in: lineIds } },
          select: { acceptance: { select: { createdBy: true } } },
        });
        const userIds = [
          ...new Set(
            lines
              .map((l) => l.acceptance.createdBy)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        if (userIds.length > 0) {
          const { notify } = await import("@/lib/notifications");
          await notify({
            userIds,
            type: "SYSTEM",
            title: `出荷書 ${number} を出荷しました`,
            linkPath: `/shipping/shipping-orders/${encodeURIComponent(number)}`,
          });
        }
      }
    } catch (err) {
      console.error("[shipping] 出荷通知に失敗:", err);
    }
    for (const audit of lineAudits) {
      await recordAudit({
        action: "UPDATE",
        tableName: "order_lines",
        recordId: audit.number,
        before: { status: audit.before },
        after: { status: audit.after },
      });
      revalidatePath(`/sales/order-lines/${encodeURIComponent(audit.number)}`);
    }
    if (lineAudits.length > 0) revalidatePath("/sales/order-lines");
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
