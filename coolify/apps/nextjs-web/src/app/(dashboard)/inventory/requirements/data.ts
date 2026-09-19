/**
 * data.ts — 在庫・所要量 (ST03) のサーバーサイド取得。
 *
 * ST03 は「品目 1 つ × 拠点 1 つ」の画面。app.item_inventory（統合在庫）で
 * バケットを引き、そのバケット id で app.inventory_transactions（過去）と
 * app.inventory_reservations（未来の需要 — 素材）を引く。素材・製品どちらでも
 * 分岐しないのは item_inventory がすでに統合されているため。
 *
 * ただし item_inventory 以外（素材発注明細・指示書・注文明細・引当）は
 * まだ移行前の個別マスタの id（Material.id / Product.id）を持つので、
 * app.items.id → その品目の旧 id を 1 回引いてから使う（items.prisma の
 * material.itemId / product.itemId — 逆向きのユニーク列）。
 */

import { rowInScope } from "@ckk/authz-core";
import { getLocale } from "next-intl/server";
import type {
  ItemSummary,
  PlantSummary,
  StockRequirementRowView,
  StockRequirementsView,
} from "@/components/inventory/requirements/model";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  formatDocNumber,
  formatMovementNumber,
  orderLineNumberOf,
} from "@/lib/doc-number";
import { itemTypeLabel } from "@/lib/enum-labels";
import { type LocalizedText, localized } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { RecentOption } from "@/lib/recents";
import {
  buildStockRequirementsTimeline,
  type FutureElementInput,
  type PastMovementInput,
  type PastTransactionType,
} from "@/lib/stock-requirements-core";

export type { Option } from "../../production/work-orders/data";
export { fetchPlantOptions } from "../../production/work-orders/data";

/**
 * URL に既に `item=<id>` が入っている場合（共有リンク・戻る）に
 * ItemPicker（SearchSelect）の初期表示ラベルを埋めるための単発参照。
 * `actions.ts` の `searchItemOptions()` と同じラベル組み立て。
 */
export async function fetchItemOption(
  itemId: number,
): Promise<RecentOption | null> {
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return null;
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item) return null;
  const locale = (await getLocale()) as Locale;
  return {
    value: String(item.id),
    label: `${item.code ?? "—"} ${localized(item.name as LocalizedText | null)}（${itemTypeLabel(item.itemType, locale)}）`,
  };
}

// 過去の実績行の取得上限。伝票と違い「1 品目 × 1 拠点」に絞った履歴なので
// movements 一覧（1000）より小さくてよい — が、動きの多い定番素材だと
// これも超えうるので truncated を返して黙って切らない。
const PAST_FETCH_CAP = 300;

function itemSummaryOf(item: {
  id: number;
  itemType: string;
  code: string | null;
  name: unknown;
  unit: string;
}): ItemSummary {
  return {
    id: item.id,
    itemType: item.itemType as "PRODUCT" | "MATERIAL",
    code: item.code,
    name: localized(item.name as LocalizedText | null),
    unit: item.unit,
  };
}

function plantSummaryOf(plant: { code: string; name: unknown }): string {
  return `${plant.code} ${localized(plant.name as LocalizedText | null)}`;
}

/** ADJUST は符号付きでそのまま、他は正の数（inventory.ts applyTransaction と同じ規約）。 */
function isKnownTransactionType(t: string): t is PastTransactionType {
  return (
    t === "IN" ||
    t === "OUT" ||
    t === "RESERVE" ||
    t === "RELEASE" ||
    t === "ADJUST"
  );
}

/** WO の期待日 = 割り当てられた注文明細の納期のうち最も早いもの。割当が無ければ null（在庫向けの独立指示書など）。 */
function earliestDeliveryDate(
  links: readonly { orderLine: { deliveryDate: Date | null } }[],
): string | null {
  const dates = links
    .map((l) => l.orderLine.deliveryDate)
    .filter((d): d is Date => d != null)
    .map((d) => d.toISOString().slice(0, 10))
    .sort();
  return dates[0] ?? null;
}

/**
 * 在庫・所要量 (ST03) 本体。item/plant が不正・権限外なら null。
 *
 * `permission: inventory:READ` が前提。plant は行スコープ（拠点）で検査する
 * — 権限外の拠点を URL で直打ちしても中身は返さない（movements/data.ts と同じ
 * 規約）。
 */
