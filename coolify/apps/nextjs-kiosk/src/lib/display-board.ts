/**
 * display-board.ts — ディスプレイに映す業務データの取得。server-only.
 *
 * **読み取りは必ず `displayDb` を通す**（lib/display-db.ts）。あちらは
 * 書き込みメソッドを型ごと持たない読み取り専用のファサードで、壁の画面に
 * 繋がるコードが業務データを書き換えられないことを型で保証している。
 * ここで素の `prisma` を使うとその保証が消えるので、使わないこと。
 *
 * 整形・並べ替え・ページ分割は display-board-core.ts の純関数が持つ
 * （ここは DB から素材を集めるだけ）。
 */

import type { BoardRow, BoardStep } from "./display-board-core";
import { displayDb } from "./display-db";
import { localized } from "./format";

type LocalizedJson = { ja: string; en: string };

function name(value: unknown): string {
  return localized(value as LocalizedJson);
}

function endOfDay(daysAhead: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfDay(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── 生産状況 ───────────────────────────────────────────────────────────────

export type ProductionFilter = {
  plantId?: number | null;
  includePending?: boolean;
};

/**
 * ボードに出す指示書。承認済み・進行中のみ（下書きや完了済みは出さない —
 * 壁の画面に出す価値があるのは「いま流れているもの」だけ）。
 */
export async function loadProductionBoard(
  filter: ProductionFilter = {},
): Promise<BoardRow[]> {
  const statuses =
    filter.includePending === false
      ? (["IN_PROGRESS"] as const)
      : (["APPROVED", "IN_PROGRESS"] as const);

  const workOrders = await displayDb.workOrder.findMany({
    where: {
      status: { in: [...statuses] },
      // 拠点は工程側で見る（指示書は拠点を持たない — 工程ごとに実施拠点が
      // 違い得るため）
      ...(filter.plantId
        ? { steps: { some: { plantId: filter.plantId } } }
        : {}),
    },
    select: {
      id: true,
      workOrderNumber: true,
      yearMonth: true,
      seq: true,
      plannedQuantity: true,
      product: { select: { name: true } },
      steps: {
        select: {
          id: true,
          sortOrder: true,
          status: true,
          sessionLockedBy: true,
          inputQuantity: true,
          outputSuccessQuantity: true,
          processStep: { select: { name: true } },
          plans: {
            select: { user: { select: { displayName: true } } },
            orderBy: { plannedDate: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { workOrderNumber: "asc" },
    take: 100,
  });

  return workOrders.map((wo): BoardRow => {
    const steps: BoardStep[] = wo.steps.map((s) => ({
      id: s.id,
      name: name(s.processStep.name),
      sortOrder: s.sortOrder,
      status: s.status,
      // 一時停止は状態ではなく導出 — 進行中なのにロックが空いている
      paused: s.status === "IN_PROGRESS" && s.sessionLockedBy === null,
      inputQuantity: s.inputQuantity,
      outputSuccessQuantity: s.outputSuccessQuantity,
      assignees: [
        ...new Set(s.plans.map((p) => p.user.displayName).filter(Boolean)),
      ],
    }));

    return {
      workOrderId: wo.id,
      lotNumber: wo.workOrderNumber,
      documentNumber: `WOR-${wo.yearMonth}-${String(wo.seq).padStart(5, "0")}`,
      productName: name(wo.product.name),
      plannedQuantity: wo.plannedQuantity,
      steps,
    };
  });
}

// ─── 未処理・手配待ち ───────────────────────────────────────────────────────

export type PendingRow = {
  id: string;
  documentNumber: string;
  customerName: string;
  productName: string;
  quantity: number;
  arrangedQuantity: number;
  deliveryDate: Date | null;
  /** 納期を過ぎているか（サーバー側で判定して渡す — 端末の時計を信じない）。 */
  overdue: boolean;
};

export type PendingFilter = {
  plantId?: number | null;
  days?: number;
  overdueOnly?: boolean;
};

/**
 * まだ指示書が出ていない（手配数が受注数に足りない）注文明細。
 * PD05「未処理指示書」と同じ考え方だが、壁向けに納期順の一覧だけを出す。
 */
export async function loadPendingBoard(
  filter: PendingFilter = {},
): Promise<PendingRow[]> {
  const days = filter.days ?? 14;
  const lines = await displayDb.orderLine.findMany({
    where: {
      status: { in: ["CONFIRMED", "IN_PRODUCTION"] },
      cancelledAt: null,
      deliveryDate: { not: null, lte: endOfDay(days) },
      ...(filter.plantId
        ? { acceptance: { assignedPlantId: filter.plantId } }
        : {}),
    },
    select: {
      id: true,
      acceptanceYearMonth: true,
      acceptanceSeq: true,
      branch: true,
      quantity: true,
      deliveryDate: true,
      product: { select: { name: true } },
      productText: true,
      acceptance: { select: { customerBp: { select: { name: true } } } },
      workOrderLinks: { select: { quantity: true } },
    },
    orderBy: { deliveryDate: "asc" },
    take: 200,
  });

  const today = startOfDay(0);
  return (
    lines
      .map((l): PendingRow => {
        const arranged = l.workOrderLinks.reduce(
          (sum, w) => sum + w.quantity,
          0,
        );
        return {
          id: l.id,
          documentNumber: `ORD-${l.acceptanceYearMonth}-${String(l.acceptanceSeq).padStart(5, "0")}${
            l.branch == null ? "" : `-${String(l.branch).padStart(2, "0")}`
          }`,
          customerName: l.acceptance.customerBp
            ? name(l.acceptance.customerBp.name)
            : "—",
          productName: l.product
            ? name(l.product.name)
            : (l.productText ?? "—"),
          quantity: l.quantity,
          arrangedQuantity: arranged,
          deliveryDate: l.deliveryDate,
          overdue: l.deliveryDate != null && l.deliveryDate < today,
        };
      })
      // 手配が足りていないものだけ（= まだやることが残っている行）
      .filter((r) => r.arrangedQuantity < r.quantity)
      .filter((r) => (filter.overdueOnly ? r.overdue : true))
  );
}

// ─── 出荷予定 ───────────────────────────────────────────────────────────────

export type ShippingRow = {
  id: string;
  documentNumber: string;
  customerName: string;
  status: string;
  itemCount: number;
  totalQuantity: number;
  fromPlantName: string | null;
};

export type ShippingFilter = { plantId?: number | null; days?: number };

/** これから出す出荷書（未出荷）。出荷場の壁向け。 */
export async function loadShippingBoard(
  filter: ShippingFilter = {},
): Promise<ShippingRow[]> {
  const days = filter.days ?? 7;
  const orders = await displayDb.deliveryOrder.findMany({
    where: {
      status: { in: ["DRAFT", "CONFIRMED"] },
      shippedAt: null,
      createdAt: { gte: startOfDay(days * 3) },
      ...(filter.plantId ? { fromPlantId: filter.plantId } : {}),
    },
    select: {
      yearMonth: true,
      seq: true,
      status: true,
      customerBp: { select: { name: true } },
      fromPlant: { select: { name: true } },
      items: { select: { quantity: true } },
    },
    orderBy: [{ yearMonth: "asc" }, { seq: "asc" }],
    take: 100,
  });

  return orders.map((o) => ({
    id: `${o.yearMonth}-${o.seq}`,
    documentNumber: `DOR-${o.yearMonth}-${String(o.seq).padStart(5, "0")}`,
    customerName: name(o.customerBp.name),
    status: o.status,
    itemCount: o.items.length,
    totalQuantity: o.items.reduce((sum, i) => sum + i.quantity, 0),
    fromPlantName: o.fromPlant ? name(o.fromPlant.name) : null,
  }));
}

// ─── 品質・不良 ─────────────────────────────────────────────────────────────

export type QualityRow = {
  id: string;
  defectTypeName: string;
  count: number;
};

export type QualitySummary = {
  totalDefects: number;
  days: number;
  rows: QualityRow[];
};

export type QualityFilter = { plantId?: number | null; days?: number };

/** 直近の不良記録を種類ごとに数える。朝礼で使う想定なので集計だけ。 */
export async function loadQualityBoard(
  filter: QualityFilter = {},
): Promise<QualitySummary> {
  const days = filter.days ?? 7;
  const records = await displayDb.defectRecord.findMany({
    where: {
      recordedAt: { gte: startOfDay(days) },
      ...(filter.plantId ? { workOrderStep: { plantId: filter.plantId } } : {}),
    },
    select: { id: true, defectType: { select: { id: true, name: true } } },
    take: 2000,
  });

  const byType = new Map<number, { name: string; count: number }>();
  for (const r of records) {
    const key = r.defectType.id;
    const entry = byType.get(key);
    if (entry) entry.count += 1;
    else byType.set(key, { name: name(r.defectType.name), count: 1 });
  }

  const rows = [...byType.entries()]
    .map(([id, v]) => ({
      id: String(id),
      defectTypeName: v.name,
      count: v.count,
    }))
    .sort((a, b) => b.count - a.count);

  return { totalDefects: records.length, days, rows };
}

// ─── 共通 ───────────────────────────────────────────────────────────────────

/** 拠点名（見出しに出す）。指定なし・見つからないときは null。 */
export async function plantNameOf(
  plantId: number | null | undefined,
): Promise<string | null> {
  if (!plantId) return null;
  const plant = await displayDb.plant.findUnique({
    where: { id: plantId },
    select: { name: true },
  });
  if (!plant) return null;
  const text = name(plant.name);
  return text === "—" ? null : text;
}
