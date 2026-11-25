/**
 * data.ts — 在庫管理の「仕掛品」タブ（在庫に置いた仕掛品）のサーバーサイド取得。
 *
 * 読むのは app.item_inventory のうち**加工状態を持つ行**（wip_state_id IS NOT NULL
 * = 半製品。それ以外の印は無い）。行スコープは
 * 製品・素材の一覧と同じ（保管拠点 = plantWhere）。
 *
 * 製品ごとの「使える仕掛品 n 本」もここで数える — 規則は lib/wip-state-core.ts
 * `matchWip`（ちょうど / 長い / 太い）で、ここは材料を揃えて呼ぶだけ。
 */

import { plantWhere } from "@ckk/authz-core";
import type {
  UsableWipForProduct,
  WipStockData,
  WipStockRow,
} from "@/components/inventory/wip/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { matchWip, type WipBucket } from "@/lib/wip-state-core";
import {
  isUnclassifiedWip,
  usableWipSummary,
  wipAgeDays,
} from "@/lib/wip-stock-core";
import { splitStepIdsByKind } from "@/lib/workflow-core";

const num = (v: Prisma.Decimal | null | undefined): number | null =>
  v == null ? null : Number(v);

const name = (v: unknown): string => localized(v as LocalizedText | null);

function materialTypeLabel(
  mt: { code: string | null; name: unknown } | null | undefined,
): string | null {
  if (!mt) return null;
  const label = name(mt.name);
  return mt.code ? `${mt.code} — ${label}` : label;
}

const WIP_INCLUDE = {
  item: { include: { materialType: true, requiresMaterialType: true } },
  aimedItem: { include: { requiresMaterialType: true } },
  plant: true,
  storageLocation: true,
  shelf: true,
  wipState: true,
} satisfies Prisma.ItemInventoryInclude;

/** 「分類する」が取引に付ける referenceType（wip/actions.ts と同じ値）。 */
const RECLASSIFY_REFERENCE_TYPE = "wip_reclassify";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY: WipStockData = {
  rows: [],
  usableByProduct: {},
  stepOptions: [],
  canAdjust: false,
};

/**
 * 仕掛品 一覧 + 製品ごとの「使える仕掛品」。
 *
 * `productItemIds` = 製品タブに並ぶ製品（items.id）。その製品についてだけ
 * 突合する（全製品を回すと、在庫を見に来ただけの画面が製品マスタの大きさで
 * 重くなる）。
 */
