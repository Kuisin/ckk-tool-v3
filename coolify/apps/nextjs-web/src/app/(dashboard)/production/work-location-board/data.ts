/**
 * 作業場所一覧 (PD09) のデータ取得。
 *
 * 共有端末の /work-location（nextjs-kiosk lib/steps.ts listStepsAtLocation）と
 * 同じ問い — 「この作業場所で、この日に何が待っているか」— を、全部の作業場所に
 * ついて一度に引く。**キオスクを呼ばずにここで引き直す**（アプリ間で内部 API を
 * 叩かない約束）。拾う行:
 *
 *   (A) その日の計画（作業場所の付いた計画もそうでない計画も）。
 *       過去の日付を見たときに「その日に何をやったか」も読めるよう、完了した
 *       工程も出す（キャンセルした工程・指示書は出さない）。
 *   (B) 今日を見ているときだけ: 前日以前の計画で、まだ終わっていない工程
 *       （= 持ち越し）。キオスクの「期日到来済み（遅延含む）」と同じ。
 *   (C) 今日を見ているときだけ: その場所で実績を記録した進行中の工程。
 *       一時停止は実績行を閉じるので endedAt では絞らない（キオスクと同じ）。
 *
 * 行スコープは指示書一覧 (PD02) と同じ workOrderScopeWhere。
 */

import { getLocale } from "next-intl/server";
import type { BoardData } from "@/components/production/work-location-board/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { jstTodayString } from "@/lib/step-due-date-core";
import {
  type BoardLocation,
  type BoardRow,
  groupBoardRows,
} from "@/lib/work-location-board-core";
import { workOrderScopeWhere } from "../work-orders/data";

/** 1 日に出す行の上限（それを超える計画は現実的に無い — 安全弁）。 */
const ROW_CAP = 2000;

const ACTIVE_WO = ["APPROVED", "IN_PROGRESS"] as const;
const OPEN_STEP = ["PENDING", "IN_PROGRESS"] as const;

const asText = (v: unknown) => (v ?? null) as LocalizedText | null;
const dateOnly = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

const STEP_SELECT = {
  id: true,
  sortOrder: true,
  status: true,
  dueDate: true,
  processStep: { select: { name: true } },
  workOrder: {
    select: {
      workOrderNumber: true,
      docRef: true,
      productItem: { select: { name: true } },
    },
  },
} satisfies Prisma.WorkOrderStepSelect;

type StepRow = Prisma.WorkOrderStepGetPayload<{ select: typeof STEP_SELECT }>;

export async function fetchWorkLocationBoard(date: string): Promise<BoardData> {
  const today = jstTodayString();
  const isToday = date === today;
  const empty: BoardData = { date, isToday, groups: [], total: 0 };
  const authz = await checkPermission("work_order", "READ");
  if (!authz.ok) return empty;
  const locale = await getLocale();
  const scope = workOrderScopeWhere(authz.access, authz.userId);
  // @db.Date は UTC 深夜で比べる（JST の暦日をそのまま載せた値）
  const day = new Date(`${date}T00:00:00.000Z`);

  const planSelect = {
    id: true,
    plannedDate: true,
    plannedStartAt: true,
    plannedEndAt: true,
    workLocationId: true,
    user: { select: { displayName: true } },
    step: { select: STEP_SELECT },
  } satisfies Prisma.WorkOrderStepPlanSelect;

  const [dayPlans, carried, worked, locationRows] = await Promise.all([
    // (A) その日の計画
    prisma.workOrderStepPlan.findMany({
      where: {
        plannedDate: day,
        step: {
          status: { not: "CANCELLED" },
          workOrder: {
            AND: [scope, { status: { in: [...ACTIVE_WO, "COMPLETED"] } }],
          },
        },
      },
      select: planSelect,
      take: ROW_CAP,
    }),
    // (B) 持ち越し（今日を見ているときだけ）
    isToday
      ? prisma.workOrderStepPlan.findMany({
          where: {
            plannedDate: { lt: day },
            step: {
              status: { in: [...OPEN_STEP] },
              workOrder: { AND: [scope, { status: { in: [...ACTIVE_WO] } }] },
            },
          },
          select: planSelect,
          orderBy: [{ plannedDate: "desc" }],
          take: ROW_CAP,
        })
      : Promise.resolve([]),
    // (C) その場所で実績を記録した進行中の工程（今日を見ているときだけ）
    isToday
      ? prisma.workOrderStepActual.findMany({
          where: {
            workLocationId: { not: null },
            step: {
              status: "IN_PROGRESS",
              workOrder: { AND: [scope, { status: { in: [...ACTIVE_WO] } }] },
            },
          },
          select: {
            workLocationId: true,
            user: { select: { displayName: true } },
            step: { select: STEP_SELECT },
          },
          distinct: ["stepId", "workLocationId"],
          take: ROW_CAP,
        })
      : Promise.resolve([]),
    prisma.workLocation.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        sortOrder: true,
        group: { select: { name: true, sortOrder: true } },
      },
    }),
  ]);

  const base = (step: StepRow) => ({
    stepId: step.id,
    workOrderNumber: step.workOrder.workOrderNumber,
    docNumber: formatDocNumber("WOR", step.workOrder),
    productName: localized(asText(step.workOrder.productItem.name), locale),
    stepName: localized(asText(step.processStep.name), locale),
    stepSortOrder: step.sortOrder,
    stepStatus: step.status,
    dueDate: dateOnly(step.dueDate),
  });

  const rows: BoardRow[] = [];
  // 同じ工程 × 場所を二度出さない（その日の計画 > 持ち越し > 実績）。
  const seen = new Set<string>();
  const seenKey = (stepId: string, loc: number | null) => `${stepId}:${loc}`;

  for (const p of dayPlans) {
    seen.add(seenKey(p.step.id, p.workLocationId));
    rows.push({
      ...base(p.step),
      key: p.id,
      reason: "PLANNED",
      plannedDate: dateOnly(p.plannedDate),
      plannedStartAt: p.plannedStartAt?.toISOString() ?? null,
      plannedEndAt: p.plannedEndAt?.toISOString() ?? null,
      assigneeName: p.user?.displayName ?? null,
      locationId: p.workLocationId,
    });
  }
  for (const p of carried) {
    const k = seenKey(p.step.id, p.workLocationId);
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push({
      ...base(p.step),
      key: p.id,
      reason: "CARRIED_OVER",
      plannedDate: dateOnly(p.plannedDate),
      plannedStartAt: null,
      plannedEndAt: null,
      assigneeName: p.user?.displayName ?? null,
      locationId: p.workLocationId,
    });
  }
  for (const a of worked) {
    const k = seenKey(a.step.id, a.workLocationId);
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push({
      ...base(a.step),
      key: `w:${a.step.id}:${a.workLocationId}`,
      reason: "WORKING",
      plannedDate: null,
      plannedStartAt: null,
      plannedEndAt: null,
      assigneeName: a.user.displayName,
      locationId: a.workLocationId,
    });
  }

  const locations: BoardLocation[] = locationRows.map((l) => ({
    id: l.id,
    code: l.code,
    name: localized(asText(l.name), locale),
    groupName: localized(asText(l.group.name), locale),
    groupSortOrder: l.group.sortOrder,
    sortOrder: l.sortOrder,
  }));

  return {
    date,
    isToday,
    groups: groupBoardRows(rows, locations),
    total: rows.length,
  };
}
