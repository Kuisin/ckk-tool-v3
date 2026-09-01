"use server";

/**
 * Server Actions — 出荷書 (app.delivery_orders, SH01).
 *
 * 作成は allocateDocumentKey("DELIVERY_ORDER") で (yearMonth, seq) を1回採番し、
 * 明細を nested create で一括作成する。表示番号 DOR-YYYYMM-NNNNN は導出。
 *
 * ステータス遷移: DRAFT →(確定)→ CONFIRMED →(出荷)→ SHIPPED。
 * 出荷時（DISPATCH のみ）は注文明細の出荷進捗を再計算し、注文明細ステータスを
 * PARTIAL_SHIPPED / SHIPPED へ更新する（STOCK_STORAGE は請求フロー外のため
 * 注文明細ステータスに影響しない）。削除（キャンセル）は下書きのみ hard delete。
 */

import { type Access, rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { combinabilityError } from "@/components/shipping/delivery-orders/model";
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
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { distributeFinished } from "@/lib/work-order-alloc-core";
import {
  computeFinishedQuantity,
  STEP_LINK_STATE_SELECT,
  STEP_STATE_SELECT,
  toStepState,
} from "@/lib/workflow-core";

const BASE_PATH = "/shipping/delivery-orders";

/**
 * 対象出荷書がスコープ内か（PLANT = 出荷元拠点）。ALL は素通し。
 * 不存在は true — 既存の not-found 系エラー処理に委ねる。
 */
async function deliveryOrderInScope(
  access: Access,
  userId: string,
  key: DocKey,
): Promise<boolean> {
  if (access.kind === "ALL") return true;
  const row = await prisma.deliveryOrder.findUnique({
    where: { yearMonth_seq: key },
    select: { fromPlantId: true },
  });
  if (!row) return true;
  return rowInScope(access, { plantIds: [row.fromPlantId] }, userId);
}

function itemInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    /** 出荷元の注文明細。DISPATCH では必須（下の superRefine で強制）。 */
    orderLineId: z.string().nullable(),
    productId: z.string().min(1, tr("common.selectAProduct")),
    lotNumber: z.number().int().min(1).nullable(),
    quantity: z
      .number()
      .int()
      .min(1, tr("shipping.deliveryOrderActions.quantityMustBeAtLeast1")),
    notes: z.string().nullable(),
  });
}

function createInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z
    .object({
      customerBpId: z
        .string()
        .min(1, tr("sales.orderAcceptances.selectACustomer")),
      customerBranchBpId: z.string().nullable(),
      type: z.enum(["DISPATCH", "STOCK_STORAGE"]),
      fromPlantId: z.string().nullable(),
      notes: z.string().nullable(),
      items: z
        .array(itemInputSchema(tr))
        .min(1, tr("common.addAtLeastOneLineItem")),
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
            message: tr(
              "shipping.deliveryOrderActions.orderLineRequiredForDispatch",
              {
                line: i + 1,
              },
            ),
          });
        }
      });
    });
}

function updateInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z
    .object({
      type: z.enum(["DISPATCH", "STOCK_STORAGE"]),
      fromPlantId: z.string().nullable(),
      notes: z.string().nullable(),
      items: z
        .array(itemInputSchema(tr))
        .min(1, tr("common.addAtLeastOneLineItem")),
    })
    .superRefine((v, ctx) => {
      if (v.type !== "DISPATCH") return;
      v.items.forEach((it, i) => {
        if (!it.orderLineId) {
          ctx.addIssue({
            code: "custom",
            path: ["items", i, "orderLineId"],
            message: tr(
              "shipping.deliveryOrderActions.orderLineRequiredForDispatch",
              {
                line: i + 1,
              },
            ),
          });
        }
      });
    });
}

export type DeliveryOrderCreateInput = z.infer<
  ReturnType<typeof createInputSchema>
>;
export type DeliveryOrderUpdateInput = z.infer<
  ReturnType<typeof updateInputSchema>
>;

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

/**
 * 出荷に使えるロット = **その注文明細に紐づく完了指示書**のロット
 * （work_order_order_lines 経由 — FROM_STOCK の在庫引当指示書も含む）。
 * 在庫数は product_inventory を lot 単位に集約した現物。
 */
export interface StockLotRef {
  /** ロット番号 = 指示書番号。 */
  lotNumber: number;
  /** 現物数量（非半製品バケット合計）。 */
  quantity: number;
  /** 予約中数量。 */
  reserved: number;
}

