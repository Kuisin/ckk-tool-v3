/**
 * work-order-wip.ts — 在庫の仕掛品から指示書を始める（server-only）。
 *
 * 指示書ビルダーの「使える仕掛品」に並べる候補の読み出しと、保存のときの検証・
 * 工程の組み替え。規則そのものは lib/wip-state-core.ts の純ロジックが持つ:
 *
 *   matchWip           どの仕掛品がこの製品に使えるか（ちょうど / 長い / 太い / その他）
 *   validateWipDraws   選び方の検証（同じ加工状態・使える数まで・理由）
 *   planWipStart       どの工程を飛ばすか
 *
 * ここは DB から材料を揃えて渡すだけ。候補の行は在庫管理の仕掛品タブと同じ
 * 読み出し（fetchWipStock）を通す — 行スコープ（保管拠点）と「使える数 =
 * 手持ち − 引当」を 2 か所で別々に決めない。
 */

import { fetchWipStock } from "@/app/(dashboard)/inventory/wip/data";
import type { WipStockRow } from "@/components/inventory/wip/model";
import type { WorkOrderStartWipView } from "@/components/production/work-orders/model";
import { prisma } from "./db";
import { type LocalizedText, localized } from "./format";
import {
  matchWip,
  planWipStart,
  validateWipDraws,
  type WipBucket,
  type WipCandidate,
  type WipDimensionGroup,
  type WipDrawCandidate,
  type WipDrawInput,
  type WipDrawIssue,
  wipStartSkippedStepIds,
} from "./wip-state-core";
import { isUnclassifiedWip } from "./wip-stock-core";
import { loadCatalog, type StepCompositionInput } from "./workflow";
import {
  defaultOrder,
  isStartStep,
  SEMI_FINISHED_ISSUE_STEP_CODE,
} from "./workflow-core";

export type WipCandidateGroup = WipDimensionGroup | "other";

/** 候補 1 行 = 在庫バケット 1 つ（仕掛品タブの行 + 突合の結果）。 */
export interface WipCandidateRow extends WipStockRow {
  group: WipCandidateGroup;
  /** この製品の工程のうち、飛ばせる工程（工程順・名前）。 */
  skippableStepIds: number[];
  /**
   * ほかの指示書（下書き・承認依頼中）が投入に選んでいる数。まだ予約されて
   * いないので「使える数」からは引かれていない — 先に承認されたほうが取る。
   */
  pendingElsewhere: number;
}

export interface WipCandidatesView {
  /** 在庫を見る権限があるか（無ければ候補は出せない）。 */
  permitted: boolean;
  /** 製品が要求する素材（材種・径・長）が決まっているか。 */
  productReady: boolean;
  exact: WipCandidateRow[];
  longer: WipCandidateRow[];
  largerDiameter: WipCandidateRow[];
  other: WipCandidateRow[];
  /** 工程の名前（カタログ id → 名前）— 飛ばす工程の表示に使う。 */
  stepNames: Record<number, string>;
}

const EMPTY_VIEW: WipCandidatesView = {
  permitted: true,
  productReady: false,
  exact: [],
  longer: [],
  largerDiameter: [],
  other: [],
  stepNames: {},
};

const num = (v: unknown): number | null => (v == null ? null : Number(v));

interface RouteContext {
  /** 指示書の工程（工程順 — カタログ既定順）。 */
  route: {
    processStepId: number;
    affectsWipState: boolean;
    isStart: boolean;
  }[];
  /** 形を変える工程の並び（matchWip の相手）。 */
  shapingStepIds: number[];
  stepNames: Record<number, string>;
}

/** 指示書の工程（集合）を、工程順 + 「形を変えるか」「開始工程か」の付いた形へ。 */
async function routeContext(stepIds: readonly number[]): Promise<RouteContext> {
  const [catalog, affects] = await Promise.all([
    loadCatalog(),
    prisma.processStepCatalog.findMany({
      select: { id: true, name: true, affectsWipState: true },
    }),
  ]);
  const byId = new Map(catalog.steps.map((c) => [c.id, c]));
  const affectsOf = new Map(affects.map((c) => [c.id, c.affectsWipState]));
  const ordered = defaultOrder(
    [...new Set(stepIds)].filter((id) => byId.has(id)),
    catalog.steps,
  );
  const route = ordered.map((id) => {
    const c = byId.get(id);
    return {
      processStepId: id,
      affectsWipState: affectsOf.get(id) ?? false,
      isStart: c != null && isStartStep(c),
    };
  });
  const stepNames: Record<number, string> = {};
  for (const c of affects) {
    stepNames[c.id] = localized(c.name as LocalizedText | null);
  }
  return {
    route,
    shapingStepIds: route
      .filter((s) => s.affectsWipState && !s.isStart)
      .map((s) => s.processStepId),
    stepNames,
  };
}

/**
 * 製品に使える仕掛品の候補。
 *
 * `stepIds` = 指示書の工程（**仕掛品で飛ばす前の全体** — 準備 + 製造）。
 * 在庫管理の仕掛品タブは工程リストの最新版から並びを推し量るが、ここは
 * 指示書を組んでいる最中なので、いま組んである構成そのものを相手にする。
 */
