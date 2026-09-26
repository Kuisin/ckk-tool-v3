"use server";

/**
 * Server Actions — 出荷書 (app.delivery_orders, SH01).
 *
 * 作成は allocateDocumentKey("DELIVERY_ORDER") で (yearMonth, seq) を1回採番し、
 * 明細を nested create で一括作成する。表示番号 DOR-YYYYMM-NNNNN は導出。
 *
 * ステータス遷移: DRAFT →(確定)→ CONFIRMED →(出荷)→ SHIPPED。
 * 過不足納品（§8）のときは確定の手前に承認が挟まりうる:
 *   DRAFT →(確定を押す)→ DRAFT + approvalStatus=PENDING →(承認)→ APPROVED
 *   → もう一度「確定」で CONFIRMED。要否は顧客マスタの設定が決め、
 *   判定は lib/delivery-variance-core.ts が唯一の定義元。
 * 出荷時（DISPATCH のみ）は注文明細の出荷進捗を再計算し、注文明細ステータスを
 * PARTIAL_SHIPPED / SHIPPED へ更新する（STOCK_STORAGE は請求フロー外のため
 * 注文明細ステータスに影響しない）。削除（キャンセル）は下書きのみ hard delete。
 */

import { type Access, rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  loadCustomerPriceEntries,
  priceListUnitPrice,
} from "@/app/(dashboard)/sales/order-acceptances/price-resolve";
import { isoDateJst } from "@/components/sales/price-lists/model";
import {
  combinabilityError,
  planAutoDeliveryNotes,
} from "@/components/shipping/delivery-orders/model";
import {
  actOnCurrentStep,
  assertFlowConfigured,
  startApprovalFlow,
} from "@/lib/approvals";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkApprovalDocAccess, checkPermission } from "@/lib/authz";
import {
  type ChargeRowsInput,
  chargeAuditShape,
  chargeRowsSchema,
  prepareChargeRows,
} from "@/lib/charges";
import { prisma } from "@/lib/db";
import {
  type DeliveryVarianceSummary,
  evaluateDeliveryOrderVariance,
  loadDeliveryTolerance,
} from "@/lib/delivery-variance";
import {
  deliveredLineStatus,
  lineVariancePermitted,
  toleranceAllowance,
} from "@/lib/delivery-variance-core";
import {
  type DocKey,
  formatDocNumber,
  formatOrderLineNumber,
  parseDocKey,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { decodeInventoryNote } from "@/lib/inventory-note-core";
import { ownerBucketFor } from "@/lib/inventory-owner-core";
import { allocateDocumentKey } from "@/lib/numbering";
import {
  isLineShippable,
  LINE_CONSUMING_DELIVERY_ORDER_WHERE,
} from "@/lib/order-line-core";
import { resolveSalesRepId } from "@/lib/sales-rep";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { loadStandardUnitPrices } from "@/lib/standard-price";
import { loadTaxCatalog } from "@/lib/tax-categories";
import { billingBasisDate, resolveLineTax } from "@/lib/tax-rate";
import {
  allocTargetItemId,
  distributeFinished,
} from "@/lib/work-order-alloc-core";
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
    /** 出荷する製品 — 値は品目 id（items.id）。品目統合 第 2 段 C。 */
    itemId: z.string().min(1, tr("common.selectAProduct")),
    lotNumber: z.number().int().min(1).nullable(),
    quantity: z
      .number()
      .int()
      .min(1, tr("shipping.deliveryOrderActions.quantityMustBeAtLeast1")),
    notes: z.string().nullable(),
  });
}

/**
 * 過不足納品の 2 つの設定（出荷書ヘッダ）。既定は従来の挙動 —
 * 締めない（不足は一部出荷のまま）/ 請求単価は受注時のまま。
 */
