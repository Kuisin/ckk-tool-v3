import "server-only";

/**
 * doc-company.ts — 書類の発行元（自社法人）を作成時に決める。server-only.
 *
 * 規則そのもの（上流 → 拠点 → 既定）は lib/doc-company-core.ts が唯一の
 * 定義元で、ここは DB から候補を集めて渡すだけ。戻り値は Prisma の create
 * data にそのまま展開する形（`...await companyForXxx(...)`）。
 *
 * 入出庫伝票だけは nextjs-kiosk と twin の lib/inventory.ts が自前で引く
 * （twin は他のモジュールを import できない）。
 */

import { type Prisma, prisma } from "@/lib/db";
import {
  companyForDeliveryOrder,
  companyForDesignRequest,
  companyForOrderAcceptance,
  companyForPlantDoc,
  companyForPurchaseDoc,
  companyForUnplacedDoc,
  companyForWorkOrder,
  ownCompanyData,
} from "@/lib/doc-company-core";
import type { DocKey } from "@/lib/doc-number";

type Db = Prisma.TransactionClient | typeof prisma;

async function defaultId(db: Db): Promise<number | null> {
  const row = await db.ownCompany.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** 拠点 id の並び → 法人 id の並び（順序を保つ。拠点が無ければ null）。 */
async function plantCompanies(
  plantIds: readonly (number | null | undefined)[],
  db: Db,
): Promise<(number | null)[]> {
  const ids = [
    ...new Set(plantIds.filter((x): x is number => typeof x === "number")),
  ];
  if (ids.length === 0) return plantIds.map(() => null);
  const rows = await db.plant.findMany({
    where: { id: { in: ids } },
    select: { id: true, ownCompanyId: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r.ownCompanyId]));
  return plantIds.map((id) => (id == null ? null : (byId.get(id) ?? null)));
}

/** 見積書・価格試算・価格表・フォーム回答・社内文書。 */
export async function companyForUnplaced(db: Db = prisma) {
  return ownCompanyData(companyForUnplacedDoc(await defaultId(db)));
}

/** 注文請書。 */
export async function companyForAcceptance(
  input: {
    assignedPlantId?: number | null;
    linePlantIds?: readonly (number | null | undefined)[];
    quoteKey?: DocKey | null;
  },
  db: Db = prisma,
) {
  const [assigned, ...lines] = await plantCompanies(
    [input.assignedPlantId, ...(input.linePlantIds ?? [])],
    db,
  );
  const quote = input.quoteKey
    ? await db.quote.findUnique({
        where: { yearMonth_seq: input.quoteKey },
        select: { ownCompanyId: true },
      })
    : null;
  return ownCompanyData(
    companyForOrderAcceptance(
      {
        assignedPlantCompanyId: assigned,
        linePlantCompanyIds: lines,
        quoteCompanyId: quote?.ownCompanyId,
      },
      await defaultId(db),
    ),
  );
}

/** 設計依頼書。 */
export async function companyForDesign(
  input: { quoteKey?: DocKey | null; orderLineId?: string | null },
  db: Db = prisma,
) {
  const quote = input.quoteKey
    ? await db.quote.findUnique({
        where: { yearMonth_seq: input.quoteKey },
        select: { ownCompanyId: true },
      })
    : null;
  const line = input.orderLineId
    ? await db.orderLine.findUnique({
        where: { id: input.orderLineId },
        select: { acceptance: { select: { ownCompanyId: true } } },
      })
    : null;
  return ownCompanyData(
    companyForDesignRequest(
      {
        quoteCompanyId: quote?.ownCompanyId,
        orderAcceptanceCompanyId: line?.acceptance.ownCompanyId,
      },
      await defaultId(db),
    ),
  );
}

/** 指示書（割当の並び順に注文明細 id を渡す）。 */
export async function companyForWorkOrderDoc(
  input: { orderLineIds: readonly string[] },
  db: Db = prisma,
) {
  const rows = input.orderLineIds.length
    ? await db.orderLine.findMany({
        where: { id: { in: [...input.orderLineIds] } },
        select: { id: true, acceptance: { select: { ownCompanyId: true } } },
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r.acceptance.ownCompanyId]));
  return ownCompanyData(
    companyForWorkOrder(
      {
        orderAcceptanceCompanyIds: input.orderLineIds.map((id) => byId.get(id)),
      },
      await defaultId(db),
    ),
  );
}

/** 出荷書（明細の並び順に注文明細 id を渡す）。 */
export async function companyForDeliveryOrderDoc(
  input: {
    fromPlantId?: number | null;
    orderLineIds: readonly (string | null | undefined)[];
  },
  db: Db = prisma,
) {
  const lineIds = input.orderLineIds.filter(
    (x): x is string => typeof x === "string",
  );
  const lines = lineIds.length
    ? await db.orderLine.findMany({
        where: { id: { in: lineIds } },
        select: { id: true, assignedPlantId: true },
      })
    : [];
  const plantOf = new Map(lines.map((l) => [l.id, l.assignedPlantId]));
  const [from, ...linePlants] = await plantCompanies(
    [input.fromPlantId, ...lineIds.map((id) => plantOf.get(id))],
    db,
  );
  return ownCompanyData(
    companyForDeliveryOrder(
      { fromPlantCompanyId: from, linePlantCompanyIds: linePlants },
      await defaultId(db),
    ),
  );
}

/** 素材発注書・購買依頼（明細の並び順に拠点 id を渡す）。 */
export async function companyForPurchase(
  input: { linePlantIds: readonly (number | null | undefined)[] },
  db: Db = prisma,
) {
  return ownCompanyData(
    companyForPurchaseDoc(
      { linePlantCompanyIds: await plantCompanies(input.linePlantIds, db) },
      await defaultId(db),
    ),
  );
}

/** 棚卸（拠点）。入出庫伝票は lib/inventory.ts（twin）が同じ規則を持つ。 */
export async function companyForPlant(
  input: { plantId?: number | null },
  db: Db = prisma,
) {
  const [plant] = await plantCompanies([input.plantId], db);
  return ownCompanyData(
    companyForPlantDoc({ plantCompanyId: plant }, await defaultId(db)),
  );
}