export async function loadWipCandidates(args: {
  itemId: number;
  stepIds: readonly number[];
  /** 編集中の指示書（自分の選択は「ほかの指示書」に数えない）。 */
  excludeWorkOrderId?: string | null;
}): Promise<{
  view: WipCandidatesView;
  candidates: WipDrawCandidate[];
  /** 加工状態 id → 済んだ工程の並び。 */
  stateStepIds: Map<number, number[]>;
  ctx: RouteContext;
}> {
  const ctx = await routeContext(args.stepIds);
  const empty = {
    candidates: [],
    stateStepIds: new Map<number, number[]>(),
    ctx,
  };
  const stock = await fetchWipStock([]);
  const product = await prisma.item.findUnique({
    where: { id: args.itemId },
    select: {
      id: true,
      itemType: true,
      requiresMaterialTypeId: true,
      requiresDiameterMm: true,
      requiresLengthMm: true,
    },
  });
  const productReady =
    product != null &&
    product.itemType === "PRODUCT" &&
    product.requiresMaterialTypeId != null &&
    product.requiresDiameterMm != null &&
    product.requiresLengthMm != null;
  if (!productReady || product == null) {
    return {
      ...empty,
      view: { ...EMPTY_VIEW, stepNames: ctx.stepNames },
    };
  }

  const rows = stock.rows.filter((r) => !isUnclassifiedWip(r));
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  const buckets: WipBucket[] = rows.map((r) => ({
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
  const match = matchWip(
    {
      itemId: product.id,
      materialTypeId: product.requiresMaterialTypeId,
      diameterMm: num(product.requiresDiameterMm),
      lengthMm: num(product.requiresLengthMm),
    },
    ctx.shapingStepIds,
    buckets,
  );

  const matchedIds = [
    ...match.exact,
    ...match.longer,
    ...match.largerDiameter,
    ...match.other,
  ].map((c) => c.inventoryId);
  // ほかの指示書がまだ予約せずに選んでいる数（下書き・承認依頼中）。
  const pending =
    matchedIds.length > 0
      ? await prisma.workOrderWipDraw.groupBy({
          by: ["inventoryId"],
          where: {
            inventoryId: { in: matchedIds },
            workOrder: {
              status: { in: ["DRAFT", "PENDING_APPROVAL"] },
              ...(args.excludeWorkOrderId
                ? { id: { not: args.excludeWorkOrderId } }
                : {}),
            },
          },
          _sum: { quantity: true },
        })
      : [];
  const pendingOf = new Map(
    pending.map((p) => [p.inventoryId, p._sum.quantity ?? 0]),
  );

  const candidates: WipDrawCandidate[] = [];
  const stateStepIds = new Map<number, number[]>();
  const toRows = (
    list: readonly WipCandidate[],
    group: WipCandidateGroup,
  ): WipCandidateRow[] =>
    list.flatMap((c) => {
      const row = rowOf.get(c.inventoryId);
      if (!row) return [];
      candidates.push({
        inventoryId: row.id,
        wipStateId: row.wipStateId,
        group,
        available: row.available,
      });
      stateStepIds.set(row.wipStateId, row.stepIds);
      return [
        {
          ...row,
          group,
          skippableStepIds: planWipStart(ctx.route, row.stepIds)
            .skippableStepIds,
          pendingElsewhere: pendingOf.get(row.id) ?? 0,
        },
      ];
    });

  // fetchWipStock は在庫を見る権限が無いと空を返す。候補が空のとき、権限が
  // 無いせいなのか本当に無いのかを画面が言い分けられるようにする。
  const permitted = stock.rows.length > 0 || (await canSeeStock());
  return {
    view: {
      permitted,
      productReady: true,
      exact: toRows(match.exact, "exact"),
      longer: toRows(match.longer, "longer"),
      largerDiameter: toRows(match.largerDiameter, "largerDiameter"),
      other: toRows(match.other, "other"),
      stepNames: ctx.stepNames,
    },
    candidates,
    stateStepIds,
    ctx,
  };
}

async function canSeeStock(): Promise<boolean> {
  const { checkPermission } = await import("./authz");
  return (await checkPermission("inventory", "READ")).ok;
}

/** 保存のときに決まる「仕掛品から始める」の中身。 */
export interface ResolvedWipStart {
  startWipStateId: number;
  draws: WipDrawInput[];
  overrideReason: string | null;
  /** 工程から落とした工程（カタログ id・工程順）。 */
  skippedStepIds: number[];
  /** 半製品出しへ差し替えた元の開始工程（無ければ null）。 */
  replacedStartStepId: number | null;
  /** 半製品出しのカタログ id。 */
  semiIssueStepId: number;
  /** 指示書に作る工程（飛ばす工程を落とし、開始工程を半製品出しへ差し替えたもの）。 */
  steps: StepCompositionInput[];
  /** 構成の検証で「済んでいる」と数える工程。 */
  satisfiedStepIds: number[];
}

export type WipStartError =
  | { kind: "draws"; issue: WipDrawIssue }
  | { kind: "onlyManufacture" }
  | { kind: "semiIssueStepMissing" };

/**
 * 投入する仕掛品の選択を検証し、指示書の工程を組み替える。
 * 何も選んでいなければ null（素材から作る従来の指示書）。
 *
 * `steps` = 指示書の工程の**全体**（準備工程リストの最新版を当てたあと）。
 * 工程リストの版はこの全体から決める（呼び出し側）— 飛ばした形で版を作ると、
 * 1 枚の指示書の都合で製品の工程リストから工程が消える。
 */
export async function resolveWipStart(args: {
  type: "FROM_STOCK" | "MANUFACTURE" | "REGRIND";
  itemId: number;
  steps: readonly StepCompositionInput[];
  draws: readonly WipDrawInput[];
  overrideReason: string | null | undefined;
  redoStepIds: readonly number[];
  excludeWorkOrderId?: string | null;
}): Promise<ResolvedWipStart | { error: WipStartError } | null> {
  if (args.draws.length === 0) return null;
  if (args.type !== "MANUFACTURE") {
    return { error: { kind: "onlyManufacture" } };
  }
  const loaded = await loadWipCandidates({
    itemId: args.itemId,
    stepIds: args.steps.map((s) => s.processStepId),
    excludeWorkOrderId: args.excludeWorkOrderId,
  });
  const checked = validateWipDraws(
    args.draws,
    loaded.candidates,
    args.overrideReason,
  );
  if (checked.issues.length > 0 || checked.wipStateId == null) {
    return {
      error: { kind: "draws", issue: checked.issues[0] ?? "notACandidate" },
    };
  }
  const catalog = await loadCatalog();
  const semiIssue = catalog.steps.find(
    (c) => c.code === SEMI_FINISHED_ISSUE_STEP_CODE,
  );
  if (!semiIssue) return { error: { kind: "semiIssueStepMissing" } };

  const stateStepIds = loaded.stateStepIds.get(checked.wipStateId) ?? [];
  const plan = planWipStart(loaded.ctx.route, stateStepIds, args.redoStepIds);
  const skipped = new Set(plan.skippedStepIds);
  const startIds = new Set(
    loaded.ctx.route.filter((s) => s.isStart).map((s) => s.processStepId),
  );
  const replaced =
    args.steps.find(
      (s) => startIds.has(s.processStepId) && s.processStepId !== semiIssue.id,
    ) ?? null;
  const hasSemiIssue = args.steps.some((s) => s.processStepId === semiIssue.id);

  const steps: StepCompositionInput[] = [];
  for (const s of args.steps) {
    if (skipped.has(s.processStepId)) continue;
    if (startIds.has(s.processStepId) && s.processStepId !== semiIssue.id) {
      // 開始工程は 1 つだけ。元の開始工程（素材出し等）は半製品出しへ差し替える —
      // 実施場所はそのまま引き継ぐ（同じ場所の在庫を出す）。
      if (!hasSemiIssue && s === replaced) {
        steps.push({
          ...s,
          processStepId: semiIssue.id,
          lotInputMode: null,
          inspectionTemplateIds: [],
        });
      }
      continue;
    }
    steps.push(s);
  }
  if (!hasSemiIssue && replaced == null) {
    // 開始工程の無い構成（本来は検証で弾かれる）にも半製品出しを足しておく。
    steps.unshift({
      processStepId: semiIssue.id,
      executionLocation: "INTERNAL",
      plantId: null,
      supplierBpId: null,
      workHours: null,
    });
  }

  return {
    startWipStateId: checked.wipStateId,
    draws: args.draws.map((d) => ({
      inventoryId: d.inventoryId,
      quantity: d.quantity,
    })),
    overrideReason: checked.needsOverride
      ? (args.overrideReason ?? "").trim()
      : null,
    skippedStepIds: plan.skippedStepIds,
    replacedStartStepId: replaced?.processStepId ?? null,
    semiIssueStepId: semiIssue.id,
    steps,
    satisfiedStepIds: [
      ...plan.skippedStepIds,
      ...(replaced ? [replaced.processStepId] : []),
    ],
  };
}

/** 開始状態の表示用の形（指示書の工程と突き合わせて、飛ばした工程を出す）。 */
export function startWipView(args: {
  state: { id: number; name: unknown; stepIds: number[] } | null;
  overrideReason: string | null;
  workOrderProcessStepIds: readonly number[];
  stepNames: ReadonlyMap<number, string>;
}): WorkOrderStartWipView | null {
  if (!args.state) return null;
  const nameOf = (id: number) => args.stepNames.get(id) ?? `#${id}`;
  const stateName =
    args.state.name && typeof args.state.name === "object"
      ? localized(args.state.name as LocalizedText) || null
      : null;
  return {
    wipStateId: args.state.id,
    stateName,
    stepIds: args.state.stepIds,
    stepNames: args.state.stepIds.map(nameOf),
    skippedStepNames: wipStartSkippedStepIds(
      args.state.stepIds,
      args.workOrderProcessStepIds,
    ).map(nameOf),
    overrideReason: args.overrideReason,
  };
}