const varianceFieldsSchema = {
  billingPriceMode: z.enum(["ORIGINAL", "PRICE_LIST"]).default("ORIGINAL"),
  closesOrderLines: z.boolean().default(false),
} as const;

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
      ...varianceFieldsSchema,
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
      ...varianceFieldsSchema,
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
  /**
   * この明細が属する注文請書の番号（ORD-YYYYMM-NNNNN）。
   * フォームの「対象の注文請書」表示はこれを集めて作る — 注文請書ピッカーは
   * 追加専用で選択値を保持しないので、いま何の注文請書に対する出荷書なのかは
   * 載っている明細から導くしかない。
   */
  acceptanceNumber: string;
  /** 出荷書ヘッダの顧客を決めるのに使う（1 出荷書 = 1 顧客の検証にも）。 */
  customerBpId: string | null;
  customerName: string;
  /** 注文請書ヘッダの出荷先（null = 顧客へ）— 束ね可否の判定に使う。 */
  shipToBpId: string | null;
  shipToName: string | null;
  /** 注文請書ヘッダの配送方法 — 同じ配送方法の明細だけを束ねられる。 */
  deliveryMethod: "NORMAL" | "DIRECT_TO_USER";
  /**
   * 実効エンドユーザー（明細の行ごと指定 ?? 注文請書ヘッダの既定）。
   * ユーザー直送は同じエンドユーザーの明細だけを束ねられる — 確定時に
   * 自動作成する納品書の届け先を 1 件に決め打つため（combinabilityError）。
   */
  endUserBpId: string | null;
  /** 注文請書ヘッダの担当拠点 — 出荷書の出荷元拠点の既定値に使う。 */
  assignedPlantId: string | null;
  /** 既に出荷済みの数量（残数の算出用）。 */
  shippedQuantity: number;
  /** 注文明細の製品（明細の既定製品）— 値は品目 id（items.id）。 */
  itemId: string;
  productName: string;
  quantity: number;
  status: string;
  /**
   * 過不足納品（§8）が許されている明細か = 関連する指示書のどれかが
   * 「不足/超過分も納品してよい」と言っている。false なら従来どおり
   * 受注数量が上限で、不足で締めることもできない。
   */
  variancePermitted: boolean;
  /** 超過側で**許容範囲に収まる**幅（本数・切り捨て）。超えると決裁が要りうる。 */
  toleranceOver: number;
  /** 不足側で**許容範囲に収まる**幅（本数・切り捨て）。 */
  toleranceUnder: number;
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
  if (!(await checkPermission("delivery_order", "READ")).ok) return null;
  if (!orderLineId) return null;
  try {
    const so = await prisma.orderLine.findUnique({
      where: { id: orderLineId },
      include: {
        acceptance: { include: { customerBp: true } },
        // 出荷先は**明細ごと**（§8）— 注文請書ヘッダではなく行が持つ。
        shipToBp: true,
        item: true,
      },
    });
    // 確定前（枝番なし・製品未特定）の明細は出荷対象にならない。
    if (!so || so.branch == null || so.itemId == null) return null;
    const itemId = so.itemId;
    // 再研磨の明細は顧客の預り品を返す出荷 — ロットは所有者バケットから選ぶ。
    const lotOwnerBpId = ownerBucketFor(
      so.orderType,
      so.acceptance.customerBpId,
    );
    const [workOrders, inventories, allWorkOrders, tolerance] =
      await Promise.all([
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
        prisma.itemInventory.findMany({
          where: {
            itemId,
            isSemiFinished: false,
            lotNumber: { not: null },
            // 外注へ預けている分は出荷に載せられない（手元に無い）。
            custodyBpId: null,
            // 自社在庫か、この顧客の預り品（再研磨）か。所有者が違う物は載せない。
            ownerBpId: lotOwnerBpId,
          },
          select: {
            lotNumber: true,
            quantity: true,
            reservedQuantity: true,
          },
        }),
        // 過不足の許可は**完了に限らない**全指示書から見る（上の workOrders は
        // 出荷できるロットを出すための COMPLETED 限定なので使えない）。
        prisma.workOrder.findMany({
          where: {
            orderLineLinks: { some: { orderLineId } },
            status: { not: "CANCELLED" },
          },
          select: { allowQuantityVariance: true },
        }),
        loadDeliveryTolerance(so.acceptance.customerBpId),
      ]);
    const soLots = new Set(workOrders.map((wo) => wo.workOrderNumber));
    const byLot = new Map<number, { quantity: number; reserved: number }>();
    for (const inv of inventories) {
      if (inv.lotNumber == null || !soLots.has(inv.lotNumber)) continue;
      const cur = byLot.get(inv.lotNumber) ?? { quantity: 0, reserved: 0 };
      cur.quantity += Number(inv.quantity);
      cur.reserved += Number(inv.reservedQuantity);
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
      acceptanceNumber: formatDocNumber("ORD", {
        yearMonth: so.acceptanceYearMonth,
        seq: so.acceptanceSeq,
      }),
      customerBpId: so.acceptance.customerBpId,
      customerName: localized(
        so.acceptance.customerBp?.name as LocalizedText | null,
      ),
      // 配送（§8）— 明細ごと。
      shipToBpId: so.shipToBpId,
      shipToName: so.shipToBp
        ? localized(so.shipToBp.name as LocalizedText | null)
        : null,
      deliveryMethod: so.deliveryMethod,
      endUserBpId: so.endUserBpId,
      assignedPlantId:
        so.assignedPlantId != null ? String(so.assignedPlantId) : null,
      shippedQuantity: await shippedQuantityForLine(so.id),
      itemId: String(itemId),
      productName: localized(so.item?.name as LocalizedText | null),
      quantity: so.quantity,
      status: so.status,
      variancePermitted: lineVariancePermitted(allWorkOrders),
      toleranceOver: Math.floor(
        toleranceAllowance(so.quantity, tolerance, "over"),
      ),
      toleranceUnder: Math.floor(
        toleranceAllowance(so.quantity, tolerance, "under"),
      ),
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
  if (!(await checkPermission("delivery_order", "READ")).ok) return [];
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
 * DISPATCH 明細のロット在庫の確認。ロット指定行のみ、現物数量
 * （非半製品バケット合計）に対して数える。
 *
 * **止めない。** 足りなくても作成・編集は通し、注意書きを返すだけ
 * （出荷そのものも足りないまま通る — lib/inventory の
 * onDeliveryOrderShippedTx）。以前はここで弾いていたが、物のほうが先に
 * 動いている現場では「出せないのは画面だけ」になり、台帳を直すより先に
 * 出荷の記録を作れないことのほうが困る。
 */
async function validateDispatchLots(
  items: {
    orderLineId: string | null;
    itemId: string;
    lotNumber: number | null;
    quantity: number;
  }[],
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<string[]> {
  const warnings: string[] = [];
  // 行の所有者（再研磨の明細 = 顧客の預り品、それ以外 = 自社）。数える先の
  // バケットが違うので、集計の鍵にも所有者を入れる。
  const ownerByLine = await lineOwnerMap(items);
  const byKey = new Map<
    string,
    { itemId: number; lot: number; qty: number; lotOwnerBpId: string | null }
  >();
  for (const it of items) {
    if (it.lotNumber == null) continue;
    const lotOwnerBpId = it.orderLineId
      ? (ownerByLine.get(it.orderLineId) ?? null)
      : null;
    const key = `${it.itemId}:${it.lotNumber}:${lotOwnerBpId ?? ""}`;
    const cur = byKey.get(key) ?? {
      itemId: Number(it.itemId),
      lot: it.lotNumber,
      qty: 0,
      lotOwnerBpId,
    };
    cur.qty += it.quantity;
    byKey.set(key, cur);
  }
  for (const { itemId, lot, qty, lotOwnerBpId } of byKey.values()) {
    const agg = await prisma.itemInventory.aggregate({
      where: {
        itemId,
        lotNumber: lot,
        isSemiFinished: false,
        // 同上 — 預けている分を数えると「在庫あり」と言って出荷で落ちる。
        custodyBpId: null,
        ownerBpId: lotOwnerBpId,
      },
      _sum: { quantity: true },
      _count: true,
    });
    if ((agg._count ?? 0) === 0) {
      warnings.push(tr("shipping.deliveryOrderActions.lotHasNoStock", { lot }));
      continue;
    }
    const available = Number(agg._sum.quantity ?? 0);
    if (qty > available) {
      warnings.push(
        tr("shipping.deliveryOrderActions.lotStockInsufficient", {
          lot,
          available,
          qty,
        }),
      );
    }
  }
  return warnings;
}

/**
 * 明細 id → その明細の物の所有者（再研磨なら顧客、それ以外は null = 自社）。
 * 判定は lib/inventory-owner-core.ts（出荷・返品・引当が同じ規則を読む）。
 */
async function lineOwnerMap(
  items: { orderLineId: string | null }[],
): Promise<Map<string, string | null>> {
  const ids = [
    ...new Set(
      items
        .map((it) => it.orderLineId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 0) return new Map();
  const lines = await prisma.orderLine.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      orderType: true,
      acceptance: { select: { customerBpId: true } },
    },
  });
  return new Map(
    lines.map((l) => [
      l.id,
      ownerBucketFor(l.orderType, l.acceptance.customerBpId),
    ]),
  );
}

/**
 * 再研磨の明細は**発送（DISPATCH）でしか出せない**。在庫保管（STOCK_STORAGE）は
 * 予備製作分を自社の棚へ入れる出荷書で、顧客の預り品を自社在庫に入れる経路に
 * なってしまう。
 */
async function regrindLinesOnStockStorageError(
  type: "DISPATCH" | "STOCK_STORAGE",
  items: { orderLineId: string | null }[],
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<string | null> {
  if (type !== "STOCK_STORAGE") return null;
  const owners = await lineOwnerMap(items);
  for (const owner of owners.values()) {
    if (owner != null) {
      return tr("shipping.deliveryOrderActions.regrindLinesDispatchOnly");
    }
  }
  return null;
}

/**
 * 束ね可否の不変条件 — 1 出荷書に載せられるのは同一顧客 × 同一出荷先 ×
 * 同一配送方法（§8 — 明細ごとに持つ）の注文明細だけ。判定はクライアントと
 * 共有の combinabilityError（components/shipping/delivery-orders/model）。
 */
async function validateCombinable(
  items: { orderLineId: string | null }[],
  customerBpId: string,
  tr: Awaited<ReturnType<typeof getTranslations>>,
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
      acceptance: { select: { customerBpId: true } },
      shipToBpId: true,
      deliveryMethod: true,
      endUserBpId: true,
    },
  });
  return combinabilityError(
    lines.map((l) => ({
      customerBpId: l.acceptance.customerBpId,
      shipToBpId: l.shipToBpId,
      deliveryMethod: l.deliveryMethod,
      endUserBpId: l.endUserBpId,
    })),
    tr,
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
 * DISPATCH 明細の各行が参照する注文明細と整合しているか（作成・更新時）:
 * 行の製品 = 注文明細の製品、かつ注文明細が出荷できる状態（確定済み・
 * 未キャンセル — isLineShippable）。別製品の行を注文明細に紐づけると、
 * 出荷時にその明細の出荷済数量として数えられ、請求もその明細の単価で立つ。
 */
async function validateLineProducts(
  items: { orderLineId: string | null; itemId: string }[],
  tr: Awaited<ReturnType<typeof getTranslations>>,
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
      id: true,
      itemId: true,
      // 再研磨の明細では「出す物」は工具のほう（itemId は売る役務）。
      toolItemId: true,
      orderType: true,
      status: true,
      acceptanceYearMonth: true,
      acceptanceSeq: true,
      branch: true,
    },
  });
  const byId = new Map(lines.map((l) => [l.id, l]));
  for (const [i, it] of items.entries()) {
    if (!it.orderLineId) continue;
    const line = byId.get(it.orderLineId);
    if (!line || line.branch == null) {
      return tr("shipping.deliveryOrderActions.specifyAConfirmedOrderLine");
    }
    const number = formatOrderLineNumber({
      yearMonth: line.acceptanceYearMonth,
      seq: line.acceptanceSeq,
      branch: line.branch,
    });
    if (!isLineShippable(line)) {
      return tr("shipping.deliveryOrderActions.orderLineNotShippable", {
        number,
      });
    }
    // 出荷明細が指すのは**現物**。再研磨では預かった工具で、
    // 売り物（再研磨の役務）ではない — 読み替えは allocTargetItemId が 1 本。
    const shipped = allocTargetItemId(line);
    if (shipped == null || Number(it.itemId) !== shipped) {
      return tr("shipping.deliveryOrderActions.productMismatch", {
        line: i + 1,
        number,
      });
    }
  }
  return null;
}

