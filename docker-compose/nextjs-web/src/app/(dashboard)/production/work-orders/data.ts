/**
 * data.ts — 指示書 (app.work_orders) の server-side fetch/mapping.
 *
 * URL id = 書類番号 WO-YYYYMM-NNNNN（旧・生 int も受ける — resolveWorkOrderIdParam）。
 * 表示は書類番号、ロット番号（= work_order_number 通し連番 int）は別掲。
 * 承認履歴は history Json（{action,user,at,notes}）を displayName 解決して返す。
 */

import { type Access, ownOrPlantWhere, rowInScope } from "@ckk/authz-core";
import type { ApprovalTrailView } from "@/components/production/ApprovalStatusPanel";
import type {
  InspectionRecordView,
  InspectionTemplateView,
  StepDefectReasonView,
  StepDefectRecordView,
  StepExecutionData,
  StepPlanView,
} from "@/components/production/step-execution/model";
import type {
  StepAssigneeView,
  WorkOrderRow,
  WorkOrderView,
} from "@/components/production/work-orders/model";
import { fetchApprovalTrail, type HistoryEntry } from "@/lib/approvals";
import { getCurrentActorId } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { avatarUrl } from "@/lib/avatar";
import { type Prisma, prisma } from "@/lib/db";
import {
  formatDocNumber,
  orderLineNumberOf,
  parseDocKey,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import {
  formatCounts,
  formatSampleValue,
  type InspectionItemRecord,
  itemSpecFromRow,
  parseStoredSamples,
  samplingSpecFromRow,
} from "@/lib/inspection-core";
import { sumActualWorkHours } from "@/lib/step-work-hours";
import {
  fetchAllowedWorkLocationIds,
  fetchWorkLocationOptions,
} from "@/lib/work-locations";
import { effectiveAllocatedByLine } from "@/lib/work-order-alloc";
import { fetchWorkflowCtx, loadCatalog } from "@/lib/workflow";
import {
  canStartStep,
  effectiveLotInputMode,
  expectedInput,
} from "@/lib/workflow-core";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
// DataTable はクライアントページングのため、最新分のみで実用上十分。
const LIST_FETCH_CAP = 1000;

/** work_order_steps.defect_reasons（Json）→ 表示用の {種別, 種類, 詳細, 数} 配列。 */
function parseDefectReasons(value: unknown): StepDefectReasonView[] {
  if (!Array.isArray(value)) return [];
  const out: StepDefectReasonView[] = [];
  for (const v of value) {
    if (v == null || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    if (
      (r.type === "SEMI" || r.type === "SCRAP" || r.type === "REWORK") &&
      typeof r.count === "number"
    ) {
      out.push({
        type: r.type,
        defectTypeId:
          typeof r.defectTypeId === "number" ? r.defectTypeId : null,
        reason: typeof r.reason === "string" ? r.reason : "",
        count: r.count,
      });
    }
  }
  return out;
}

const WO_INCLUDE = {
  orderLineLinks: {
    include: {
      orderLine: { include: { acceptance: { include: { customerBp: true } } } },
    },
    orderBy: { sortOrder: "asc" as const },
  },
  createdByUser: { select: { displayName: true } },
  product: true,
  material: true,
  storageLocation: {
    select: { id: true, name: true, plant: { select: { name: true } } },
  },
  routeVersion: {
    select: {
      id: true,
      version: true,
      route: { select: { id: true, name: true, productId: true } },
    },
  },
  sourceWorkOrder: {
    select: { workOrderNumber: true, yearMonth: true, seq: true },
  },
  copies: {
    select: {
      workOrderNumber: true,
      yearMonth: true,
      seq: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
  // 指示書→指示書リンク（先行 = incoming / 後続 = outgoing）
  incomingWoLinks: {
    select: {
      id: true,
      quantity: true,
      sourceWorkOrder: {
        select: {
          workOrderNumber: true,
          yearMonth: true,
          seq: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  outgoingWoLinks: {
    select: {
      id: true,
      quantity: true,
      targetWorkOrder: {
        select: {
          workOrderNumber: true,
          yearMonth: true,
          seq: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  steps: {
    include: {
      processStep: true,
      plant: true,
      supplierBp: true,
      // 担当者（工程リストの「担当」）— 計画の割当ユーザー。写真は小サイズ。
      plans: {
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              displayName: true,
              avatarFileId: true,
              avatarThumbFileId: true,
            },
          },
        },
        orderBy: { plannedDate: "asc" as const },
      },
      // 実働時間の積算に使う（1 行 = 1 作業セッション）。
      actuals: { select: { startedAt: true, endedAt: true } },
      _count: { select: { plans: true, actuals: true } },
      // 検査工程で使う検査表テンプレート（工程単位の割当）
      inspectionTemplates: { include: { inspectionTemplate: true } },
    },
    orderBy: { sortOrder: "asc" as const },
  },
  stepLinks: true,
};

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

/**
 * 作業計画の割当ユーザー → 担当者一覧（重複排除・計画日順）。
 * 同じ人が複数日に割り当てられていても 1 人として出す。
 */
function stepAssignees(
  plans: readonly {
    user: {
      id: string;
      displayName: string | null;
      avatarFileId: string | null;
      avatarThumbFileId: string | null;
    };
  }[],
): StepAssigneeView[] {
  const seen = new Set<string>();
  const out: StepAssigneeView[] = [];
  for (const p of plans) {
    if (seen.has(p.user.id)) continue;
    seen.add(p.user.id);
    const fileId = p.user.avatarThumbFileId ?? p.user.avatarFileId;
    out.push({
      userId: p.user.id,
      name: p.user.displayName ?? "—",
      avatarUrl: fileId
        ? avatarUrl(
            p.user.id,
            fileId,
            p.user.avatarThumbFileId ? "thumb" : "full",
          )
        : null,
    });
  }
  return out;
}

/** 複数割当の一覧表示ラベル（先頭の明細番号 + ほか n 件）。 */
function orderLineListLabel(
  links: readonly {
    orderLine: {
      acceptanceYearMonth: string;
      acceptanceSeq: number;
      branch: number | null;
    };
  }[],
): string | null {
  if (links.length === 0) return null;
  const first = orderLineNumberOf(links[0].orderLine);
  if (!first) return null;
  return links.length > 1 ? `${first} ほか${links.length - 1}件` : first;
}

function mapRow(r: {
  workOrderNumber: number;
  yearMonth: string;
  seq: number;
  orderLineLinks: {
    orderLine: {
      acceptanceYearMonth: string;
      acceptanceSeq: number;
      branch: number | null;
    };
  }[];
  product: { name: unknown };
  type: string;
  plannedQuantity: number;
  approvalStatus: string;
  status: string;
  requestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): WorkOrderRow {
  return {
    workOrderNumber: r.workOrderNumber,
    docNumber: formatDocNumber("WOR", r),
    createdAt: r.createdAt.toISOString(),
    orderLineNumber: orderLineListLabel(r.orderLineLinks),
    productName: localized(r.product.name as LocalizedText | null),
    type: r.type,
    plannedQuantity: r.plannedQuantity,
    approvalStatus: r.approvalStatus,
    status: r.status,
    requestedAt: iso(r.requestedAt),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * 指示書のスコープ where 断片（PLANT = 工程の実施拠点経由 ∪ OWN = 作成者）。
 * ALL は {} — 従来通り全件。
 */
function workOrderScopeWhere(
  access: Access,
  userId: string,
): Prisma.WorkOrderWhereInput {
  return ownOrPlantWhere(access, userId, {
    plantClause: (ids) => ({ steps: { some: { plantId: { in: ids } } } }),
    ownColumn: "createdBy",
  }) as Prisma.WorkOrderWhereInput;
}

/** 取得済み指示書行（steps 付き）がスコープ内か。 */
function workOrderRowInScope(
  access: Access,
  userId: string,
  row: { createdBy: string | null; steps: { plantId: number | null }[] },
): boolean {
  return rowInScope(
    access,
    { plantIds: row.steps.map((s) => s.plantId), createdBy: row.createdBy },
    userId,
  );
}

/**
 * 指示書一覧 (PD02)。
 *
 * `extraWhere` は未処理指示書 (PD05) の「進行中」タブが未完了だけを引くための
 * 追加条件。スコープ条件と AND で合成する（キー衝突を避けるため spread しない）。
 */
export async function fetchWorkOrders(
  extraWhere?: Prisma.WorkOrderWhereInput,
): Promise<WorkOrderRow[]> {
  const authz = await checkPermission("work_order", "READ");
  if (!authz.ok) return [];
  const scope = workOrderScopeWhere(authz.access, authz.userId);
  const rows = await prisma.workOrder.findMany({
    take: LIST_FETCH_CAP,
    where: extraWhere ? { AND: [scope, extraWhere] } : scope,
    include: {
      orderLineLinks: {
        select: {
          orderLine: {
            select: {
              acceptanceYearMonth: true,
              acceptanceSeq: true,
              branch: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      product: true,
    },
    orderBy: { workOrderNumber: "desc" },
  });
  return rows.map(mapRow);
}

/** ストリップ印刷（帯）の 1 件ぶん — 最小限の要約だけ。 */
export interface WorkOrderStripView {
  workOrderNumber: number;
  /** 書類番号 WO-YYYYMM-NNNNN。 */
  docNumber: string;
  productName: string;
  /** 注文明細番号（在庫向けの独立指示書は null）。 */
  orderLineNumber: string | null;
  customerName: string | null;
  type: string;
  plannedQuantity: number;
  materialCode: string | null;
  createdAt: string;
}

/**
 * ストリップ印刷用の取得（指示書番号の配列）。詳細 view と違い工程は引かない
 * — 帯に出すのは番号・製品・数量・注文明細だけ。
 * 見えない指示書（スコープ外）は黙って落とす。
 */
export async function fetchWorkOrderStrips(
  numbers: number[],
): Promise<WorkOrderStripView[]> {
  const authz = await checkPermission("work_order", "READ");
  if (!authz.ok || numbers.length === 0) return [];
  const rows = await prisma.workOrder.findMany({
    where: {
      workOrderNumber: { in: numbers },
      ...workOrderScopeWhere(authz.access, authz.userId),
    },
    include: {
      product: true,
      material: { select: { code: true } },
      orderLineLinks: {
        select: {
          orderLine: {
            select: {
              acceptanceYearMonth: true,
              acceptanceSeq: true,
              branch: true,
              acceptance: {
                select: { customerBp: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  // 指定された並び（一覧で選んだ順）を保つ。
  const order = new Map(numbers.map((n, i) => [n, i]));
  return rows
    .sort(
      (a, b) =>
        (order.get(a.workOrderNumber) ?? 0) -
        (order.get(b.workOrderNumber) ?? 0),
    )
    .map((r) => {
      // 統合ロットは顧客も複数になり得る — 帯には先頭 + ほか n 社で出す。
      const customers = [
        ...new Set(
          r.orderLineLinks
            .map((l) =>
              localized(
                l.orderLine.acceptance.customerBp?.name as LocalizedText | null,
              ),
            )
            .filter((n) => n && n !== "—"),
        ),
      ];
      return {
        workOrderNumber: r.workOrderNumber,
        docNumber: formatDocNumber("WOR", r),
        productName: localized(r.product.name as LocalizedText | null),
        orderLineNumber: orderLineListLabel(r.orderLineLinks),
        customerName:
          customers.length === 0
            ? null
            : customers.length > 1
              ? `${customers[0]} ほか${customers.length - 1}社`
              : customers[0],
        type: r.type,
        plannedQuantity: r.plannedQuantity,
        materialCode: r.material?.code ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    });
}

/**
 * 指示書の承認記録（approval_requests / approval_records — 承認者名解決済み、
 * client-safe）。ApprovalStatusPanel の trail へ渡す。
 */
export async function fetchWorkOrderApprovalTrail(
  workOrderNumber: number,
): Promise<ApprovalTrailView[]> {
  return fetchApprovalTrail("work_orders", String(workOrderNumber));
}

/** 指示書 詳細 view model。id = work_order_number。 */
export async function fetchWorkOrder(
  workOrderNumber: number,
): Promise<WorkOrderView | null> {
  const authz = await checkPermission("work_order", "READ");
  if (!authz.ok) return null;
  const r = await prisma.workOrder.findUnique({
    where: { workOrderNumber },
    include: WO_INCLUDE,
  });
  if (!r) return null;
  // スコープ外の行は不可視（null → 呼び出し側の notFound に乗せる）。
  if (!workOrderRowInScope(authz.access, authz.userId, r)) return null;

  // 工程ごとの開始可否（実行依存 + 分岐流入 + ロック）をサーバーで算出
  const [{ ctx }, actorId] = await Promise.all([
    fetchWorkflowCtx(r.id),
    getCurrentActorId(),
  ]);

  // history Json + 工程 completedBy の uuid → displayName 解決
  const historyRaw: HistoryEntry[] = Array.isArray(r.history)
    ? (r.history as unknown as HistoryEntry[])
    : [];
  const userIds = new Set<string>();
  for (const h of historyRaw) if (h.user) userIds.add(h.user);
  for (const s of r.steps) if (s.completedBy) userIds.add(s.completedBy);
  const users = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameOf = (id: string | null | undefined) =>
    (id && users.find((u) => u.id === id)?.displayName) || "システム";

  return {
    id: r.id,
    workOrderNumber: r.workOrderNumber,
    docNumber: formatDocNumber("WOR", r),
    status: r.status,
    approvalStatus: r.approvalStatus,
    type: r.type,
    plannedQuantity: r.plannedQuantity,
    notes: r.notes,
    orderLines: r.orderLineLinks.map((l) => ({
      orderLineId: l.orderLine.id,
      number: orderLineNumberOf(l.orderLine) ?? "—",
      allocatedQuantity: l.quantity,
      lineQuantity: l.orderLine.quantity,
      customerName: localized(
        l.orderLine.acceptance.customerBp?.name as LocalizedText | null,
      ),
      status: l.orderLine.status,
      lotNumber: l.orderLine.lotNumber,
    })),
    createdByName: r.createdByUser?.displayName ?? null,
    productName: localized(r.product.name as LocalizedText | null),
    materialId: r.materialId,
    materialCode: r.material?.code ?? null,
    materialName: r.material
      ? localized(r.material.name as LocalizedText | null)
      : null,
    storageLocationId: r.storageLocationId,
    storageLocationName: r.storageLocation
      ? `${localized(r.storageLocation.plant.name as LocalizedText | null)} / ${localized(
          r.storageLocation.name as LocalizedText | null,
        )}`
      : null,
    productId: r.productId,
    routeVersionId: r.routeVersion?.id ?? null,
    routeId: r.routeVersion?.route.id ?? null,
    routeName: r.routeVersion
      ? localized(r.routeVersion.route.name as LocalizedText | null)
      : null,
    routeVersion: r.routeVersion?.version ?? null,
    lotNumber: r.orderLineLinks[0]?.orderLine.lotNumber ?? null,
    sourceWorkOrderNumber: r.sourceWorkOrder?.workOrderNumber ?? null,
    sourceWorkOrderDocNumber: r.sourceWorkOrder
      ? formatDocNumber("WOR", r.sourceWorkOrder)
      : null,
    copies: r.copies.map((c) => ({
      workOrderNumber: c.workOrderNumber,
      docNumber: formatDocNumber("WOR", c),
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    })),
    woLinksIncoming: r.incomingWoLinks.map((l) => ({
      id: l.id,
      workOrderNumber: l.sourceWorkOrder.workOrderNumber,
      docNumber: formatDocNumber("WOR", l.sourceWorkOrder),
      status: l.sourceWorkOrder.status,
      quantity: l.quantity,
    })),
    woLinksOutgoing: r.outgoingWoLinks.map((l) => ({
      id: l.id,
      workOrderNumber: l.targetWorkOrder.workOrderNumber,
      docNumber: formatDocNumber("WOR", l.targetWorkOrder),
      status: l.targetWorkOrder.status,
      quantity: l.quantity,
    })),
    steps: r.steps.map((s) => ({
      id: s.id,
      processStepId: s.processStepId,
      code: s.processStep.code,
      name: localized(s.processStep.name as LocalizedText | null),
      category: s.processStep.category,
      catalogExecution: s.processStep.executionLocation,
      isInspection: s.processStep.isInspection,
      isApprovalStep: s.processStep.isApprovalStep,
      isSyncCapable: s.processStep.isSyncCapable,
      quantityTracking: s.processStep.quantityTracking,
      sortOrder: s.sortOrder,
      executionLocation: s.executionLocation,
      plantId: s.plantId,
      plantName: s.plant
        ? localized(s.plant.name as LocalizedText | null)
        : null,
      supplierBpId: s.supplierBpId,
      plannedWorkHours:
        s.plannedWorkHours == null ? null : Number(s.plannedWorkHours),
      lotInputMode: s.lotInputMode,
      lotText: s.lotText,
      supplierName: s.supplierBp
        ? localized(s.supplierBp.name as LocalizedText | null)
        : null,
      status: s.status,
      inputQuantity: s.inputQuantity,
      outputSuccessQuantity: s.outputSuccessQuantity,
      outputDefectSemiFinished: s.outputDefectSemiFinished,
      outputDefectScrap: s.outputDefectScrap,
      outputDefectRework: s.outputDefectRework,
      outsourceRequestedAt: iso(s.outsourceRequestedAt),
      outsourceExpectedAt: iso(s.outsourceExpectedAt),
      completedAt: iso(s.completedAt),
      completedByName: s.completedBy ? nameOf(s.completedBy) : null,
      planCount: s._count.plans,
      actualCount: s._count.actuals,
      branchStockDisposition: s.branchStockDisposition,
      assignees: stepAssignees(s.plans),
      actualWorkHours: sumActualWorkHours(s.actuals),
      canStart: canStartStep(s.id, ctx, actorId).ok,
      inspectionTemplates: s.inspectionTemplates.map((t) => ({
        id: t.inspectionTemplate.id,
        code: t.inspectionTemplate.code,
        name: localized(t.inspectionTemplate.name as LocalizedText | null),
      })),
    })),
    stepLinks: r.stepLinks.map((l) => ({
      sourceStepId: l.sourceStepId,
      targetStepId: l.targetStepId,
      routedQuantity: l.routedQuantity,
    })),
    rejectReason: r.rejectReason,
    history: historyRaw.map((h) => ({
      action: h.action,
      user: nameOf(h.user),
      at: h.at,
      notes: h.notes ?? null,
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ── 工程スプリットビュー（/[id]/steps レイアウトの左ペイン） ─────────────────

/** 工程ナビ 1 行分（スプリットペインの一覧項目）。 */
export interface StepNavItem {
  id: string;
  code: string;
  name: string;
  status: string;
  executionLocation: string;
  plantName: string | null;
  supplierName: string | null;
  isInspection: boolean;
  isApprovalStep: boolean;
  /** 数量サマリ（指示書詳細のカードと同じ内訳を一覧にも出す）。 */
  inputQuantity: number | null;
  outputSuccessQuantity: number | null;
  outputDefectSemiFinished: number | null;
  outputDefectScrap: number | null;
  outputDefectRework: number | null;
}

export interface WorkOrderStepNav {
  workOrderNumber: number;
  /** 書類番号 WO-YYYYMM-NNNNN。 */
  docNumber: string;
  createdAt: string;
  steps: StepNavItem[];
}

/**
 * 工程一覧ペイン用の軽量 fetch。fetchWorkOrder と違い実行可否（workflow ctx）
 * は計算しない — 工程間の遷移ごとにレイアウトで呼ばれるため。
 */
export async function fetchWorkOrderStepNav(
  workOrderNumber: number,
): Promise<WorkOrderStepNav | null> {
  const authz = await checkPermission("work_order", "READ");
  if (!authz.ok) return null;
  const r = await prisma.workOrder.findUnique({
    where: { workOrderNumber },
    select: {
      workOrderNumber: true,
      yearMonth: true,
      seq: true,
      createdAt: true,
      createdBy: true,
      steps: {
        select: {
          id: true,
          status: true,
          executionLocation: true,
          plantId: true,
          inputQuantity: true,
          outputSuccessQuantity: true,
          outputDefectSemiFinished: true,
          outputDefectScrap: true,
          outputDefectRework: true,
          processStep: {
            select: {
              code: true,
              name: true,
              isInspection: true,
              isApprovalStep: true,
            },
          },
          plant: { select: { name: true } },
          supplierBp: { select: { name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!r) return null;
  if (!workOrderRowInScope(authz.access, authz.userId, r)) return null;
  return {
    workOrderNumber: r.workOrderNumber,
    docNumber: formatDocNumber("WOR", r),
    createdAt: r.createdAt.toISOString(),
    steps: r.steps.map((s) => ({
      id: s.id,
      code: s.processStep.code,
      name: localized(s.processStep.name as LocalizedText | null),
      status: s.status,
      executionLocation: s.executionLocation,
      plantName: s.plant
        ? localized(s.plant.name as LocalizedText | null)
        : null,
      supplierName: s.supplierBp
        ? localized(s.supplierBp.name as LocalizedText | null)
        : null,
      isInspection: s.processStep.isInspection,
      isApprovalStep: s.processStep.isApprovalStep,
      inputQuantity: s.inputQuantity,
      outputSuccessQuantity: s.outputSuccessQuantity,
      outputDefectSemiFinished: s.outputDefectSemiFinished,
      outputDefectScrap: s.outputDefectScrap,
      outputDefectRework: s.outputDefectRework,
    })),
  };
}

// ── 工程実行 (§7 / design.md §12.3) ─────────────────────────────────────────

const dateOnly = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

/** 工程実行ページの view model。指示書に属さない stepId は null。 */
export async function fetchStepExecution(
  workOrderNumber: number,
  stepId: string,
): Promise<StepExecutionData | null> {
  const authz = await checkPermission("work_order", "READ");
  if (!authz.ok) return null;
  const wo = await prisma.workOrder.findUnique({
    where: { workOrderNumber },
    select: {
      id: true,
      status: true,
      yearMonth: true,
      seq: true,
      createdAt: true,
      plannedQuantity: true,
      createdBy: true,
      steps: { select: { plantId: true } },
    },
  });
  if (!wo) return null;
  if (!workOrderRowInScope(authz.access, authz.userId, wo)) return null;

  const step = await prisma.workOrderStep.findFirst({
    where: { id: stepId, workOrderId: wo.id },
    include: {
      processStep: true,
      plant: true,
      supplierBp: true,
      // この工程に割り当てられた検査表テンプレート（工程単位）
      inspectionTemplates: {
        include: {
          inspectionTemplate: {
            include: { items: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
      inspectionRecords: {
        include: {
          template: true,
          items: { include: { templateItem: true } },
        },
        orderBy: { recordedAt: "desc" },
      },
      defectRecords: {
        include: { defectType: true },
        orderBy: { recordedAt: "desc" },
      },
      plans: {
        include: {
          user: { select: { displayName: true } },
          workLocation: { select: { id: true, name: true } },
        },
        orderBy: [{ plannedDate: "asc" }, { plannedStartAt: "asc" }],
      },
      actuals: {
        include: {
          user: { select: { displayName: true } },
          workLocation: { select: { id: true, name: true } },
        },
        orderBy: [{ workedDate: "asc" }, { startedAt: "asc" }],
      },
    },
  });
  if (!step) return null;

  const [{ ctx }, actorId, defectTypes, allOptions, allowedLocationIds] =
    await Promise.all([
      fetchWorkflowCtx(wo.id),
      getCurrentActorId(),
      prisma.defectType.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      }),
      fetchWorkLocationOptions(),
      fetchAllowedWorkLocationIds(step.processStepId),
    ]);
  // 工程マスタに許可リストがあれば選択肢を絞る（計画・実績とも同じ制限）
  const workLocationOptions =
    allowedLocationIds == null
      ? allOptions
      : allOptions.filter((o) => allowedLocationIds.has(Number(o.value)));

  // 承認工程は指示書全体の検査記録を承認対象として表示する
  const woRecordsRaw = step.processStep.isApprovalStep
    ? await prisma.inspectionRecord.findMany({
        where: { step: { workOrderId: wo.id } },
        include: {
          template: true,
          step: { include: { processStep: true } },
          items: { include: { templateItem: true } },
        },
        orderBy: { recordedAt: "desc" },
      })
    : [];

  // user uuid → displayName 解決
  const userIds = new Set<string>();
  for (const id of [step.sessionLockedBy, step.startedBy, step.completedBy]) {
    if (id) userIds.add(id);
  }
  for (const rec of [...step.inspectionRecords, ...woRecordsRaw]) {
    if (rec.recordedBy) userIds.add(rec.recordedBy);
    if (rec.approvedBy) userIds.add(rec.approvedBy);
  }
  for (const d of step.defectRecords) {
    if (d.recordedBy) userIds.add(d.recordedBy);
  }
  const users = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameOf = (id: string | null | undefined) =>
    id ? (users.find((u) => u.id === id)?.displayName ?? "システム") : null;

  // 実測値の表示（合格数のみ → 合格 n/m、新形式 measured_values は型別
  // フォーマット、旧形式は生値）
  const recordItemLabel = (it: {
    measuredValue: string | null;
    measuredValues: unknown;
    inspectedCount: number | null;
    passedCount: number | null;
    templateItem: InspectionItemRecord;
  }): string | null => {
    if (it.inspectedCount != null || it.passedCount != null) {
      return formatCounts(it.inspectedCount, it.passedCount);
    }
    const samples = parseStoredSamples(it.measuredValues);
    if (samples.length === 0) return it.measuredValue;
    const spec = itemSpecFromRow(it.templateItem);
    return samples.map((s) => formatSampleValue(spec, s)).join(" / ");
  };

  type RecordRaw = (typeof step.inspectionRecords)[number];
  const mapRecord = (
    rec: RecordRaw,
    stepName: string | null,
  ): InspectionRecordView => ({
    id: rec.id,
    templateId: rec.templateId,
    templateName: localized(rec.template.name as LocalizedText | null),
    stepName,
    status: rec.status,
    recordedAt: iso(rec.recordedAt),
    recordedByName: nameOf(rec.recordedBy),
    approvedAt: iso(rec.approvedAt),
    approvedByName: nameOf(rec.approvedBy),
    items: rec.items.map((it) => ({
      templateItemId: it.templateItemId,
      itemName: localized(it.templateItem.itemName as LocalizedText | null),
      valueLabel: recordItemLabel(it),
      isPass: it.isPass,
    })),
  });

  // 検査工程で出すテンプレート: この工程に割り当てられたもの（工程単位）
  const templates: InspectionTemplateView[] = step.inspectionTemplates.map(
    (t) => ({
      id: t.inspectionTemplate.id,
      code: t.inspectionTemplate.code,
      version: t.inspectionTemplate.version,
      name: localized(t.inspectionTemplate.name as LocalizedText | null),
      relatedProcessStepId: t.inspectionTemplate.relatedProcessStepId,
      ...samplingSpecFromRow(t.inspectionTemplate),
      items: t.inspectionTemplate.items.map((it) => ({
        name: localized(it.itemName as LocalizedText | null),
        ...itemSpecFromRow(it),
      })),
    }),
  );

  const defectRecords: StepDefectRecordView[] = step.defectRecords.map((d) => ({
    id: d.id,
    defectTypeName: localized(d.defectType.name as LocalizedText | null),
    description: d.description,
    recordedAt: d.recordedAt.toISOString(),
    recordedByName: nameOf(d.recordedBy),
  }));

  // timestamptz → HH:mm（JST）。@db.Date 列は UTC 深夜の Date なので ISO 切り出し。
  const jstTime = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(d)
      : null;
  const mapPlanRow = (r: {
    id: string;
    userId: string;
    user: { displayName: string };
    date: Date;
    start: Date | null;
    end: Date | null;
    quantity: number | null;
    notes: string | null;
    workLocation?: { id: number; name: unknown } | null;
  }): StepPlanView => ({
    id: r.id,
    userId: r.userId,
    userName: r.user.displayName,
    date: r.date.toISOString().slice(0, 10),
    startTime: jstTime(r.start),
    endTime: jstTime(r.end),
    quantity: r.quantity,
    workLocationId: r.workLocation?.id ?? null,
    workLocationName: r.workLocation
      ? localized(r.workLocation.name as LocalizedText | null)
      : null,
    notes: r.notes,
  });
  const plans = step.plans.map((p) =>
    mapPlanRow({
      ...p,
      date: p.plannedDate,
      start: p.plannedStartAt,
      end: p.plannedEndAt,
    }),
  );
  const actuals = step.actuals.map((a) =>
    mapPlanRow({
      ...a,
      date: a.workedDate,
      start: a.startedAt,
      end: a.endedAt,
    }),
  );

  return {
    actorId,
    workOrderNumber,
    workOrderDocNumber: formatDocNumber("WOR", wo),
    workOrderCreatedAt: wo.createdAt.toISOString(),
    workOrderStatus: wo.status,
    plannedQuantity: wo.plannedQuantity,
    step: {
      id: step.id,
      processStepId: step.processStepId,
      code: step.processStep.code,
      name: localized(step.processStep.name as LocalizedText | null),
      category: step.processStep.category,
      isInspection: step.processStep.isInspection,
      isApprovalStep: step.processStep.isApprovalStep,
      quantityTracking: step.processStep.quantityTracking,
      lotInputMode: effectiveLotInputMode(
        step.lotInputMode,
        step.processStep.lotInputMode,
      ),
      lotText: step.lotText,
      sortOrder: step.sortOrder,
      executionLocation: step.executionLocation,
      plantName: step.plant
        ? localized(step.plant.name as LocalizedText | null)
        : null,
      supplierName: step.supplierBp
        ? localized(step.supplierBp.name as LocalizedText | null)
        : null,
      plannedWorkHours:
        step.plannedWorkHours == null ? null : Number(step.plannedWorkHours),
      status: step.status,
      inputQuantity: step.inputQuantity,
      outputSuccessQuantity: step.outputSuccessQuantity,
      outputDefectSemiFinished: step.outputDefectSemiFinished,
      outputDefectScrap: step.outputDefectScrap,
      outputDefectRework: step.outputDefectRework,
      defectReasons: parseDefectReasons(step.defectReasons),
      sessionLockedBy: step.sessionLockedBy,
      sessionLockedByName: nameOf(step.sessionLockedBy),
      startedAt: iso(step.startedAt),
      startedByName: nameOf(step.startedBy),
      completedAt: iso(step.completedAt),
      completedByName: nameOf(step.completedBy),
      cancelReason: step.cancelReason,
      notes: step.notes,
      outsourceRequestedAt: dateOnly(step.outsourceRequestedAt),
      outsourceExpectedAt: dateOnly(step.outsourceExpectedAt),
      outsourceReceivedAt: dateOnly(step.outsourceReceivedAt),
      outsourceCost:
        step.outsourceCost != null ? Number(step.outsourceCost) : null,
    },
    canStart: canStartStep(step.id, ctx, actorId),
    expectedInputQuantity: expectedInput(step.id, ctx),
    templates,
    stepRecords: step.inspectionRecords.map((r) => mapRecord(r, null)),
    workOrderRecords: woRecordsRaw.map((r) =>
      mapRecord(r, localized(r.step.processStep.name as LocalizedText | null)),
    ),
    defectRecords,
    defectTypeOptions: defectTypes.map((d) => ({
      value: String(d.id),
      label: `${d.code} ${localized(d.name as LocalizedText | null)}`,
    })),
    plans,
    actuals,
    workLocationOptions,
  };
}

// ── ビルダー用 options ───────────────────────────────────────────────────────

export interface Option {
  value: string;
  label: string;
}

/** 工程カタログ（有効のみ）— 分岐追加モーダルの MultiSelect。value = String(id)。 */
export async function fetchCatalogStepOptions(): Promise<Option[]> {
  const catalog = await loadCatalog();
  return catalog.steps.map((s) => ({
    value: String(s.id),
    label: `${s.code} ${s.nameJa}`,
  }));
}

/** 拠点（有効のみ）— 社内工程の実施拠点 Select。value = String(内部 id)。 */
export async function fetchPlantOptions(): Promise<Option[]> {
  const rows = await prisma.plant.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${r.code} ${localized(r.name as LocalizedText | null)}`,
  }));
}

/**
 * 担当者候補（有効な従業員アカウント）— 作成時の作業計画の MultiSelect 用。
 * value = users.id (uuid)、label = 表示名。
 */
export async function fetchEmployeeOptions(): Promise<Option[]> {
  const rows = await prisma.user.findMany({
    where: { isActive: true, group: "EMPLOYEE" },
    orderBy: { username: "asc" },
    select: { id: true, displayName: true },
  });
  return rows.map((u) => ({ value: u.id, label: u.displayName }));
}

/**
 * 保管場所（有効のみ・拠点名付き）— 完成品の保管場所 Select。
 * value = String(内部 id)、label = 「拠点名 / 保管場所名」。
 */
export async function fetchStorageLocationOptions(): Promise<Option[]> {
  const rows = await prisma.storageLocation.findMany({
    where: { isActive: true, plant: { isActive: true } },
    include: { plant: { select: { name: true, code: true } } },
    orderBy: [{ plantId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${localized(r.plant.name as LocalizedText | null)} / ${localized(
      r.name as LocalizedText | null,
    )}`,
  }));
}

/** 検査表テンプレートの選択肢（関連工程の自動選択に使う）。 */
export interface InspectionTemplateOption {
  value: string; // String(内部 id)
  label: string;
  relatedProcessStepId: number | null;
}

/**
 * 検査表テンプレート（有効のみ・code ごとに最新バージョンのみ）— MultiSelect。
 * value = String(内部 id) = そのバージョンの行 id（指示書はバージョン固定）。
 */
export async function fetchInspectionTemplateOptions(): Promise<
  InspectionTemplateOption[]
> {
  const rows = await prisma.inspectionTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ code: "asc" }, { version: "desc" }],
  });
  return rows
    .filter((r, i) => i === 0 || rows[i - 1].code !== r.code)
    .map((r) => ({
      value: String(r.id),
      label: `${r.code} v${r.version} ${localized(r.name as LocalizedText | null)}`,
      relatedProcessStepId: r.relatedProcessStepId,
    }));
}

/**
 * 外注先（VENDOR ロールの有効 BP）— 外注工程の仕入先 Select。value = uuid。
 * option-search に VENDOR 検索が無いため、サーバーで全件ロードして渡す
 * （外注先は少数マスタの想定）。
 */
export async function fetchSupplierOptions(): Promise<Option[]> {
  const rows = await prisma.businessPartner.findMany({
    where: {
      isActive: true,
      roleAssignments: { some: { role: "VENDOR", isActive: true } },
    },
    orderBy: { bpCode: "asc" },
  });
  return rows.map((r) => ({
    value: r.id,
    label: `${r.bpCode ?? "—"} ${localized(r.name as LocalizedText | null)}`,
  }));
}

// ── URL id 解決（書類番号 / 旧・生 int の両対応） ────────────────────────────

/**
 * URL の [id] を内部の指示書番号（通し連番 int = ロット番号）へ解決する。
 * 新形式 WO-YYYYMM-NNNNN と、旧形式の生 int（監査・通知に残る過去リンク）を
 * 両方受ける。見つからない・不正は null → 呼び出し側の notFound に乗せる。
 */
export async function resolveWorkOrderIdParam(
  id: string,
): Promise<number | null> {
  const decoded = decodeURIComponent(id);
  const key = parseDocKey(decoded, "WOR");
  if (key) {
    const row = await prisma.workOrder.findUnique({
      where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
      select: { workOrderNumber: true },
    });
    return row?.workOrderNumber ?? null;
  }
  const n = Number(decoded);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

// ── 注文明細参照（?orderLine= プリセレクト・ビルダーの選択情報） ────────────────

export interface OrderLineRef {
  id: string;
  number: string;
  label: string;
  customerName: string;
  productName: string;
  productId: number;
  quantity: number;
  status: string;
  /**
   * 手配済み（実効）— キャンセル除く割当合計。完了済み指示書は実際に
   * できた分だけ数える（不良の不足分は受注残へ戻る）。
   */
  allocatedQuantity: number;
  /** まだ割り当てられる数量（受注数量 − 手配済）。 */
  remainingQuantity: number;
}

export async function fetchOrderLineRef(
  orderLineId: string,
): Promise<OrderLineRef | null> {
  const [r, allocatedMap] = await Promise.all([
    prisma.orderLine.findUnique({
      where: { id: orderLineId },
      include: {
        acceptance: { include: { customerBp: true } },
        product: true,
      },
    }),
    // 手配済みは実効値 — 完了済み指示書で不良が多く、割当より少なく
    // しかできなかったぶんは受注残へ戻る（lib/work-order-alloc）。
    effectiveAllocatedByLine([orderLineId]),
  ]);
  if (!r) return null;
  const number = orderLineNumberOf(r);
  if (!number) return null; // 未確定の明細は指示書の対象にならない
  const productName = localized(r.product?.name as LocalizedText | null);
  const allocatedQuantity = allocatedMap.get(orderLineId) ?? 0;
  return {
    id: r.id,
    number,
    label: `${number} ${productName}（${r.quantity}）`,
    customerName: localized(
      r.acceptance.customerBp?.name as LocalizedText | null,
    ),
    productName,
    productId: r.productId ?? 0,
    quantity: r.quantity,
    status: r.status,
    allocatedQuantity,
    remainingQuantity: Math.max(0, r.quantity - allocatedQuantity),
  };
}