export async function fetchStockRequirements(
  itemId: number,
  plantId: number,
): Promise<StockRequirementsView | null> {
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return null;
  if (!rowInScope(authz.access, { plantIds: [plantId] }, authz.userId)) {
    return null;
  }

  const [item, plant] = await Promise.all([
    prisma.item.findUnique({ where: { id: itemId } }),
    prisma.plant.findUnique({ where: { id: plantId } }),
  ]);
  if (!item || !plant) return null;

  // item_inventory はまだ「鏡」段階 — 書き込みの持ち主は旧2表のまま、ここは
  // 読み取り専用の統合ビューとして使う（root CLAUDE.md 参照は無いが
  // shared-db/prisma/schema/inventory.prisma のコメントに同旨あり）。
  const buckets = await prisma.itemInventory.findMany({
    where: { itemId, plantId },
  });
  const bucketIds = buckets.map((b) => b.id);
  const onHand = buckets.reduce((s, b) => s + Number(b.quantity), 0);
  const reserved = buckets.reduce((s, b) => s + Number(b.reservedQuantity), 0);

  // ── 過去（inventory_transactions） ──────────────────────────────────
  const txRows =
    bucketIds.length === 0
      ? []
      : await prisma.inventoryTransaction.findMany({
          where: {
            inventoryType: item.itemType,
            inventoryId: { in: bucketIds },
          },
          orderBy: { createdAt: "asc" },
          take: PAST_FETCH_CAP + 1,
          include: { movement: { select: { yearMonth: true, seq: true } } },
        });
  const truncated = txRows.length > PAST_FETCH_CAP;
  const pastMovements: PastMovementInput[] = txRows
    .slice(0, PAST_FETCH_CAP)
    .map((t) => {
      const movNumber = t.movement ? formatMovementNumber(t.movement) : null;
      return {
        occurredAt: t.createdAt.toISOString(),
        transactionType: isKnownTransactionType(t.transactionType)
          ? t.transactionType
          : "ADJUST",
        quantity: Number(t.quantity),
        ref: movNumber,
        refHref: movNumber ? `/inventory/movements/${movNumber}` : null,
        note: t.notes,
      };
    });

  // ── 未来（供給・需要） ──────────────────────────────────────────────
  const futureElements: FutureElementInput[] = [];

  if (item.itemType === "MATERIAL") {
    const material = await prisma.material.findUnique({
      where: { itemId: item.id },
    });
    if (material) {
      // 供給: 発注済み（ORDERED）明細の未入荷残（atp.ts materialAtp と同じ考え方）。
      const poItems = await prisma.materialPurchaseOrderItem.findMany({
        where: {
          materialId: material.id,
          plantId,
          purchaseOrder: { status: "ORDERED" },
        },
        include: { purchaseOrder: { select: { poNumber: true } } },
      });
      for (const it of poItems) {
        const remaining = Number(it.quantity) - Number(it.receivedQuantity);
        if (!(remaining > 0)) continue;
        futureElements.push({
          kind: "supply",
          date: it.expectedAt ? it.expectedAt.toISOString().slice(0, 10) : null,
          quantity: remaining,
          ref: it.purchaseOrder.poNumber,
          refHref: `/purchase/purchase-orders/${it.purchaseOrder.poNumber}`,
        });
      }

      // 需要: 指示書に紐づく引当中（RESERVED）の予約。バケットはすでに
      // 品目×拠点で絞ってあるので、その bucketIds に紐づく予約だけでよい。
      if (bucketIds.length > 0) {
        const reservations = await prisma.inventoryReservation.findMany({
          where: {
            inventoryType: "MATERIAL",
            inventoryId: { in: bucketIds },
            status: "RESERVED",
            workOrderId: { not: null },
          },
          include: {
            workOrder: {
              select: {
                workOrderNumber: true,
                yearMonth: true,
                seq: true,
                orderLineLinks: {
                  select: { orderLine: { select: { deliveryDate: true } } },
                },
              },
            },
          },
        });
        for (const r of reservations) {
          if (!r.workOrder) continue;
          const docNumber = formatDocNumber("WOR", r.workOrder);
          futureElements.push({
            kind: "demand",
            date: earliestDeliveryDate(r.workOrder.orderLineLinks),
            quantity: Number(r.quantity),
            ref: docNumber,
            refHref: `/production/work-orders/${r.workOrder.workOrderNumber}`,
          });
        }
      }
    }
  } else {
    const product = await prisma.product.findUnique({
      where: { itemId: item.id },
    });
    if (product) {
      // 供給: 進行中の指示書（承認済み・製造中）の予定数量。
      // WorkOrder は拠点列を持たない — 完成品の保管場所（storageLocationId）が
      // 決まっていればその拠点で絞り、未定（多くの指示書はここが null のまま
      // 進む）なら拠点を問わず候補に残す（絞り込みすぎて見落とすより安全側）。
      const workOrders = await prisma.workOrder.findMany({
        where: {
          productId: product.id,
          status: { in: ["APPROVED", "IN_PROGRESS"] },
        },
        include: {
          storageLocation: { select: { plantId: true } },
          orderLineLinks: {
            select: { orderLine: { select: { deliveryDate: true } } },
          },
        },
      });
      for (const wo of workOrders) {
        if (wo.storageLocation && wo.storageLocation.plantId !== plantId)
          continue;
        futureElements.push({
          kind: "supply",
          date: earliestDeliveryDate(wo.orderLineLinks),
          quantity: wo.plannedQuantity,
          ref: formatDocNumber("WOR", wo),
          refHref: `/production/work-orders/${wo.workOrderNumber}`,
        });
      }

      // 需要: 確定済みでまだ出荷し切っていない注文明細。
      // 担当拠点（注文請書ヘッダの assignedPlantId）が決まっていればそれで
      // 絞り、未設定ならやはり拠点を問わず残す。
      // ⚠️ 簡略化: 一部出荷済み（PARTIAL_SHIPPED）の行も受注数量をそのまま
      // 需要として計上する（出荷済み分の控除はしていない）— 出荷書側の
      // 明細別出荷済み数量の集計が要るため今回は見送り、過大に安全側で見積もる。
      const orderLines = await prisma.orderLine.findMany({
        where: {
          // 品目統合 第 2 段 C — 注文明細は品目で絞る。指示書側
          // （work_orders）はまだ products.id なので、上の product は
          // そちらのためだけに残っている。
          itemId: item.id,
          status: { in: ["CONFIRMED", "IN_PRODUCTION", "PARTIAL_SHIPPED"] },
        },
        include: {
          acceptance: { select: { assignedPlantId: true } },
        },
      });
      for (const line of orderLines) {
        if (
          line.acceptance.assignedPlantId != null &&
          line.acceptance.assignedPlantId !== plantId
        ) {
          continue;
        }
        const ref = orderLineNumberOf(line);
        if (!ref) continue; // 未確定（branch 未採番）は需要として数えない
        futureElements.push({
          kind: "demand",
          date: line.deliveryDate
            ? line.deliveryDate.toISOString().slice(0, 10)
            : null,
          quantity: line.quantity,
          ref,
          refHref: `/sales/order-lines/${ref}`,
        });
      }
    }
    // 半製品（item_inventory の isSemiFinished バケット）はここでは
    // onHand/reserved の合計にそのまま含めている（分岐して除外していない）。
    // この画面には半製品が消費される OUT を明示的に立てる仕組みが無い
    // （§7 の分岐は半製品在庫を作るだけで、それを消費する側の取引が無い）ので、
    // 半製品分は「すでにある供給」として現在庫にだけ現れ、未来の需要側には
    // 何も対応しない — 意図的にモデル化していない（仕様どおり）。
  }

  const timeline = buildStockRequirementsTimeline({
    onHand,
    reserved,
    pastMovements,
    futureElements,
  });

  const rows: StockRequirementRowView[] = timeline.rows.map((r) => ({
    key: r.key,
    kind: r.kind,
    date: r.date,
    ref: r.ref,
    refHref: r.refHref,
    note: r.note,
    quantity: r.quantity,
    balance: r.balance,
  }));

  return {
    item: itemSummaryOf(item),
    plant: { id: plant.id, name: plantSummaryOf(plant) } satisfies PlantSummary,
    onHand: timeline.onHand,
    reserved: timeline.reserved,
    availableNow: timeline.availableNow,
    nextReceiptDate: timeline.nextReceiptDate,
    rows,
    firstNegativeKey: timeline.firstNegative?.key ?? null,
    truncated,
  };
}