/**
 * 過不足の検査（作成・更新時の fail-fast）。確定的なガードは
 * `confirmDeliveryOrder` / `shipDeliveryOrder` 側（そのときの数で数え直す）。
 *
 * 拒むのは 2 つだけ:
 *   - 指示書の許可が無いのに**受注数を超える**（従来の過出荷ガードそのもの）
 *   - 指示書の許可が無いのに**不足で締めようとする**
 *
 * 許可があるときは範囲外でも保存を通す — 範囲外は「禁止」ではなく「決裁が要る」で、
 * その決裁は確定のときに求める。ここで止めると、決裁に出す下書きすら作れない。
 *
 * 残数を消費する出荷書の範囲は LINE_CONSUMING_DELIVERY_ORDER_WHERE（DISPATCH の
 * 下書き・確定・出荷済 — SH03 の未手配数と同じ条件）。
 */
async function validateVariance(
  customerBpId: string | null,
  items: readonly { orderLineId: string | null; quantity: number }[],
  closesOrderLines: boolean,
  tr: Awaited<ReturnType<typeof getTranslations>>,
  excludeKey?: DocKey,
): Promise<{ error: string | null; summary: DeliveryVarianceSummary }> {
  const summary = await evaluateDeliveryOrderVariance({
    customerBpId,
    items,
    closesOrderLines,
    excludeKey,
  });
  const over = summary.overWithoutPermission[0];
  if (over) {
    return {
      error: tr("shipping.deliveryOrderActions.exceedsLineRemaining", {
        number: over.orderLineNumber,
        remaining: Math.max(0, over.orderedQuantity - over.otherQuantity),
        requested: over.thisQuantity,
      }),
      summary,
    };
  }
  const short = summary.shortCloseWithoutPermission[0];
  if (short) {
    return {
      error: tr("shipping.deliveryOrderActions.cannotCloseShortLine", {
        number: short.orderLineNumber,
        ordered: short.orderedQuantity,
        delivered: short.deliveredQuantity,
      }),
      summary,
    };
  }
  return { error: null, summary };
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
// ── 追加料金（送料など。§8 / §9） ───────────────────────────────────────────

/**
 * 載せたロットの指示書に書いてある追加料金（予定）を、出荷書へ複写する。
 *
 * **同じ指示書を 2 行以上載せても 1 回しか複写しない** — 送料は「この出荷に
 * かかるもの」で、明細の行数ぶん増えるものではない（ロット番号で畳んでいる）。
 *
 * 金額は指示書の行に焼き込んであるものをそのまま持ってくる（マスタを引き直さ
 * ない）。生産側が書いた予定をそのまま見せるのが目的で、値段を決め直すのは
 * 出荷担当が画面でやること。
 */
async function copyWorkOrderCharges(
  key: { yearMonth: string; seq: number },
  items: ReadonlyArray<{ lotNumber?: number | null }>,
): Promise<number> {
  const lots = [
    ...new Set(
      items
        .map((it) => it.lotNumber)
        .filter((n): n is number => typeof n === "number"),
    ),
  ];
  if (lots.length === 0) return 0;
  const workOrders = await prisma.workOrder.findMany({
    where: { workOrderNumber: { in: lots } },
    select: {
      id: true,
      charges: {
        orderBy: { sortOrder: "asc" },
        select: {
          chargeItemId: true,
          description: true,
          quantity: true,
          unitPrice: true,
          amount: true,
        },
      },
    },
  });
  const rows = workOrders.flatMap((wo) =>
    wo.charges.map((c) => ({ ...c, sourceWorkOrderId: wo.id })),
  );
  if (rows.length === 0) return 0;
  await prisma.deliveryOrderCharge.createMany({
    data: rows.map((r, i) => ({
      deliveryOrderYearMonth: key.yearMonth,
      deliveryOrderSeq: key.seq,
      chargeItemId: r.chargeItemId,
      sourceWorkOrderId: r.sourceWorkOrderId,
      description: r.description,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      amount: r.amount,
      sortOrder: i,
    })),
  });
  return rows.length;
}

/**
 * 出荷書の追加料金を保存（渡された行が保存後の全部）。**請求される実体はこちら**。
 *
 * ★ 直せるのは**下書きのうちだけ**。確定した出荷書は請求単価を焼き込み済みで、
 *   締日処理がその金額を請求書へ写す — あとから金額を動かすと、締日画面の
 *   予定額と発行済みの請求額が食い違う（出荷書明細の単価と同じ扱い）。
 */
export async function saveDeliveryOrderCharges(
  number: string,
  rows: ChargeRowsInput,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("delivery_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "DOR");
  if (!key) return actionError(tr("common.invalidInput"));
  if (!(await deliveryOrderInScope(authz.access, authz.userId, key))) {
    return actionError(tr("common.scopeDenied"));
  }
  const parsed = chargeRowsSchema.safeParse(rows);
  if (!parsed.success) return actionError(tr("common.invalidInput"));

  const order = await prisma.deliveryOrder.findUnique({
    where: { yearMonth_seq: key },
    select: {
      status: true,
      charges: {
        orderBy: { sortOrder: "asc" },
        select: {
          chargeItemId: true,
          description: true,
          quantity: true,
          unitPrice: true,
          amount: true,
        },
      },
    },
  });
  if (!order) return actionError(tr("common.targetNotFound"));
  if (order.status !== "DRAFT") {
    return actionError(tr("charges.deliveryOrderClosedForCharges"));
  }

  const prepared = await prepareChargeRows(parsed.data);
  if (!prepared.ok) return actionError(tr(prepared.errorKey));

  const actor = await getCurrentActorId();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.deliveryOrderCharge.deleteMany({
        where: {
          deliveryOrderYearMonth: key.yearMonth,
          deliveryOrderSeq: key.seq,
        },
      });
      if (prepared.rows.length > 0) {
        await tx.deliveryOrderCharge.createMany({
          data: prepared.rows.map((r) => ({
            deliveryOrderYearMonth: key.yearMonth,
            deliveryOrderSeq: key.seq,
            chargeItemId: r.chargeItemId,
            description: r.description,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            amount: r.amount,
            sortOrder: r.sortOrder,
            createdBy: actor,
          })),
        });
      }
    });
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("charges.couldNotSave"), tr));
  }

  await recordAudit({
    action: "UPDATE",
    tableName: "delivery_orders",
    recordId: number,
    before: {
      charges: chargeAuditShape(
        order.charges.map((c) => ({
          ...c,
          unitPrice: Number(c.unitPrice),
          amount: Number(c.amount),
        })),
      ),
    },
    after: { charges: chargeAuditShape(prepared.rows) },
  });
  revalidate(number);
  return actionOk();
}