export interface DeliverySourceInfo {
  orderLineId: string;
  orderLineNumber: string;
  /** 出荷書ヘッダの顧客を決めるのに使う（1 出荷書 = 1 顧客の検証にも）。 */
  customerBpId: string | null;
  customerName: string;
  /** 注文請書ヘッダの出荷先（null = 顧客へ）— 束ね可否の判定に使う。 */
  shipToBpId: string | null;
  shipToName: string | null;
  /** 注文請書ヘッダの配送方法 — 同じ配送方法の明細だけを束ねられる。 */
  deliveryMethod: "NORMAL" | "DIRECT_TO_USER";
  /** 既に出荷済みの数量（残数の算出用）。 */
  shippedQuantity: number;
  /** 注文明細の製品（明細の既定製品）。 */
  productId: string;
  productName: string;
  quantity: number;
  status: string;
  completedWorkOrders: CompletedWorkOrderRef[];
  /** この注文明細に紐づく完了指示書のロット（現物あり）。 */
  stockLots: StockLotRef[];
}

/**
 * 注文明細選択時のライブ取得 — 注文明細情報 + 完了済み指示書（ロット）。
 * 明細の既定行（1 完了指示書 = 1 行、数量 = グラフ終端集計の残良品）と
 * ロットピッカーの選択肢を組み立てる。ロットは**その注文明細に紐づく
 * 指示書**（work_order_order_lines — FROM_STOCK の在庫引当も含む）から選ぶ。
 */
export async function fetchDeliverySourceInfo(
  orderLineId: string,
): Promise<DeliverySourceInfo | null> {
  if (!orderLineId) return null;
  try {
    const so = await prisma.orderLine.findUnique({
      where: { id: orderLineId },
      include: {
        acceptance: { include: { customerBp: true, shipToBp: true } },
        product: true,
      },
    });
    // 確定前（枝番なし・製品未特定）の明細は出荷対象にならない。
    if (!so || so.branch == null || so.productId == null) return null;
    const productId = so.productId;
    const [workOrders, inventories] = await Promise.all([
      prisma.workOrder.findMany({
        where: {
          orderLineLinks: { some: { orderLineId } },
          status: "COMPLETED",
        },
        // エンジンが読む列だけ（STEP_STATE_SELECT — workflow-core 参照）。
        // 全列 SELECT は列追加のたび migration 前の DB で P2022 に落ちる。
        select: {
          workOrderNumber: true,
          plannedQuantity: true,
          steps: { select: STEP_STATE_SELECT },
          stepLinks: { select: STEP_LINK_STATE_SELECT },
          // 統合ロットの出来高配分（distributeFinished）に使う
          orderLineLinks: {
            select: { orderLineId: true, quantity: true },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { workOrderNumber: "asc" },
      }),
      // 在庫ロットの現物数量 — この注文明細に紐づく指示書のロットだけを
      // ピッカーに出す（指示書は関連 SO 文書から選ぶ、が本画面の規約。
      // 他の受注のロットを充てるときは先に FROM_STOCK の在庫引当指示書で
      // この明細へ紐づける）。
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
      if (inv.lotNumber == null || !soLots.has(inv.lotNumber)) continue;
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
      }))
      .sort((a, b) => a.lotNumber - b.lotNumber);
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
      shipToBpId: so.acceptance.shipToBpId,
      shipToName: so.acceptance.shipToBp
        ? localized(so.acceptance.shipToBp.name as LocalizedText | null)
        : null,
      deliveryMethod: so.acceptance.deliveryMethod,
      shippedQuantity: await shippedQuantityForLine(so.id),
      productId: String(productId),
      productName: localized(so.product?.name as LocalizedText | null),
      quantity: so.quantity,
      status: so.status,
      completedWorkOrders: workOrders.map((wo) => {
        // 出来高 = グラフ終端集計（分岐合流 DAG でも正しい残良品）。
        // toStepState 経由なので branchStock も渡り、半製品在庫で終わる
        // 分岐終端を出荷可能数に数えない。統合ロットでは完成数を割当順に
        // 配分し、この明細ぶんだけを既定数量にする。
        const finished = computeFinishedQuantity(
          wo.steps.map(toStepState),
          wo.stepLinks,
        );
        const share =
          distributeFinished(
            wo.orderLineLinks,
            finished > 0 ? finished : wo.plannedQuantity,
          ).get(orderLineId) ?? 0;
        const ownAlloc =
          wo.orderLineLinks.find((l) => l.orderLineId === orderLineId)
            ?.quantity ?? 0;
        return {
          workOrderNumber: wo.workOrderNumber,
          outputQuantity: share > 0 ? share : ownAlloc,
        };
      }),
      stockLots,
    };
  } catch (e) {
    console.error("fetchDeliverySourceInfo failed", e);
    return null;
  }
}

