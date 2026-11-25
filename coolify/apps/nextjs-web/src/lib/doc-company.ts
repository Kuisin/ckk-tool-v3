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

import { sessionUserId } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import {
  companyForDeliveryOrder,
  companyForDesignRequest,
  companyForOrderAcceptance,
  companyForPlantDoc,
  companyForPurchaseDoc,
  companyForUnplacedDoc,
  companyForWorkOrder,
  issuingCompanyChoice,
  linesOutsideCompany,
  ownCompanyData,
  resolveIssuingCompanyId,
} from "@/lib/doc-company-core";
import type { DocCompanyViewer } from "@/lib/doc-company-view-core";
import type { DocKey } from "@/lib/doc-number";
import { type LocalizedTextInput, localized } from "@/lib/format";

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

/** 作成フォームへ渡す「発行会社」欄の材料（lib/doc-company-core.ts）。 */
export interface IssuingCompanyField {
  /** 欄を出すか（所属拠点が 2 つ以上の法人にまたがる人だけ）。 */
  selectable: boolean;
  /** 初期値（法人 id）。 */
  prefill: number | null;
  options: { value: string; label: string }[];
}

async function issuingChoiceFor(userId: string, db: Db) {
  const plants = await db.userPlant.findMany({
    where: { userId },
    orderBy: { plantId: "asc" },
    select: { plant: { select: { ownCompanyId: true } } },
  });
  return issuingCompanyChoice(
    plants.map((p) => p.plant.ownCompanyId),
    await defaultId(db),
  );
}

/** 作成画面用 — その人が選べる発行会社。 */
export async function issuingCompanyFieldFor(
  userId: string,
  db: Db = prisma,
): Promise<IssuingCompanyField> {
  const choice = await issuingChoiceFor(userId, db);
  const companies = choice.selectable
    ? await db.ownCompany.findMany({
        where: { id: { in: choice.companyIds } },
        select: { id: true, code: true, name: true },
      })
    : [];
  const byId = new Map(companies.map((c) => [c.id, c]));
  return {
    selectable: choice.selectable,
    prefill: choice.prefill,
    options: choice.companyIds.flatMap((id) => {
      const c = byId.get(id);
      if (!c) return [];
      const name = localized(c.name as LocalizedTextInput | null);
      return [
        {
          value: String(id),
          label: name && name !== "—" ? `${c.code} ${name}` : c.code,
        },
      ];
    }),
  };
}

/** 作成画面用 — いまログインしている人が選べる発行会社。 */
export async function issuingCompanyFieldForSession(): Promise<IssuingCompanyField> {
  const userId = await sessionUserId();
  if (!userId) {
    return {
      selectable: false,
      prefill: await defaultId(prisma),
      options: [],
    };
  }
  return issuingCompanyFieldFor(userId);
}

/**
 * 拠点を持たない書類（見積書・価格試算・価格表）の発行会社を確定する。
 * フォームの値をサーバーで検証する — 画面を通らない要求で、自分の属さない
 * 法人の書類を作らせない。ok: false は「選べない法人」。
 */
export async function resolveIssuingCompany(
  userId: string,
  requested: number | null | undefined,
  db: Db = prisma,
): Promise<{ ok: true; data: { ownCompanyId?: number } } | { ok: false }> {
  const resolved = resolveIssuingCompanyId(
    await issuingChoiceFor(userId, db),
    requested,
  );
  return resolved.ok
    ? { ok: true, data: ownCompanyData(resolved.id) }
    : { ok: false };
}

/** フォーム回答・社内文書（発行会社の欄を持たない書類）。 */
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
        where: { docRef: input.quoteKey.docRef },
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

/**
 * 注文請書の法人と合わない担当拠点を持つ明細（1 始まりの行番号）と、請書の
 * 法人の表示名。合っていれば rows は空。規則は lib/doc-company-core.ts
 * linesOutsideCompany（注文請書 1 件 = 法人 1 つ）。
 */
export async function acceptanceLineCompanyMismatch(
  orderCompanyId: number,
  linePlantIds: readonly (number | null | undefined)[],
  db: Db = prisma,
): Promise<{ rows: number[]; companyCode: string }> {
  const companies = await plantCompanies(linePlantIds, db);
  const rows = linesOutsideCompany(
    orderCompanyId,
    linePlantIds.map((id, i) => ({
      hasPlant: id != null,
      plantCompanyId: companies[i],
    })),
    await defaultId(db),
  );
  if (rows.length === 0) return { rows, companyCode: "" };
  const company = await db.ownCompany.findUnique({
    where: { id: orderCompanyId },
    select: { code: true },
  });
  return { rows, companyCode: company?.code ?? String(orderCompanyId) };
}

/** 設計依頼書。 */
export async function companyForDesign(
  input: { quoteKey?: DocKey | null; orderLineId?: string | null },
  db: Db = prisma,
) {
  const quote = input.quoteKey
    ? await db.quote.findUnique({
        where: { docRef: input.quoteKey.docRef },
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

/**
 * 「発行会社」バッジの判定材料（lib/doc-company-view-core.ts）— ダッシュボードの
 * レイアウトで 1 回だけ作って画面へ配る。法人は数件しか無いので名前は全件渡す。
 * 判定は作成画面の「発行会社」欄と同じ issuingCompanyChoice を通す（欄が出る人
 * = 2 社のために書類を作れる人 = 全部の書類にバッジが出る人）。
 */
export async function viewerCompanyContext(
  userId: string | null,
  db: Db = prisma,
): Promise<DocCompanyViewer> {
  const [choice, companies] = await Promise.all([
    userId
      ? issuingChoiceFor(userId, db)
      : defaultId(db).then((prefill) => ({ prefill, selectable: false })),
    db.ownCompany.findMany({ select: { id: true, code: true, name: true } }),
  ]);
  const home = companies.find((c) => c.id === choice.prefill);
  return {
    multiCompany: choice.selectable,
    homeCode: home?.code ?? null,
    names: Object.fromEntries(
      companies.map((c) => {
        const name = localized(c.name as LocalizedTextInput | null);
        return [c.code, name && name !== "—" ? name : c.code];
      }),
    ),
  };
}