export async function createDeliveryOrder(
  payload: DeliveryOrderCreateInput,
): Promise<ActionResult<{ number: string; warnings: string[] }>> {
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
  // 止めない注意書き（在庫不足など）。保存はするが利用者には見せる。
  const warnings: string[] = [];
  try {
    const regrindError = await regrindLinesOnStockStorageError(
      v.type,
      v.items,
      tr,
    );
    if (regrindError) return actionError(regrindError);
    // 発送（DISPATCH）はロット在庫を数える。**足りなくても止めない** —
    // 注意書きにして返し、利用者に見せる（出荷そのものも通る）。
    if (v.type === "DISPATCH") {
      warnings.push(...(await validateDispatchLots(v.items, tr)));
      // 行の製品 = 注文明細の製品、かつ出荷できる状態の明細であること
      const productError = await validateLineProducts(v.items, tr);
      if (productError) return actionError(productError);
      const variance = await validateVariance(
        v.customerBpId,
        v.items,
        v.closesOrderLines,
        tr,
      );
      if (variance.error) return actionError(variance.error);
      const combineError = await validateCombinable(
        v.items,
        v.customerBpId,
        tr,
      );
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
        billingPriceMode: v.billingPriceMode,
        closesOrderLines: v.closesOrderLines,
        notes: trimOrNull(v.notes),
        createdBy: authz.userId,
        items: {
          create: v.items.map((it, i) => ({
            orderLineId: it.orderLineId,
            itemId: Number(it.itemId),
            // 旧 product_id 列も橋渡しで埋める（落とすのは最後の段）。
            lotNumber: it.lotNumber,
            quantity: it.quantity,
            notes: trimOrNull(it.notes),
            sortOrder: i,
          })),
        },
      },
    });
    const number = formatDocNumber("DOR", { yearMonth, seq });
    // 載せたロットの指示書に書いてある追加料金（予定）を複写する。以後は
    // **出荷書側だけを直す** — 実費・箱数・同梱で要らなくなった、は出荷の
    // ときにしか決まらないので、指示書の予定を後から書き換えても意味が無い。
    const copiedCharges = await copyWorkOrderCharges(
      { yearMonth, seq },
      v.items,
    );
    await recordAudit({
      action: "CREATE",
      tableName: "delivery_orders",
      recordId: number,
      after: {
        customerBpId: v.customerBpId,
        type: v.type,
        fromPlantId: v.fromPlantId,
        status: "DRAFT",
        billingPriceMode: v.billingPriceMode,
        closesOrderLines: v.closesOrderLines,
        notes: trimOrNull(v.notes),
        items: v.items,
        copiedCharges,
      },
    });
    revalidate(number);
    return actionOk({ number, warnings });
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
): Promise<ActionResult<{ number: string; warnings: string[] }>> {
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
  // 止めない注意書き（在庫不足など）。
  const warnings: string[] = [];
  try {
    const prior = await prisma.deliveryOrder.findUnique({
      where: { yearMonth_seq: key },
      select: {
        customerBpId: true,
        type: true,
        fromPlantId: true,
        billingPriceMode: true,
        closesOrderLines: true,
        notes: true,
        items: {
          orderBy: { sortOrder: "asc" },
          select: {
            itemId: true,
            lotNumber: true,
            quantity: true,
            notes: true,
          },
        },
      },
    });
    const regrindError = await regrindLinesOnStockStorageError(
      v.type,
      v.items,
      tr,
    );
    if (regrindError) return actionError(regrindError);
    // 発送（DISPATCH）はロット在庫を数える（足りなくても止めない — 上と同じ）
    if (v.type === "DISPATCH") {
      warnings.push(...(await validateDispatchLots(v.items, tr)));
      // 行の製品 = 注文明細の製品、かつ出荷できる状態の明細であること
      const productError = await validateLineProducts(v.items, tr);
      if (productError) return actionError(productError);
      // 過不足の検査（作成時と同じ。自出荷書の行は除外して数える）
      const variance = await validateVariance(
        prior?.customerBpId ?? null,
        v.items,
        v.closesOrderLines,
        tr,
        key,
      );
      if (variance.error) return actionError(variance.error);
      // 束ね可否（同一顧客 × 同一出荷先 × 同一配送方法）— 作成時と同じ
      if (prior?.customerBpId) {
        const combineError = await validateCombinable(
          v.items,
          prior.customerBpId,
          tr,
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
          billingPriceMode: v.billingPriceMode,
          closesOrderLines: v.closesOrderLines,
          notes: trimOrNull(v.notes),
          // 差し戻し後に内容を直したら、承認は取り直す（前の決裁は別の中身
          // に対するもの）。承認済みの出荷書は編集できない状態ではないので、
          // ここを消さないと「承認された数量とは違う数量が確定できる」。
          approvalStatus: "NONE",
          requestedAt: null,
          requestedBy: null,
          approvedAt: null,
          approvedBy: null,
          rejectedAt: null,
          rejectedBy: null,
          rejectReason: null,
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
          itemId: Number(it.itemId),
          // 旧 product_id 列も橋渡しで埋める（落とすのは最後の段）。
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
        billingPriceMode: v.billingPriceMode,
        closesOrderLines: v.closesOrderLines,
        notes: trimOrNull(v.notes),
        items: v.items,
      },
    });
    revalidate(number);
    return actionOk({ number, warnings });
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

// ── 請求単価の確定（出荷書の確定時に 1 回だけ焼き込む） ──────────────────────

/**
 * 出荷書明細ごとの請求単価を決める。
 *
 * ORIGINAL（既定）… 受注時の単価をそのまま。従来の挙動と 1 円も変わらない。
 * PRICE_LIST     … **実際に納めた数**で価格表を引き直す。100 本の段階で受注して
 *                  80 本しか納めないなら 80 本の段階単価にする、という運用のため。
 *
 * 引き直しに使う数量は**その注文明細の累計納品数**（他の出荷書のぶんを含む）で、
 * この出荷書 1 通の数ではない。段階単価は顧客が受け取る総量に対する約束なので、
 * 分割出荷の 2 通目だけを見て段を決めると、同じ受注が便ごとに別の単価になる。
 *
 * 価格表を引けない（顧客 × 製品のエントリが無い・数量段階が無い）ときは受注時の
 * 単価へ落ちる。ここで 0 円にしたり保存を止めたりはしない — 請求できない出荷を
 * 作るより、受注時の約束で請求するほうが正しい。
 *
 * 戻り値は「明細 id → 単価」。焼き込んだあとは価格表を直しても発行済みの
 * 納品書・請求書は動かない（invoices.tax_rate と同じ考え方）。
 */
async function resolveBillingUnitPrices(
  key: DocKey,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<Map<string, number>> {
  const row = await prisma.deliveryOrder.findUnique({
    where: { yearMonth_seq: key },
    select: {
      type: true,
      customerBpId: true,
      billingPriceMode: true,
      items: {
        select: {
          id: true,
          orderLineId: true,
          orderLine: {
            select: { unitPrice: true, itemId: true, orderType: true },
          },
        },
      },
    },
  });
  const prices = new Map<string, number>();
  if (!row) return prices;

  const originalOf = (it: (typeof row.items)[number]) =>
    Number(it.orderLine?.unitPrice ?? 0);

  if (row.type !== "DISPATCH" || row.billingPriceMode === "ORIGINAL") {
    for (const it of row.items) prices.set(it.id, originalOf(it));
    return prices;
  }

  // 価格表（顧客ごと）と標準価格（品目の定価）— 保存・照合と同じ 2 段で引く。
  const [entries, standard] = await Promise.all([
    loadCustomerPriceEntries(row.customerBpId),
    loadStandardUnitPrices(row.items.map((it) => it.orderLine?.itemId)),
  ]);
  // 注文明細ごとの累計納品数（この出荷書のぶんを含む — 確定の時点で既に
  // 明細行は保存されているので、除外せずそのまま数えれば累計になる）。
  const deliveredByLine = new Map<string, number>();
  for (const it of row.items) {
    if (!it.orderLineId || deliveredByLine.has(it.orderLineId)) continue;
    const agg = await prisma.deliveryOrderItem.aggregate({
      _sum: { quantity: true },
      where: {
        orderLineId: it.orderLineId,
        deliveryOrder: LINE_CONSUMING_DELIVERY_ORDER_WHERE,
      },
    });
    deliveredByLine.set(it.orderLineId, agg._sum?.quantity ?? 0);
  }

  for (const it of row.items) {
    const original = originalOf(it);
    const line = it.orderLine;
    const delivered = it.orderLineId
      ? (deliveredByLine.get(it.orderLineId) ?? 0)
      : 0;
    if (!line || line.itemId == null || delivered <= 0) {
      prices.set(it.id, original);
      continue;
    }
    const resolved = priceListUnitPrice(
      entries,
      row.customerBpId,
      {
        itemId: String(line.itemId),
        orderType: line.orderType,
        quantity: delivered,
        standardUnitPrice: standard.get(line.itemId) ?? null,
      },
      tr,
    );
    prices.set(it.id, resolved ?? original);
  }
  return prices;
}

/** 確定 (DRAFT → CONFIRMED)。 */
/**
 * 確定 (DRAFT → CONFIRMED) 時に自動作成する納品書の材料を集める
 * （DISPATCH のみ・明細ゼロは対象外）。営業担当は明細 → 注文請書ヘッダの
 * 導出値が 1 人に定まるときだけ引き継ぐ（無ければ顧客の主担当）。
 */
async function planDeliveryOrderNotes(
  key: DocKey,
  /**
   * 確定と同じトランザクションで焼き込む請求単価（resolveBillingUnitPrices）。
   * **納品書はこの値で作る** — 焼き込みより先にここを読むので、保存済みの
   * unit_price（この時点ではまだ null）を当てにすると、納品書だけが受注時の
   * 単価のまま残り、あとから作る請求書と食い違う。
   */
  unitPrices: Map<string, number>,
): Promise<{
  customerBpId: string;
  customerBranchBpId: string | null;
  deliveryMethod: "NORMAL" | "DIRECT_TO_USER";
  salesRepId: string | null;
  items: {
    /** 品目 id（items.id）。 */
    itemId: number;
    quantity: number;
    unitPrice: number;
    /** 行の税スナップショット（請求単価と同じく確定時に焼き込む）。 */
    taxCategoryId: number | null;
    taxRate: number;
  }[];
  notes: ReturnType<typeof planAutoDeliveryNotes>;
} | null> {
  const row = await prisma.deliveryOrder.findUnique({
    where: { yearMonth_seq: key },
    select: {
      type: true,
      customerBpId: true,
      customerBranchBpId: true,
      shippedAt: true,
      // 顧客の課税区分（null = 「製品に従う」）。
      customerBp: {
        select: { customerAttrs: { select: { taxCategoryId: true } } },
      },
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          itemId: true,
          quantity: true,
          // 確定時に焼き込んだ請求単価が先。null は確定前 or 移行前のデータで、
          // そのときだけ注文明細の単価に落ちる（従来の経路）。
          unitPrice: true,
          // 税率は製品ごとの課税区分で決まる（顧客が指定していればそちらが優先）。
          item: { select: { taxCategoryId: true } },
          orderLine: {
            select: {
              unitPrice: true,
              // 配送（§8）— 明細ごと。
              deliveryMethod: true,
              endUserBpId: true,
              acceptance: {
                select: {
                  salesRepId: true,
                  // 税率の基準日（注文日）。null なら出荷日 → 今日へ落ちる。
                  orderDate: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!row || row.type !== "DISPATCH" || row.items.length === 0) return null;

  const repIds = new Set(
    row.items
      .map((it) => it.orderLine?.acceptance.salesRepId)
      .filter((id): id is string => Boolean(id)),
  );
  const salesRepId = await resolveSalesRepId(
    repIds.size === 1 ? [...repIds][0] : null,
    row.customerBpId,
    null,
  );

  const catalog = await loadTaxCatalog();
  const customerTaxCategoryId =
    row.customerBp.customerAttrs?.taxCategoryId ?? null;

  // combinabilityError が全明細で揃えることを保証しているので先頭行の値でよい。
  const deliveryMethod = row.items[0].orderLine?.deliveryMethod ?? "NORMAL";
  const endUserBpId = row.items[0].orderLine?.endUserBpId ?? null;

  return {
    customerBpId: row.customerBpId,
    customerBranchBpId: row.customerBranchBpId,
    deliveryMethod,
    salesRepId,
    items: row.items.map((it) => {
      // 請求単価と**同じ場所**で税も焼き込む。基準日は注文日（請求書と同じ規則で、
      // 落ち方も billingBasisDate 1 本に閉じる）。
      const lineTax = resolveLineTax(catalog, {
        customerTaxCategoryId,
        productTaxCategoryId: it.item?.taxCategoryId ?? null,
        basisDate: billingBasisDate(
          isoDateOrNull(it.orderLine?.acceptance.orderDate),
          isoDateOrNull(row.shippedAt),
          isoDateJst(new Date()),
        ),
      });
      return {
        itemId: it.itemId,
        quantity: it.quantity,
        unitPrice:
          unitPrices.get(it.id) ??
          Number(it.unitPrice ?? it.orderLine?.unitPrice ?? 0),
        taxCategoryId: lineTax.categoryId,
        taxRate: lineTax.rate,
      };
    }),
    notes: planAutoDeliveryNotes({
      customerBpId: row.customerBpId,
      customerBranchBpId: row.customerBranchBpId,
      deliveryMethod,
      endUserBpId,
    }),
  };
}

/** DATE / タイムスタンプ → JST 暦日 "YYYY-MM-DD"。null はそのまま。 */
function isoDateOrNull(value: Date | null | undefined): string | null {
  return value == null ? null : isoDateJst(value);
}

// ── 過不足の承認（§8） ──────────────────────────────────────────────────────

/**
 * 確定を押したときの過不足ゲート。通してよければ null、止めるなら
 * `ActionResult`（エラー or 「承認依頼を出した」の成功）を返す。
 *
 * 流れは 4 通りしかない:
 *   1. 過不足なし / 承認不要      → null（そのまま確定へ）
 *   2. 保存が許されない過不足     → エラー（指示書の許可が無い）
 *   3. 承認が要る & まだ承認前     → 依頼を作って PENDING で止める
 *   4. 承認が要る & 承認済み       → null（決裁を通ったので確定へ）
 *
 * ★ **承認設定 (MS0B) に段が 1 つも無ければ素通し**（工程フロー変更と同じ規約）。
 *   段を組んでいない環境で出荷が止まると、過不足を許した瞬間に現場が詰まる。
 *   「決裁を挟む」と決めたのに段を組み忘れている状態は、出荷を止めるより
 *   通してしまうほうが害が小さい — 監査行には過不足の中身が残る。
 */
async function guardVarianceOnConfirm(
  key: DocKey,
  number: string,
  actorId: string,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<ActionResult | null> {
  const row = await prisma.deliveryOrder.findUnique({
    where: { yearMonth_seq: key },
    select: {
      type: true,
      status: true,
      customerBpId: true,
      closesOrderLines: true,
      approvalStatus: true,
      items: { select: { orderLineId: true, quantity: true } },
    },
  });
  if (!row) return actionError(tr("shipping.deliveryOrderActions.notFound"));
  // 下書き以外は確定そのものが通らない。ここで抜けないと、確定済みの出荷書に
  // 「確定」を押しただけで承認依頼が 1 件生えてしまう（実際の確定は下の
  // updateMany が status で弾くので、依頼だけが宙に浮く）。
  if (row.status !== "DRAFT") return null;
  // 在庫保管は受注数量と独立 — 過不足という概念が無い。
  if (row.type !== "DISPATCH") return null;

  const summary = await evaluateDeliveryOrderVariance({
    customerBpId: row.customerBpId,
    items: row.items,
    closesOrderLines: row.closesOrderLines,
    excludeKey: key,
  });

  const over = summary.overWithoutPermission[0];
  if (over) {
    return actionError(
      tr("shipping.deliveryOrderActions.exceedsOrderedQuantity", {
        number: over.orderLineNumber,
        quantity: over.orderedQuantity,
        shipped: over.deliveredQuantity,
      }),
    );
  }
  const short = summary.shortCloseWithoutPermission[0];
  if (short) {
    return actionError(
      tr("shipping.deliveryOrderActions.cannotCloseShortLine", {
        number: short.orderLineNumber,
        ordered: short.orderedQuantity,
        delivered: short.deliveredQuantity,
      }),
    );
  }

  if (!summary.approvalRequired) return null;
  if (row.approvalStatus === "APPROVED") return null;
  // 依頼中に押し直しても依頼は増やさない。startApprovalFlow は二重依頼を
  // 成功として吸収するので黙って通ってしまうが、押した人には「まだ決裁待ち」と
  // 言うほうが正しい（承認されれば同じボタンが確定になる）。
  if (row.approvalStatus === "PENDING") {
    return actionError(tr("shipping.deliveryOrderActions.awaitingApproval"));
  }

  // 段が無ければ素通し（NONE のまま。依頼も作らない）。
  if (await assertFlowConfigured("delivery_orders")) return null;

  // **依頼を先に作る** — 逆順だと依頼の作成に失敗したとき、出荷書だけが
  // 承認依頼中のまま誰の承認一覧にも出ない。二重依頼は startApprovalFlow が
  // 成功として吸収するので、押し直しで追いつく（design_requests と同じ作法）。
  const started = await startApprovalFlow({
    targetType: "delivery_orders",
    targetId: number,
  });
  if (!started.ok) {
    return actionError(
      started.error ??
        tr("shipping.deliveryOrderActions.approvalRequestFailed"),
    );
  }
  await prisma.deliveryOrder.update({
    where: { yearMonth_seq: key },
    data: {
      approvalStatus: "PENDING",
      requestedAt: new Date(),
      requestedBy: actorId,
      rejectedAt: null,
      rejectedBy: null,
      rejectReason: null,
    },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "delivery_orders",
    recordId: number,
    before: { approvalStatus: row.approvalStatus },
    after: {
      approvalStatus: "PENDING",
      variance: summary.lines
        .filter((l) => l.isVarianceEvent)
        .map((l) => ({
          orderLine: l.orderLineNumber,
          ordered: l.orderedQuantity,
          delivered: l.deliveredQuantity,
          kind: l.verdict.kind,
          withinTolerance: l.verdict.withinTolerance,
        })),
    },
  });
  revalidate(number);
  return actionOk();
}

/** 承認 — 全段通過で APPROVED。以後もう一度「確定」を押せば確定できる。 */
export async function approveDeliveryOrder(
  number: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  // 承認グループ所属（本人 or 代理）は actOnCurrentStep が検証する。
  const authz = await checkApprovalDocAccess("delivery_order");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "DOR");
  if (!key)
    return actionError(tr("shipping.deliveryOrderActions.invalidNumber"));
  try {
    const prior = await prisma.deliveryOrder.findUnique({
      where: { yearMonth_seq: key },
      select: { approvalStatus: true },
    });
    if (!prior)
      return actionError(tr("shipping.deliveryOrderActions.notFound"));
    if (prior.approvalStatus !== "PENDING") {
      return actionError(
        tr("shipping.deliveryOrderActions.notPendingApproval"),
      );
    }
    const acted = await actOnCurrentStep({
      targetType: "delivery_orders",
      targetId: number,
      action: "APPROVED",
    });
    if (!acted.ok) {
      return actionError(acted.error ?? tr("common.couldNotApprove"));
    }
    // 途中の段は PENDING のまま進む。全段を通ってはじめて APPROVED。
    if (!acted.flowCompleted) {
      revalidate(number);
      return actionOk();
    }
    await prisma.deliveryOrder.update({
      where: { yearMonth_seq: key },
      data: {
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedBy: authz.userId,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "delivery_orders",
      recordId: number,
      before: { approvalStatus: "PENDING" },
      after: { approvalStatus: "APPROVED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

/** 差し戻し（理由必須）— 出荷書は下書きのままなので、直して出し直せる。 */
export async function rejectDeliveryOrder(
  number: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("delivery_order");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError(tr("common.enterAReasonForSendingIt"));
  const key = parseDocKey(number, "DOR");
  if (!key)
    return actionError(tr("shipping.deliveryOrderActions.invalidNumber"));
  try {
    const prior = await prisma.deliveryOrder.findUnique({
      where: { yearMonth_seq: key },
      select: { approvalStatus: true },
    });
    if (!prior)
      return actionError(tr("shipping.deliveryOrderActions.notFound"));
    if (prior.approvalStatus !== "PENDING") {
      return actionError(
        tr("shipping.deliveryOrderActions.notPendingApproval"),
      );
    }
    const acted = await actOnCurrentStep({
      targetType: "delivery_orders",
      targetId: number,
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(acted.error ?? tr("common.couldNotApprove"));
    }
    await prisma.deliveryOrder.update({
      where: { yearMonth_seq: key },
      data: {
        approvalStatus: "REJECTED",
        rejectedAt: new Date(),
        rejectedBy: authz.userId,
        rejectReason: trimmed,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "delivery_orders",
      recordId: number,
      before: { approvalStatus: "PENDING" },
      after: { approvalStatus: "REJECTED", rejectReason: trimmed },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

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
    // ── 過不足のゲート ──────────────────────────────────────────────────
    // 確定はここが最後の関門 — 下書きを作ったあとに他の出荷書が増えていれば
    // 累計は変わっているので、保存時ではなくいま数え直す。
    const gate = await guardVarianceOnConfirm(key, number, authz.userId, tr);
    if (gate) return gate;

    const unitPrices = await resolveBillingUnitPrices(key, tr);
    const plan = await planDeliveryOrderNotes(key, unitPrices);
    // 採番は $transaction の外で行う（既存の全書類共通の作法 — allocateDocumentKey
    // 参照。gap は許容し、番号の一意性だけを守る）。
    const noteKeys = plan
      ? await Promise.all(plan.notes.map(() => allocateDocumentKey("DELIVERY")))
      : [];
    const deliveryNoteNumbers: string[] = [];

    await prisma.$transaction(async (tx) => {
      const updated = await tx.deliveryOrder.updateMany({
        where: { ...key, status: "DRAFT" },
        data: { status: "CONFIRMED" },
      });
      if (updated.count === 0) {
        throw new Error(
          `GUARD:${tr("shipping.deliveryOrderActions.onlyDraftCanBeConfirmed")}`,
        );
      }
      // 請求単価を焼き込む。確定より後に価格表を直しても、発行済みの
      // 納品書・請求書は動かない。
      for (const [itemId, unitPrice] of unitPrices) {
        await tx.deliveryOrderItem.update({
          where: { id: itemId },
          data: { unitPrice },
        });
      }
      if (!plan) return;
      // 納品書は**発行済（ISSUED）で作る** — 下書きを経由しない。内容は
      // 出荷書と注文請書から機械的に決まる（planAutoDeliveryNotes）ので、
      // 人が直す段階を置くと、価格記載や宛先を確定後に書き換えられてしまう。
      // 直したいときは正しい注文請書・出荷書から作り直す。
      for (let i = 0; i < plan.notes.length; i++) {
        const notePlan = plan.notes[i];
        const noteKey = noteKeys[i];
        await tx.deliveryNote.create({
          data: {
            yearMonth: noteKey.yearMonth,
            seq: noteKey.seq,
            status: "ISSUED",
            deliveryOrderYearMonth: key.yearMonth,
            deliveryOrderSeq: key.seq,
            deliveryMethod: plan.deliveryMethod,
            recipientBpId: notePlan.recipientBpId,
            recipientBranchBpId: notePlan.recipientBranchBpId,
            endUserBpId: notePlan.endUserBpId,
            salesRepId: plan.salesRepId,
            includePrice: notePlan.includePrice,
            createdBy: authz.userId,
            items: {
              create: plan.items.map((it, idx) => ({
                itemId: it.itemId,
                quantity: it.quantity,
                unitPrice: notePlan.includePrice ? it.unitPrice : null,
                amount: notePlan.includePrice
                  ? it.unitPrice * it.quantity
                  : null,
                // 価格を載せない納品書は税も出さないので、区分・率も持たせない。
                taxCategoryId: notePlan.includePrice ? it.taxCategoryId : null,
                taxRate: notePlan.includePrice ? it.taxRate : null,
                sortOrder: idx,
              })),
            },
          },
        });
        deliveryNoteNumbers.push(formatDocNumber("DRN", noteKey));
      }
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "delivery_orders",
      recordId: number,
      before: { status: "DRAFT" },
      after: { status: "CONFIRMED", deliveryNoteNumbers },
    });
    for (const n of deliveryNoteNumbers) {
      await recordAudit({
        action: "CREATE",
        tableName: "delivery_notes",
        recordId: n,
        after: {
          status: "ISSUED",
          note: tr("shipping.deliveryOrderActions.autoCreatedNote"),
        },
      });
    }
    revalidate(number);
    return actionOk();
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("GUARD:")) {
      return actionError(e.message.slice("GUARD:".length));
    }
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
export async function shipDeliveryOrder(
  number: string,
): Promise<ActionResult<{ warnings: string[] }>> {
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
        customerBpId: true,
        closesOrderLines: true,
        items: { select: { orderLineId: true, quantity: true } },
      },
    });
    if (!row) return actionError(tr("shipping.deliveryOrderActions.notFound"));

    // 過不足が許されている注文明細（累計が受注数を超えてよい行）を先に洗い出す。
    // 出荷の tx の中では明細ごとに「超えていないか」を数え直すが、その閾値が
    // 行ごとに違うので、どの行が許されているかだけ tx の外で引いておく。
    const variancePermittedLines = new Set(
      row.type === "DISPATCH"
        ? (
            await evaluateDeliveryOrderVariance({
              customerBpId: row.customerBpId,
              items: row.items,
              closesOrderLines: row.closesOrderLines,
              excludeKey: key,
            })
          ).lines
            .filter((l) => l.variancePermitted)
            .map((l) => l.orderLineId)
        : [],
    );

    // 注文明細ステータス変更の監査用（トランザクション後に記録）。
    // 1 出荷書が複数の注文明細を束ねるため、行ごとに 1 件ずつ積む。
    const lineAudits: {
      number: string;
      before: string;
      after: string;
    }[] = [];

    // 入出庫伝票の番号は tx の外で採番する（この関数のすぐ上、confirmDeliveryOrder
    // が納品書番号でやっているのと同じ作法）。**1 出荷 = 伝票 1 枚** で、出庫・
    // 在庫保管の入庫・予約の按分解除が全部その明細になる。
    const movementKey = await allocateDocumentKey("INVENTORY_MOVEMENT");

    /** 台帳が足りないまま出た分（在庫反映が返す）。 */
    let shortages: Awaited<
      ReturnType<typeof import("@/lib/inventory").onDeliveryOrderShippedTx>
    > = [];

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
      // ロックは**必ず同じ順**（id 昇順）で取る — A,B と B,A の 2 枚を同時に
      // 出荷するとデッドロックで片方が落ちる。
      const lineIds = [
        ...new Set(
          row.items
            .map((it) => it.orderLineId)
            .filter((id): id is string => Boolean(id)),
        ),
      ].sort();
      for (const lineId of lineIds) {
        // 注文明細の行をロック（FOR UPDATE）— 同じ明細を載せた出荷書を同時に
        // 出荷したとき、両方が「まだ残っている」と読んで過出荷になるのを防ぐ
        // （lib/inventory.ts reserveProductStock と同じ流儀）。ロック取得後に
        // 読む累計が確定値になる。
        await tx.$queryRaw`
          SELECT id FROM app.order_lines
          WHERE id = ${lineId}::uuid
          FOR UPDATE`;
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
        // 確定前・キャンセル済みの明細は出荷できない。ここで黙って飛ばすと
        // ガードを素通りしたまま在庫の出庫と shippedAt だけが進んでしまう。
        if (!line || line.branch == null) {
          throw new Error(
            `GUARD:${tr("shipping.deliveryOrderActions.specifyAConfirmedOrderLine")}`,
          );
        }
        if (!isLineShippable(line)) {
          throw new Error(
            `GUARD:${tr("shipping.deliveryOrderActions.orderLineNotShippable", {
              number: formatOrderLineNumber({
                yearMonth: line.acceptanceYearMonth,
                seq: line.acceptanceSeq,
                branch: line.branch,
              }),
            })}`,
          );
        }

        const agg = await tx.deliveryOrderItem.aggregate({
          _sum: { quantity: true },
          where: {
            orderLineId: lineId,
            deliveryOrder: { type: "DISPATCH", status: "SHIPPED" },
          },
        });
        const shipped = agg._sum?.quantity ?? 0;
        const lineNumber = formatOrderLineNumber({
          yearMonth: line.acceptanceYearMonth,
          seq: line.acceptanceSeq,
          branch: line.branch,
        });
        // 累計出荷が受注数量を超える出荷を禁止（監査 P0-4 過出荷ガード）。
        // 指示書が過不足納品を許しているロットだけがこの線を越えられる。
        if (shipped > line.quantity && !variancePermittedLines.has(lineId)) {
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
        // 不足で締めるかどうかは出荷書の宣言が決める（一部出荷と数量では
        // 見分けが付かない）。判定は lib/delivery-variance-core.ts に 1 本化。
        const next = deliveredLineStatus(
          line.quantity,
          shipped,
          row.closesOrderLines,
        );
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
      // 保管入庫。**在庫が足りなくても止めない** — 足りない分はマイナスの
      // まま計上され、不足の一覧が返る（利用者には下で注意書きとして出す）。
      const { onDeliveryOrderShippedTx } = await import("@/lib/inventory");
      shortages = await onDeliveryOrderShippedTx(tx, key, movementKey);
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
    // 在庫が動いたので、在庫の画面も作り直す（マイナスのまま出た行がある）。
    revalidatePath("/inventory/stock");
    revalidatePath("/inventory/movements");
    return actionOk({
      warnings: shortages.map((s) =>
        s.lotNumber == null
          ? tr("shipping.deliveryOrderActions.shippedWithoutStockNoLot", {
              item: s.item,
              shortfall: s.shortfall,
            })
          : tr("shipping.deliveryOrderActions.shippedWithoutStock", {
              item: s.item,
              lot: s.lotNumber,
              shortfall: s.shortfall,
            }),
      ),
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("GUARD:")) {
      return actionError(e.message.slice("GUARD:".length));
    }
    // 在庫ガード（lib/inventory）の業務エラーはそのまま表示する。
    // lib/inventory.ts は message に構造化ノート（鍵+パラメータ、
    // lib/inventory-note-core.ts）を積むので、ここで自分の言語に翻訳する
    // （日本語の部分文字列一致には依存しない）。
    if (e instanceof Error) {
      const decoded = decodeInventoryNote(e.message);
      if (decoded) {
        return actionError(
          tr(`inventoryNote.${decoded.key}`, decoded.params ?? {}),
        );
      }
    }
    return actionError(
      prismaErrorMessage(e, tr("shipping.deliveryOrderActions.shipFailed"), tr),
    );
  }
}

/** 確認ダイアログに出す 1 行（不足している品目）。 */
export interface DeliveryStockShortage {
  /** 在庫・所要量 (ST03) へ飛ぶための品目 id。 */
  itemId: number;
  /** 品目コード（PRD-… / 素材コード）。 */
  item: string;
  lotNumber: number | null;
  /** 足りない本数（このまま出すと、この分だけ在庫がマイナスになる）。 */
  shortfall: number;
}

/**
 * 出荷する前に、足りない在庫を数える（**何も書き込まない**）。
 *
 * 出荷そのものは在庫で止まらない（#907）。ただし黙って進めると、台帳が
 * マイナスになったことに誰も気づかないまま終わる — なので押す前に一度だけ
 * 「何が何本足りないか」を見せ、進むかどうかを人に決めてもらう。
 *
 * 数え方は出荷本体と**同じ関数**（planDispatchLines）を通る。別々に書くと
 * 「確認では足りていたのに出したらマイナスになった」が起こり得る。
 */
export async function checkDeliveryStock(
  number: string,
): Promise<ActionResult<{ shortages: DeliveryStockShortage[] }>> {
  const tr = await getTranslations();
  // 出荷と同じ権限で見る（出荷できない人に在庫の不足だけ見せる意味は無い）。
  const authz = await checkPermission("delivery_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "DOR");
  if (!key)
    return actionError(tr("shipping.deliveryOrderActions.invalidNumber"));
  if (!(await deliveryOrderInScope(authz.access, authz.userId, key))) {
    return actionError(tr("common.outOfScope"));
  }
  try {
    const { previewDeliveryShortagesTx } = await import("@/lib/inventory");
    const shortages = await prisma.$transaction((tx) =>
      previewDeliveryShortagesTx(tx, key),
    );
    return actionOk({ shortages });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("shipping.deliveryOrderActions.stockCheckFailed"),
        tr,
      ),
    );
  }
}

/**
 * 出荷後の返品を記録する（§8 追補）。
 *
 * 出した物が返ってくる経路がこれまで 1 本も無く、受け取っても在庫は減った
 * ままだった。数を合わせるには棚卸で「増えた理由の分からない差異」として
 * 足すしかなく、それは返品の記録ではない。
 *
 * **出荷書の状態は動かさない。** 出したという事実は返品では消えない。
 * 在庫だけを戻し（逆仕訳の伝票 1 枚・事由 SALES_RETURN）、何本戻ったかは
 * 出荷明細の行に足す。**請求は動かさない** — 返品を請求にどう反映するかは
 * 締めの運用で決まる別の判断で、在庫の記録と混ぜない。
 */
export async function recordDeliveryReturn(input: {
  number: string;
  lines: { itemRowId: string; quantity: number }[];
  notes?: string | null;
}): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("delivery_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(input.number, "DOR");
  if (!key)
    return actionError(tr("shipping.deliveryOrderActions.invalidNumber"));
  if (!(await deliveryOrderInScope(authz.access, authz.userId, key))) {
    return actionError(tr("common.outOfScope"));
  }

  const requested = input.lines.filter((l) => l.quantity > 0);
  if (requested.length === 0) {
    return actionError(tr("shipping.deliveryOrderActions.returnNoQuantity"));
  }

  try {
    const order = await prisma.deliveryOrder.findUnique({
      where: { yearMonth_seq: key },
      select: {
        status: true,
        type: true,
        fromPlantId: true,
        customerBpId: true,
        items: {
          select: {
            id: true,
            itemId: true,
            lotNumber: true,
            quantity: true,
            returnedQuantity: true,
            orderLine: { select: { orderType: true } },
          },
        },
      },
    });
    if (!order)
      return actionError(tr("shipping.deliveryOrderActions.notFound"));
    // 出荷していないものは返ってこない。
    if (order.status !== "SHIPPED" || order.type !== "DISPATCH") {
      return actionError(tr("shipping.deliveryOrderActions.returnNotShipped"));
    }

    const byId = new Map(order.items.map((it) => [it.id, it]));
    const lines: {
      itemId: number;
      lotNumber: number | null;
      quantity: number;
      ownerBpId: string | null;
    }[] = [];
    for (const line of requested) {
      const item = byId.get(line.itemRowId);
      if (!item) {
        return actionError(tr("common.targetRecordNotFound"));
      }
      // 出した数より多くは戻せない（DB の CHECK も同じことを言う）。
      if (line.quantity > item.quantity - item.returnedQuantity) {
        return actionError(
          tr("shipping.deliveryOrderActions.returnExceedsShipped"),
        );
      }
      lines.push({
        itemId: item.itemId,
        lotNumber: item.lotNumber,
        quantity: line.quantity,
        // 再研磨の明細の返品は顧客の預り品バケットへ戻る（自社在庫には入れない）。
        ownerBpId: ownerBucketFor(
          item.orderLine?.orderType,
          order.customerBpId,
        ),
      });
    }

    // 採番はトランザクションの外（全書類共通の作法）。
    const movementKey = await allocateDocumentKey("INVENTORY_MOVEMENT");
    await prisma.$transaction(async (tx) => {
      for (const line of requested) {
        await tx.deliveryOrderItem.update({
          where: { id: line.itemRowId },
          data: { returnedQuantity: { increment: line.quantity } },
        });
      }
      const { onDeliveryOrderReturnedTx } = await import("@/lib/inventory");
      await onDeliveryOrderReturnedTx(tx, key, movementKey, {
        lines,
        plantId: order.fromPlantId,
      });
    });

    await recordAudit({
      action: "UPDATE",
      tableName: "delivery_orders",
      recordId: input.number,
      after: {
        note: tr("shipping.deliveryOrderActions.auditReturnRecorded", {
          quantity: lines.reduce((sum, l) => sum + l.quantity, 0),
        }),
        notes: input.notes ?? null,
      },
    });
    revalidate(input.number);
    revalidatePath("/inventory/stock");
    revalidatePath("/inventory/movements");
    return actionOk();
  } catch (e) {
    if (e instanceof Error) {
      const decoded = decodeInventoryNote(e.message);
      if (decoded) {
        return actionError(
          tr(`inventoryNote.${decoded.key}`, decoded.params ?? {}),
        );
      }
    }
    return actionError(
      prismaErrorMessage(
        e,
        tr("shipping.deliveryOrderActions.returnFailed"),
        tr,
      ),
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