/**
 * 注文請書選択時のライブ取得 — 展開済みの注文請書の**出荷できる注文明細**
 * すべての受注情報をまとめて返す（出荷書フォームは注文請書単位で選び、
 * 明細グループは注文明細ごとに作る）。キャンセル済み・出荷済みステータスの
 * 行は除外する（残数ゼロの最終判定はクライアント側でも行う）。
 */
export async function fetchDeliveryAcceptanceSourceInfo(
  acceptanceNumber: string,
): Promise<DeliverySourceInfo[]> {
  const key = parseDocKey(acceptanceNumber, "ORD");
  if (!key) return [];
  try {
    const lines = await prisma.orderLine.findMany({
      where: {
        acceptanceYearMonth: key.yearMonth,
        acceptanceSeq: key.seq,
        branch: { not: null },
        status: { in: ["CONFIRMED", "IN_PRODUCTION", "PARTIAL_SHIPPED"] },
      },
      orderBy: { branch: "asc" },
      select: { id: true },
    });
    const infos = await Promise.all(
      lines.map((l) => fetchDeliverySourceInfo(l.id)),
    );
    return infos.filter((i): i is DeliverySourceInfo => i != null);
  } catch (e) {
    console.error("fetchDeliveryAcceptanceSourceInfo failed", e);
    return [];
  }
}

/**
 * DISPATCH 明細のロット在庫検証（fail-fast — 出荷時の在庫ガードは
 * onDeliveryOrderShippedTx が最終判定する）。ロット指定行のみ、現物数量
 * （非半製品バケット合計）に対して検証する。エラー時は文字列を返す。
 */
async function validateDispatchLots(
  items: { productId: string; lotNumber: number | null; quantity: number }[],
  tr: Awaited<ReturnType<typeof getTranslations>>,
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
      return tr("shipping.deliveryOrderActions.lotHasNoStock", { lot });
    }
    const available = agg._sum.quantity ?? 0;
    if (qty > available) {
      return tr("shipping.deliveryOrderActions.lotStockInsufficient", {
        lot,
        available,
        qty,
      });
    }
  }
  return null;
}

/**
 * 束ね可否の不変条件 — 1 出荷書に載せられるのは同一顧客 × 同一出荷先 ×
 * 同一配送方法（注文請書ヘッダ由来）の注文明細だけ。判定はクライアントと
 * 共有の combinabilityError（components/shipping/delivery-orders/model）。
 */
async function validateCombinable(
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
    select: {
      acceptance: {
        select: { customerBpId: true, shipToBpId: true, deliveryMethod: true },
      },
    },
  });
  return combinabilityError(
    lines.map((l) => l.acceptance),
    customerBpId,
  );
}

/**
 * ある注文明細の出荷済み数量（SHIPPED × DISPATCH の明細合計）。
 * 過出荷ガードと残数表示の唯一の集計元。
 */
async function shippedQuantityForLine(orderLineId: string): Promise<number> {
  const agg = await prisma.deliveryOrderItem.aggregate({
    _sum: { quantity: true },
    where: {
      orderLineId,
      deliveryOrder: { type: "DISPATCH", status: "SHIPPED" },
    },
  });
  return agg._sum?.quantity ?? 0;
}

/**
 * 明細が参照する注文明細の残数を超えていないか（作成・更新時の fail-fast）。
 * 確定的なガードは shipDeliveryOrder 側（出荷時点で数え直す）。
 */