export async function fetchWipStock(
  productItemIds: readonly number[],
): Promise<WipStockData> {
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return EMPTY;
  const canAdjust = (await checkPermission("inventory", "UPDATE")).ok;

  const [dbRows, catalog] = await Promise.all([
    prisma.itemInventory.findMany({
      where: {
        AND: [
          plantWhere(authz.access, "plantId") as Prisma.ItemInventoryWhereInput,
          {
            // 仕掛品 = 加工状態を持つ行。
            wipStateId: { not: null },
            // 自社の在庫だけ（外注へ預けている分は手持ちではない。預り品は
            // 仕掛品になれない — CHECK item_inventory_wip_not_owned）。
            custodyBpId: null,
            ownerBpId: null,
            // 空のバケットは出さない（分類し終えた未分類の行が 0 本で残る）。
            // 引当だけ残っている行は追えなくなるので出す。
            OR: [{ quantity: { not: 0 } }, { reservedQuantity: { not: 0 } }],
          },
        ],
      },
      include: WIP_INCLUDE,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.processStepCatalog.findMany({
      select: {
        id: true,
        name: true,
        isActive: true,
        affectsWipState: true,
        category: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
  ]);

  const stepName = new Map(catalog.map((c) => [c.id, name(c.name)]));
  const affects = new Set(
    catalog.filter((c) => c.affectsWipState).map((c) => c.id),
  );

  // 発生工程（指示書 #N / 工程名）と、在庫に入った時刻の材料。
  const sourceStepIds = [
    ...new Set(
      dbRows.map((r) => r.sourceStepId).filter((v): v is string => v != null),
    ),
  ];
  const ids = dbRows.map((r) => r.id);
  // 分類（未分類 → 仕掛ブランク）の入庫は「その時に在庫に入った」わけではない —
  // 名乗りを直しただけなので、入った時刻は分類元の行から引き継ぐ。
  const NOT_RECLASSIFY = {
    OR: [
      { referenceType: null },
      { referenceType: { not: RECLASSIFY_REFERENCE_TYPE } },
    ],
  } satisfies Prisma.InventoryTransactionWhereInput;
  const [sourceSteps, firstIns, reclassifyIns] = await Promise.all([
    sourceStepIds.length > 0
      ? prisma.workOrderStep.findMany({
          where: { id: { in: sourceStepIds } },
          select: {
            id: true,
            completedAt: true,
            processStep: { select: { name: true } },
            workOrder: { select: { workOrderNumber: true } },
          },
        })
      : [],
    ids.length > 0
      ? prisma.inventoryTransaction.groupBy({
          by: ["inventoryId"],
          where: {
            inventoryId: { in: ids },
            transactionType: "IN",
            ...NOT_RECLASSIFY,
          },
          _min: { createdAt: true },
        })
      : [],
    ids.length > 0
      ? prisma.inventoryTransaction.findMany({
          where: {
            inventoryId: { in: ids },
            transactionType: "IN",
            referenceType: RECLASSIFY_REFERENCE_TYPE,
          },
          select: { inventoryId: true, referenceId: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);
  const sourceOf = new Map(sourceSteps.map((s) => [s.id, s]));
  const firstInOf = new Map(
    firstIns.map((t) => [t.inventoryId, t._min.createdAt]),
  );
  // 分類元（referenceId = 分類元の在庫行）の最初の入庫。分類元はいまの一覧に
  // 無いこともある（全部分類し終えて 0 本）ので、別に引く。
  const reclassifiedFrom = [
    ...new Set(
      reclassifyIns
        .map((t) => t.referenceId)
        .filter((v): v is string => v != null && UUID_RE.test(v)),
    ),
  ];
  const originIns =
    reclassifiedFrom.length > 0
      ? await prisma.inventoryTransaction.groupBy({
          by: ["inventoryId"],
          where: {
            inventoryId: { in: reclassifiedFrom },
            transactionType: "IN",
            ...NOT_RECLASSIFY,
          },
          _min: { createdAt: true },
        })
      : [];
  const originInOf = new Map(
    originIns.map((t) => [t.inventoryId, t._min.createdAt]),
  );
  /** 分類で入った行の時刻: 分類元の最初の入庫（無ければ分類した時刻）。 */
  const reclassifiedAtOf = new Map<string, Date>();
  for (const t of reclassifyIns) {
    const at = (t.referenceId && originInOf.get(t.referenceId)) || t.createdAt;
    const prev = reclassifiedAtOf.get(t.inventoryId);
    if (!prev || at < prev) reclassifiedAtOf.set(t.inventoryId, at);
  }

  const now = Date.now();
  const rows: WipStockRow[] = dbRows.map((r) => {
    // wipState は where で not null にしてある。
    const state = r.wipState as NonNullable<typeof r.wipState>;
    const source = r.sourceStepId ? sourceOf.get(r.sourceStepId) : undefined;
    const quantity = Number(r.quantity);
    const reservedQuantity = Number(r.reservedQuantity);
    const isBlank = r.item.itemType === "BLANK";
    const materialTypeId = isBlank ? r.item.materialTypeId : null;
    const diameterMm = isBlank ? num(r.item.diameterMm) : null;
    const lengthMm = isBlank ? num(r.item.lengthMm) : null;
    // 目標製品。未分類の行は品目が製品のままなので、それが目標製品。
    const aimed =
      r.aimedItem ?? (r.item.itemType === "PRODUCT" ? r.item : null);
    // 在庫に入った時刻: 発生工程の完了（品物ができた時）→ 最初の入庫 →
    // 分類元から引き継いだ時刻 → 更新日。
    const receivedAt =
      source?.completedAt ??
      firstInOf.get(r.id) ??
      reclassifiedAtOf.get(r.id) ??
      r.updatedAt;
    const unclassified = isUnclassifiedWip({
      isLegacy: state.isLegacy,
      materialTypeId,
      diameterMm,
      lengthMm,
    });
    const stateNameJson =
      state.name && typeof state.name === "object"
        ? (state.name as Record<string, string>)
        : null;
    return {
      id: r.id,
      itemId: r.itemId,
      itemCode: r.item.code,
      itemName: name(r.item.name),
      materialTypeId,
      materialTypeLabel: isBlank
        ? materialTypeLabel(r.item.materialType)
        : null,
      diameterMm,
      lengthMm,
      wipStateId: state.id,
      stateName: stateNameJson ? name(stateNameJson) || null : null,
      stateNameJson,
      stepIds: state.stepIds,
      stepNames: state.stepIds.map((id) => stepName.get(id) ?? `#${id}`),
      isLegacy: state.isLegacy,
      finishedDiameterMm: num(r.finishedDiameterMm),
      finishedLengthMm: num(r.finishedLengthMm),
      quantity,
      reservedQuantity,
      available: quantity - reservedQuantity,
      unit: r.unit,
      plantId: r.plantId,
      plantName: r.plant ? name(r.plant.name) : null,
      storageLocationId: r.storageLocationId,
      storageLocationName: r.storageLocation
        ? name(r.storageLocation.name)
        : null,
      shelfId: r.shelfId,
      shelfCode: r.shelf?.code ?? null,
      lotNumber: r.lotNumber,
      aimedItemId: aimed?.id ?? null,
      aimedProductName: aimed ? name(aimed.name) : null,
      aimedProductCode: aimed?.code ?? null,
      sourceWorkOrderNumber: source?.workOrder.workOrderNumber ?? null,
      sourceStepName: source ? name(source.processStep.name) : null,
      receivedAt: receivedAt.toISOString(),
      ageDays: wipAgeDays(receivedAt, now),
      suggestion: unclassified
        ? {
            materialTypeId: aimed?.requiresMaterialTypeId ?? null,
            materialTypeLabel: materialTypeLabel(aimed?.requiresMaterialType),
            diameterMm: num(aimed?.requiresDiameterMm),
            lengthMm: num(aimed?.requiresLengthMm),
          }
        : null,
    };
  });

  const usableByProduct = await usableWipByProduct(
    productItemIds,
    rows,
    affects,
    catalog,
  );

  return {
    rows,
    usableByProduct,
    stepOptions: catalog
      .filter((c) => c.isActive && c.affectsWipState)
      .map((c) => ({ id: c.id, name: name(c.name) })),
    canAdjust,
  };
}

/**
 * 製品ごとの「使える仕掛品」。
 *
 * 製品の工程の並びは **準備工程リスト（共通）+ 製造工程リスト（汎用を優先）の
 * 最新版**から作る — 指示書を起こす前なので、指示書の工程はまだ無い。
 * 受注元専用のリストしか無い製品は、その先頭のリストを使う。工程リストが
 * 1 本も無い製品は並びが空になり、未加工のブランクだけが数に入る
 * （加工済みの品を「使える」と言い切る根拠が無い）。
 */
async function usableWipByProduct(
  productItemIds: readonly number[],
  rows: readonly WipStockRow[],
  affects: ReadonlySet<number>,
  catalog: readonly { id: number; category: string }[],
): Promise<Record<number, UsableWipForProduct>> {
  const buckets: WipBucket[] = rows
    .filter((r) => !isUnclassifiedWip(r))
    .map((r) => ({
      inventoryId: r.id,
      materialTypeId: r.materialTypeId,
      diameterMm: r.diameterMm,
      lengthMm: r.lengthMm,
      stepIds: r.stepIds,
      finishedDiameterMm: r.finishedDiameterMm,
      finishedLengthMm: r.finishedLengthMm,
      aimedItemId: r.aimedItemId,
      available: r.available,
      receivedAt: r.receivedAt,
      lotNumber: r.lotNumber,
    }));
  const ids = [...new Set(productItemIds)];
  if (buckets.length === 0 || ids.length === 0) return {};

  const latestSteps = {
    orderBy: { version: "desc" as const },
    take: 1,
    select: {
      steps: {
        orderBy: { sortOrder: "asc" as const },
        select: { processStepId: true },
      },
    },
  };
  const [products, routes, prepRoutes] = await Promise.all([
    prisma.item.findMany({
      where: {
        id: { in: ids },
        itemType: "PRODUCT",
        requiresMaterialTypeId: { not: null },
      },
      select: {
        id: true,
        code: true,
        name: true,
        requiresMaterialTypeId: true,
        requiresDiameterMm: true,
        requiresLengthMm: true,
      },
    }),
    prisma.productProcessRoute.findMany({
      where: { itemId: { in: ids }, kind: "MANUFACTURING", isActive: true },
      select: {
        itemId: true,
        customerBpId: true,
        versions: latestSteps,
      },
      orderBy: { id: "asc" },
    }),
    prisma.productProcessRoute.findMany({
      where: { kind: "PREP", isActive: true },
      select: { versions: latestSteps },
      orderBy: { id: "asc" },
    }),
  ]);

  const stepsOf = (r: { versions: { steps: { processStepId: number }[] }[] }) =>
    (r.versions[0]?.steps ?? []).map((s) => s.processStepId);
  // 準備工程リストは共通。有効なものが複数あるときは先頭を使う（指示書では人が
  // 選ぶが、ここは目安の数なので 1 本に決める）。
  const prepRoute = prepRoutes[0] ? stepsOf(prepRoutes[0]) : null;
  const routeOf = new Map<number, number[]>();
  for (const r of routes) {
    if (r.itemId == null) continue;
    // 汎用（受注元なし）を優先。無ければ最初に見つかったもの。
    if (!routeOf.has(r.itemId) || r.customerBpId == null) {
      routeOf.set(r.itemId, stepsOf(r));
    }
  }
  /**
   * 製品の工程の並び = 準備工程リストの準備工程 + 製造工程リストの製造工程。
   * 古い版の製造工程リストには準備工程が混ざっている（種別を分ける前の版は
   * 履歴として残してある）ので、指示書と同じく**種別で分けてから**合わせる —
   * そのまま繋ぐと同じ工程が 2 回並び、どの仕掛品も先頭部分にならなくなる。
   * 準備工程リストが 1 本も無い環境では、製造工程リストをそのまま使う。
   */
  const routeFor = (itemId: number): number[] => {
    const own = routeOf.get(itemId) ?? [];
    if (prepRoute == null) return own;
    return [
      ...splitStepIdsByKind(prepRoute, catalog).prep,
      ...splitStepIdsByKind(own, catalog).manufacturing,
    ];
  };

  const out: Record<number, UsableWipForProduct> = {};
  for (const p of products) {
    const route = routeFor(p.id).filter((id) => affects.has(id));
    const summary = usableWipSummary(
      matchWip(
        {
          itemId: p.id,
          materialTypeId: p.requiresMaterialTypeId,
          diameterMm: num(p.requiresDiameterMm),
          lengthMm: num(p.requiresLengthMm),
        },
        route,
        buckets,
      ),
    );
    if (summary.quantity > 0) {
      const label = name(p.name);
      out[p.id] = {
        itemId: p.id,
        label: p.code ? `${label}（${p.code}）` : label,
        ...summary,
      };
    }
  }
  return out;
}