async function validateLineRemaining(
  items: { orderLineId: string | null; quantity: number }[],
  tr: Awaited<ReturnType<typeof getTranslations>>,
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
      return tr("shipping.deliveryOrderActions.specifyAConfirmedOrderLine");
    }
    // 自分自身の未出荷ぶんは累計に含まれない（SHIPPED のみ数える）が、
    // 編集時に同じ出荷書の行を二重に数えないよう除外キーを見る。
    const agg = await prisma.deliveryOrderItem.aggregate({
      _sum: { quantity: true },
      where: {
        orderLineId,
        deliveryOrder: { type: "DISPATCH", status: "SHIPPED" },
        ...(excludeKey
          ? {
              NOT: {
                deliveryOrderYearMonth: excludeKey.yearMonth,
                deliveryOrderSeq: excludeKey.seq,
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
      return tr("shipping.deliveryOrderActions.exceedsLineRemaining", {
        number,
        remaining,
        requested,
      });
    }
  }
  return null;
}

/**
 * 明細ロットが単一の指示書ロットなら、その指示書 id を返す
 * （delivery_orders.work_order_id — 表示・トレース用）。
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
export async function createDeliveryOrder(
  payload: DeliveryOrderCreateInput,
): Promise<ActionResult<{ number: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("delivery_order", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = createInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
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
    return actionError(tr("common.outOfScope"));
  }
  try {
    // 発送（DISPATCH）はロット在庫を fail-fast 検証（最終ガードは出荷時）
    if (v.type === "DISPATCH") {
      const lotError = await validateDispatchLots(v.items, tr);
      if (lotError) return actionError(lotError);
      const remainingError = await validateLineRemaining(v.items, tr);
      if (remainingError) return actionError(remainingError);
      const combineError = await validateCombinable(v.items, v.customerBpId);
      if (combineError) return actionError(combineError);
    }
    const workOrderId = await resolveHeaderWorkOrderId(v.items);
    const { yearMonth, seq } = await allocateDocumentKey("DELIVERY_ORDER");
    await prisma.deliveryOrder.create({
      data: {
        yearMonth,
        seq,
        customerBpId: v.customerBpId,
        customerBranchBpId: v.customerBranchBpId,
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
    const number = formatDocNumber("DOR", { yearMonth, seq });
    await recordAudit({
      action: "CREATE",
      tableName: "delivery_orders",
      recordId: number,
      after: {
        customerBpId: v.customerBpId,
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
    return actionError(
      prismaErrorMessage(
        e,
        tr("shipping.deliveryOrderActions.createFailed"),
        tr,
      ),
    );
  }
}

/** 更新 — 下書きのみ（明細は全置換）。サーバー側でも必ずガード。 */
export async function updateDeliveryOrder(
  number: string,
  payload: DeliveryOrderUpdateInput,
): Promise<ActionResult<{ number: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("delivery_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "DOR");
  if (!key)
    return actionError(tr("shipping.deliveryOrderActions.invalidNumber"));
  const parsed = updateInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  if (!(await deliveryOrderInScope(authz.access, authz.userId, key))) {
    return actionError(tr("common.outOfScope"));
  }
  try {
    const prior = await prisma.deliveryOrder.findUnique({
      where: { yearMonth_seq: key },
      select: {
        customerBpId: true,
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
      const lotError = await validateDispatchLots(v.items, tr);
      if (lotError) return actionError(lotError);
      // 受注残の過出荷ガード（作成時と同じ。自出荷書の行は除外して数える）
      const remainingError = await validateLineRemaining(v.items, tr, key);
      if (remainingError) return actionError(remainingError);
      // 束ね可否（同一顧客 × 同一出荷先 × 同一配送方法）— 作成時と同じ
      if (prior?.customerBpId) {
        const combineError = await validateCombinable(
          v.items,
          prior.customerBpId,
        );
        if (combineError) return actionError(combineError);
      }
    }
    const workOrderId = await resolveHeaderWorkOrderId(v.items);
    await prisma.$transaction(async (tx) => {
      // status を where に含めた updateMany で原子的にガードする。
      const updated = await tx.deliveryOrder.updateMany({
        where: { ...key, status: "DRAFT" },
        data: {
          type: v.type,
          workOrderId,
          fromPlantId: v.fromPlantId ? Number(v.fromPlantId) : null,
          notes: trimOrNull(v.notes),
        },
      });
      if (updated.count === 0) {
        throw new Error(
          `GUARD:${tr("shipping.deliveryOrderActions.onlyDraftCanBeEdited")}`,
        );
      }
      // 明細は全置換（DRAFT のみのため参照はまだ無い）。
      await tx.deliveryOrderItem.deleteMany({
        where: {
          deliveryOrderYearMonth: key.yearMonth,
          deliveryOrderSeq: key.seq,
        },
      });
      await tx.deliveryOrderItem.createMany({
        data: v.items.map((it, i) => ({
          deliveryOrderYearMonth: key.yearMonth,
          deliveryOrderSeq: key.seq,
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
      tableName: "delivery_orders",
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
    return actionError(
      prismaErrorMessage(
        e,
        tr("shipping.deliveryOrderActions.updateFailed"),
        tr,
      ),
    );
  }
}

/** 確定 (DRAFT → CONFIRMED)。 */
export async function confirmDeliveryOrder(
  number: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("delivery_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "DOR");
  if (!key)
    return actionError(tr("shipping.deliveryOrderActions.invalidNumber"));
  if (!(await deliveryOrderInScope(authz.access, authz.userId, key))) {
    return actionError(tr("common.outOfScope"));
  }
  try {
    const updated = await prisma.deliveryOrder.updateMany({
      where: { ...key, status: "DRAFT" },
      data: { status: "CONFIRMED" },
    });
    if (updated.count === 0) {
      return actionError(
        tr("shipping.deliveryOrderActions.onlyDraftCanBeConfirmed"),
      );
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "delivery_orders",
      recordId: number,
      before: { status: "DRAFT" },
      after: { status: "CONFIRMED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("shipping.deliveryOrderActions.confirmFailed"),
        tr,
      ),
    );
  }
}

/**
 * 出荷 (CONFIRMED → SHIPPED + shippedAt=now)。
 *
 * DISPATCH（発送）の場合は注文明細の出荷進捗を再計算する: その注文明細の
 * SHIPPED な DISPATCH 出荷書の明細数量合計 vs 受注数量 → PARTIAL_SHIPPED /
 * SHIPPED。STOCK_STORAGE（在庫保管）は注文明細ステータスを変更しない。
 */
export async function shipDeliveryOrder(number: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("delivery_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "DOR");
  if (!key)
    return actionError(tr("shipping.deliveryOrderActions.invalidNumber"));
  if (!(await deliveryOrderInScope(authz.access, authz.userId, key))) {
    return actionError(tr("common.outOfScope"));
  }
  try {
    const row = await prisma.deliveryOrder.findUnique({
      where: { yearMonth_seq: key },
      select: {
        type: true,
        items: { select: { orderLineId: true } },
      },
    });
    if (!row) return actionError(tr("shipping.deliveryOrderActions.notFound"));

    // 注文明細ステータス変更の監査用（トランザクション後に記録）。
    // 1 出荷書が複数の注文明細を束ねるため、行ごとに 1 件ずつ積む。
    const lineAudits: {
      number: string;
      before: string;
      after: string;
    }[] = [];

    await prisma.$transaction(async (tx) => {
      const updated = await tx.deliveryOrder.updateMany({
        where: { ...key, status: "CONFIRMED" },
        data: { status: "SHIPPED", shippedAt: new Date() },
      });
      if (updated.count === 0) {
        throw new Error(
          `GUARD:${tr("shipping.deliveryOrderActions.onlyConfirmedCanBeShipped")}`,
        );
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

        const agg = await tx.deliveryOrderItem.aggregate({
          _sum: { quantity: true },
          where: {
            orderLineId: lineId,
            deliveryOrder: { type: "DISPATCH", status: "SHIPPED" },
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
            `GUARD:${tr(
              "shipping.deliveryOrderActions.exceedsOrderedQuantity",
              {
                number: lineNumber,
                quantity: line.quantity,
                shipped,
              },
            )}`,
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
      const { onDeliveryOrderShippedTx } = await import("@/lib/inventory");
      await onDeliveryOrderShippedTx(tx, key);
    });

    await recordAudit({
      action: "UPDATE",
      tableName: "delivery_orders",
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
            title: tr(
              "shipping.deliveryOrderActions.shippedNotificationTitle",
              {
                number,
              },
            ),
            linkPath: `/shipping/delivery-orders/${encodeURIComponent(number)}`,
          });
        }
      }
    } catch (err) {
      // i18n-ignore — 開発者向けサーバーログ（画面には出ない）
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
    // 在庫ガード（lib/inventory）の業務エラーはそのまま表示する。
    // lib/inventory.ts が投げる原文（未訳）と突き合わせる判定式で、表示用の
    // 文言ではない。lib/inventory.ts 側を訳すまではここも日本語のまま。
    if (
      e instanceof Error &&
      // i18n-ignore
      (e.message.startsWith("在庫が不足") || e.message.includes("在庫台帳"))
    ) {
      return actionError(e.message);
    }
    return actionError(
      prismaErrorMessage(e, tr("shipping.deliveryOrderActions.shipFailed"), tr),
    );
  }
}

/** キャンセル（削除）— 下書きのみ hard delete（明細はカスケード削除）。 */
export async function deleteDeliveryOrder(
  number: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("delivery_order", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "DOR");
  if (!key)
    return actionError(tr("shipping.deliveryOrderActions.invalidNumber"));
  if (!(await deliveryOrderInScope(authz.access, authz.userId, key))) {
    return actionError(tr("common.outOfScope"));
  }
  try {
    const deleted = await prisma.deliveryOrder.deleteMany({
      where: { ...key, status: "DRAFT" },
    });
    if (deleted.count === 0) {
      return actionError(
        tr("shipping.deliveryOrderActions.onlyDraftCanBeCancelled"),
      );
    }
    await recordAudit({
      action: "DELETE",
      tableName: "delivery_orders",
      recordId: number,
      before: { status: "DRAFT" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("shipping.deliveryOrderActions.cancelFailed"),
        tr,
      ),
    );
  }
}
