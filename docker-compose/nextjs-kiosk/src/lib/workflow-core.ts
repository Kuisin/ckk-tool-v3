/**
 * workflow-core.ts — 製造ワークフローの純ロジック（ビルダー側）。
 *
 * 工程カタログの使用依存（use deps）に対する構成検証と必須随伴工程の解決。
 * Prisma I/O は持たない（server 側は lib/workflow.ts）。実行側
 * （canStartStep / 数量伝播）は PR 3 で追加する。
 *
 * 依存セマンティクス（migration の seed 規約と一致）:
 * - AND エッジ: 依存先がすべてワークフローに存在すること（不足 = エラー）。
 * - OR エッジ群: 1 工程の OR エッジ全体で 1 グループ。いずれか存在すれば充足。
 *   全員不在は「警告」に留める — 素材属性由来の条件（素材が研磨・定尺 等）は
 *   エッジ化されておらず、グループ全不在で充足されるケースがあるため。
 * - is_negation（排他）: 依存先が存在してはならない（存在 = エラー）。
 */

/** 工程の数量管理モード（app.QUANTITY_TRACKING）。 */
export type QuantityTrackingMode = "NONE" | "FLOW" | "INSPECTION";

export interface CatalogStep {
  id: number;
  code: string;
  nameJa: string;
  category: string;
  executionLocation: string;
  isSyncCapable: boolean;
  isInspection: boolean;
  isApprovalStep: boolean;
  quantityTracking: QuantityTrackingMode;
  /** 既定作業時間 (h) — ルート/指示書ビルダーの初期値（任意）。 */
  defaultWorkHours?: number | null;
  sortOrder: number;
}

/**
 * 数量フィールドの表示ラベル（モード別）。INSPECTION は同じ列を
 * 検査数/合格/不合格として扱う（保存則の数式は FLOW と同一）。
 */
export const QUANTITY_LABELS: Record<
  QuantityTrackingMode,
  {
    input: string;
    success: string;
    semi: string;
    scrap: string;
    rework: string;
  }
> = {
  FLOW: {
    input: "受入数",
    success: "良品数",
    semi: "半製品",
    scrap: "廃棄",
    rework: "工程分岐",
  },
  INSPECTION: {
    input: "検査数",
    success: "合格数",
    semi: "不合格（半製品）",
    scrap: "不合格（廃棄）",
    rework: "不合格（工程分岐）",
  },
  NONE: {
    input: "受入数",
    success: "良品数",
    semi: "半製品",
    scrap: "廃棄",
    rework: "工程分岐",
  },
};

// ─── 工程構成の区分（開始・出荷） ────────────────────────────────────────────
//
// 工程構成は必ず「出し・受渡し」のいずれかで始まり、出荷系（任意）は常に
// 末尾（出荷前検査 → 出荷）。カタログの sort_order は管理者が変えられるので、
// 区分の同定は code で行い、並びは orderRank で強制する。

/** 開始工程（出し・受渡し）— 全ての工程構成はこのいずれかで始まる。 */
export const START_STEP_CODES = [
  "MATERIAL_ISSUE",
  "SEMI_FINISHED_ISSUE",
  "MATERIAL_HANDOFF",
  "PRODUCT_HANDOFF",
  "PRODUCT_ISSUE",
] as const;

/** 在庫分（FROM_STOCK）専用の開始工程。製造分の構成には含めない。 */
export const STOCK_ISSUE_STEP_CODE = "PRODUCT_ISSUE";

/**
 * 出荷側の工程（任意・常に末尾）。出荷前検査のみ — **出荷そのものは工程では
 * なく出荷書（delivery_orders / SH01）が管理する**（旧 SHIPPING 工程は廃止）。
 */
export const SHIP_STEP_CODES = ["PRE_SHIP_INSPECTION"] as const;

export function isStartStep(step: Pick<CatalogStep, "code">): boolean {
  return (START_STEP_CODES as readonly string[]).includes(step.code);
}

export function isShipStep(step: Pick<CatalogStep, "code">): boolean {
  return (SHIP_STEP_CODES as readonly string[]).includes(step.code);
}

/** 並び区分: 0 = 開始 / 1 = 中間 / 2 = 出荷前検査（常に末尾）。 */
function orderRank(code: string): number {
  if ((START_STEP_CODES as readonly string[]).includes(code)) return 0;
  if ((SHIP_STEP_CODES as readonly string[]).includes(code)) return 2;
  return 1;
}

export interface UseDep {
  stepId: number;
  dependsOnStepId: number;
  relation: "AND" | "OR";
  isNegation: boolean;
}

export interface ExecDep {
  stepId: number;
  dependsOnStepId: number;
  relation: "AND" | "OR";
}

export type CompositionIssueKind =
  | "MISSING_AND" // AND 依存先が未選択（ブロック）
  | "MISSING_OR_GROUP" // OR グループ全員不在（警告 — 素材属性で充足の可能性）
  | "EXCLUSION" // 排他工程が同時選択（ブロック）
  | "MISSING_START"; // 開始工程（出し・受渡し）が無い（ブロック）

export interface CompositionIssue {
  stepId: number;
  kind: CompositionIssueKind;
  /** 依存先 stepId（OR グループは全員）。 */
  relatedStepIds: number[];
}

/** issue がブロッカー（保存不可）か。OR 全不在は警告扱い。 */
export function isBlockingIssue(issue: CompositionIssue): boolean {
  return issue.kind !== "MISSING_OR_GROUP";
}

/**
 * 選択された工程集合の構成検証。
 * 返る issue は選択工程ごとに: 不足 AND（1 件ずつ）/ 全不在 OR グループ
 * （グループで 1 件）/ 排他違反（1 件ずつ）。
 */
export function validateComposition(
  selected: readonly number[],
  useDeps: readonly UseDep[],
  /**
   * カタログを渡すと開始工程ルールも検証する（未指定なら従来どおり依存のみ —
   * 呼び出し側の移行を壊さないための後方互換）。
   */
  catalog?: readonly CatalogStep[],
): CompositionIssue[] {
  const sel = new Set(selected);
  const issues: CompositionIssue[] = [];

  // 全ての工程構成は「出し・受渡し」のいずれかで始まる（§7）。
  if (catalog && selected.length > 0) {
    const byId = new Map(catalog.map((c) => [c.id, c]));
    const hasStart = selected.some((id) => {
      const step = byId.get(id);
      return step != null && isStartStep(step);
    });
    if (!hasStart) {
      issues.push({
        stepId: selected[0],
        kind: "MISSING_START",
        relatedStepIds: catalog.filter((c) => isStartStep(c)).map((c) => c.id),
      });
    }
  }

  for (const stepId of selected) {
    const deps = useDeps.filter((d) => d.stepId === stepId);
    const orGroup: number[] = [];

    for (const d of deps) {
      if (d.isNegation) {
        if (sel.has(d.dependsOnStepId)) {
          issues.push({
            stepId,
            kind: "EXCLUSION",
            relatedStepIds: [d.dependsOnStepId],
          });
        }
        continue;
      }
      if (d.relation === "AND") {
        if (!sel.has(d.dependsOnStepId)) {
          issues.push({
            stepId,
            kind: "MISSING_AND",
            relatedStepIds: [d.dependsOnStepId],
          });
        }
      } else {
        orGroup.push(d.dependsOnStepId);
      }
    }

    if (orGroup.length > 0 && !orGroup.some((id) => sel.has(id))) {
      issues.push({
        stepId,
        kind: "MISSING_OR_GROUP",
        relatedStepIds: orGroup,
      });
    }
  }

  return issues;
}

/**
 * AND 依存（非排他）の推移的閉包 — 「必須工程を自動追加」用。
 * 選択集合に不足している AND 依存先を、その依存先の依存も含めて返す。
 */
export function requiredCompanions(
  selected: readonly number[],
  useDeps: readonly UseDep[],
): number[] {
  const result = new Set(selected);
  const queue = [...selected];
  while (queue.length > 0) {
    const stepId = queue.pop();
    if (stepId == null) break;
    for (const d of useDeps) {
      if (
        d.stepId === stepId &&
        d.relation === "AND" &&
        !d.isNegation &&
        !result.has(d.dependsOnStepId)
      ) {
        result.add(d.dependsOnStepId);
        queue.push(d.dependsOnStepId);
      }
    }
  }
  return [...result].filter((id) => !selected.includes(id));
}

/**
 * 先行前提 — AND 使用依存のうち、依存先がカタログ既定順で**自分より前**に
 * 来るもの（例: C面 → 全長合わせ、ホーニング → 先端）。UI はこの前提が
 * 選択されるまでチェックボックスを無効化して「要: X」を出す。
 * 依存先が後ろに来る AND（加工 → 検査・承認）は随伴 — 選択時に自動追加する。
 */
export function stepPrerequisites(
  stepId: number,
  useDeps: readonly UseDep[],
  catalog: readonly CatalogStep[],
): number[] {
  const order = new Map(catalog.map((c) => [c.id, c.sortOrder]));
  const own = order.get(stepId);
  if (own == null) return [];
  return useDeps
    .filter(
      (d) =>
        d.stepId === stepId &&
        d.relation === "AND" &&
        !d.isNegation &&
        (order.get(d.dependsOnStepId) ?? Number.MAX_SAFE_INTEGER) < own,
    )
    .map((d) => d.dependsOnStepId);
}

/** 排他相手（negation の使用依存 — 双方向に見る）。 */
export function stepExclusions(
  stepId: number,
  useDeps: readonly UseDep[],
): number[] {
  const out = new Set<number>();
  for (const d of useDeps) {
    if (!d.isNegation) continue;
    if (d.stepId === stepId) out.add(d.dependsOnStepId);
    if (d.dependsOnStepId === stepId) out.add(d.stepId);
  }
  return [...out];
}

/**
 * いま選択に追加できるか — 未充足の先行前提と、選択中の排他相手を返す。
 * どちらも空ならチェック可能。
 */
export function stepSelectBlockers(
  stepId: number,
  selected: readonly number[],
  useDeps: readonly UseDep[],
  catalog: readonly CatalogStep[],
): { missingPrereqs: number[]; conflicts: number[] } {
  const sel = new Set(selected);
  return {
    missingPrereqs: stepPrerequisites(stepId, useDeps, catalog).filter(
      (id) => !sel.has(id),
    ),
    conflicts: stepExclusions(stepId, useDeps).filter((id) => sel.has(id)),
  };
}

/**
 * カタログ既定順で並べた工程 id 列。区分（開始 → 中間 → 出荷前検査 → 出荷）を
 * 最優先し、区分内は sortOrder → id。sort_order の管理変更で出荷系が
 * 中間へ紛れ込まないよう、区分は code で強制する。
 */
export function defaultOrder(
  selected: readonly number[],
  catalog: readonly CatalogStep[],
): number[] {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const key = (id: number): [number, number, number] => {
    const step = byId.get(id);
    return [step ? orderRank(step.code) : 1, step?.sortOrder ?? 0, id];
  };
  return [...selected].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  });
}

// ─── 実行側（§7: 開始可否・数量伝播・DAG 検証・レイアウト） ─────────────────

export type StepRunStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

/**
 * 分岐系列の終端で良品を入れる在庫（work_order_steps.branch_stock_disposition）。
 * 合流する分岐では null。
 */
export type BranchStockDisposition = "SEMI_FINISHED" | "PRODUCT";

export interface StepState {
  id: string; // work_order_steps.id (uuid)
  processStepId: number; // カタログ id（実行依存の解決キー）
  status: StepRunStatus;
  sortOrder: number;
  inputQuantity: number | null;
  outputSuccess: number | null;
  defectSemiFinished: number | null;
  defectScrap: number | null;
  defectRework: number | null;
  sessionLockedBy: string | null;
  /**
   * 分岐系列の終端処理。値があれば「ここで系列が終わり、良品はこの在庫へ入る」。
   * null = 合流する（終端から本流へリンクがある）か、分岐系列ではない工程。
   */
  branchStock?: BranchStockDisposition | null;
}

export interface StepLinkState {
  sourceStepId: string;
  targetStepId: string;
  routedQuantity: number;
}

// ── DB 行 → StepState（サーバー側 ctx ビルダー共用） ─────────────────────────
//
// エンジンに渡す work_order_steps は必ずこの select + mapper を通すこと。
// `steps: true`（全列 SELECT）にすると 2 つの事故が起きる:
//   1. 列が増えるたび、migration がまだの DB に対して P2022 で落ちる
//      （Coolify のデプロイに migration は含まれず手動 — この窓は実際に開く。
//      dev で branch_stock_disposition 追加時に SH03 が 500 になった）。
//   2. 手書きのフィールド写しが増え、branchStock のような後付け列の
//      写し忘れで完成数の計算が黙って狂う（半製品行きの分岐終端を
//      完成品として数える）。

/** エンジンが読む work_order_steps の列（Prisma の select にそのまま渡す）。 */
export const STEP_STATE_SELECT = {
  id: true,
  processStepId: true,
  status: true,
  sortOrder: true,
  inputQuantity: true,
  outputSuccessQuantity: true,
  outputDefectSemiFinished: true,
  outputDefectScrap: true,
  outputDefectRework: true,
  sessionLockedBy: true,
  branchStockDisposition: true,
} as const;

/** エンジンが読む work_order_step_links の列。 */
export const STEP_LINK_STATE_SELECT = {
  sourceStepId: true,
  targetStepId: true,
  routedQuantity: true,
} as const;

/** STEP_STATE_SELECT で取れる行（Prisma の生成型に依存しない構造型）。 */
export interface StepStateRow {
  id: string;
  processStepId: number;
  status: StepRunStatus;
  sortOrder: number;
  inputQuantity: number | null;
  outputSuccessQuantity: number | null;
  outputDefectSemiFinished: number | null;
  outputDefectScrap: number | null;
  outputDefectRework: number | null;
  sessionLockedBy: string | null;
  branchStockDisposition: BranchStockDisposition | null;
}

export function toStepState(row: StepStateRow): StepState {
  return {
    id: row.id,
    processStepId: row.processStepId,
    status: row.status,
    sortOrder: row.sortOrder,
    inputQuantity: row.inputQuantity,
    outputSuccess: row.outputSuccessQuantity,
    defectSemiFinished: row.outputDefectSemiFinished,
    defectScrap: row.outputDefectScrap,
    defectRework: row.outputDefectRework,
    sessionLockedBy: row.sessionLockedBy,
    branchStock: row.branchStockDisposition,
  };
}

export interface WorkflowCtx {
  plannedQuantity: number;
  steps: StepState[];
  links: StepLinkState[];
  execDeps: ExecDep[];
}

export interface QuantityIssue {
  kind: "NEGATIVE" | "CONSERVATION" | "ROUTING";
  message: string;
}

/**
 * 工程を開始してよいか（§7 実行依存 + DAG + ロック）。
 * - 実行依存は「この指示書に存在する工程」に対してのみ評価（不在 = 空真 —
 *   素材属性条件・省略工程・動的順序に対応）。AND は全完了、OR 群は 1 つ完了。
 * - 分岐エッジの流入元（incoming links）はすべて完了していること。
 * - 既に開始/完了/中止済み・他者のセッションロック中は不可。
 */
export function canStartStep(
  stepId: string,
  ctx: WorkflowCtx,
  actorId?: string | null,
): { ok: boolean; reasons: string[] } {
  const step = ctx.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, reasons: ["工程が見つかりません"] };
  const reasons: string[] = [];

  if (step.status !== "PENDING")
    reasons.push("この工程は開始できる状態ではありません");
  if (step.sessionLockedBy && step.sessionLockedBy !== actorId)
    reasons.push("別のユーザーがセッション中です");

  // カタログ実行依存 — 指示書内に存在する工程のみで評価
  const byCatalog = new Map<number, StepState[]>();
  for (const s of ctx.steps) {
    if (s.status === "CANCELLED") continue;
    const list = byCatalog.get(s.processStepId) ?? [];
    list.push(s);
    byCatalog.set(s.processStepId, list);
  }
  const deps = ctx.execDeps.filter((d) => d.stepId === step.processStepId);
  const orGroup: number[] = [];
  for (const d of deps) {
    const targets = byCatalog.get(d.dependsOnStepId);
    if (!targets || targets.length === 0) continue; // 不在 = 空真
    if (d.relation === "AND") {
      if (!targets.every((t) => t.status === "COMPLETED"))
        reasons.push(`実行依存が未完了です（工程 ${d.dependsOnStepId}）`);
    } else {
      orGroup.push(d.dependsOnStepId);
    }
  }
  if (orGroup.length > 0) {
    const satisfied = orGroup.some((cid) =>
      (byCatalog.get(cid) ?? []).some((t) => t.status === "COMPLETED"),
    );
    if (!satisfied) reasons.push("実行依存（いずれか）が未完了です");
  }

  // 流入エッジ（分岐合流）はすべて完了
  for (const l of ctx.links) {
    if (l.targetStepId !== stepId) continue;
    const src = ctx.steps.find((s) => s.id === l.sourceStepId);
    if (src && src.status !== "COMPLETED" && src.status !== "CANCELLED")
      reasons.push("分岐元の工程が未完了です");
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * 分岐で作られた工程（オフメインライン）か。
 * 「自分より小さい (sortOrder, id) の工程からの流入リンクを持つ」= 分岐系列の
 * 工程。成立条件（サーバーで強制）: 分岐工程は常に既存 max sortOrder より上へ
 * 追加し、合流先はメインライン工程のみ許可する。合流エッジは必ず
 * 高 sortOrder → 低 sortOrder になるため、合流先はオフメインラインに
 * 分類されない。
 */
export function isOffMainline(stepId: string, ctx: WorkflowCtx): boolean {
  const step = ctx.steps.find((s) => s.id === stepId);
  if (!step) return false;
  return ctx.links.some((l) => {
    if (l.targetStepId !== stepId) return false;
    const src = ctx.steps.find((s) => s.id === l.sourceStepId);
    if (!src) return false;
    return (
      src.sortOrder < step.sortOrder ||
      (src.sortOrder === step.sortOrder && src.id.localeCompare(step.id) < 0)
    );
  });
}

/**
 * リンクの実効数量: 静的（routedQuantity > 0）はその値。動的
 * （routedQuantity = 0 — 「分岐元の良品全量を運ぶ」規約。分岐チェーン内・
 * 合流エッジで使い、上流の不良発生に追従する）は分岐元が COMPLETED なら
 * その良品数、未完了なら null（未確定）。
 */
export function resolveLinkQuantity(
  link: StepLinkState,
  steps: readonly StepState[],
): number | null {
  if (link.routedQuantity > 0) return link.routedQuantity;
  const src = steps.find((s) => s.id === link.sourceStepId);
  if (!src || src.status !== "COMPLETED") return null;
  return src.outputSuccess ?? null;
}

/** 対象より後ろに（sortOrder, id 順で）メインライン工程が存在するか。 */
function hasMainlineSuccessor(step: StepState, ctx: WorkflowCtx): boolean {
  if (isOffMainline(step.id, ctx)) return false;
  return ctx.steps.some(
    (s) =>
      s.id !== step.id &&
      s.status !== "CANCELLED" &&
      !isOffMainline(s.id, ctx) &&
      (s.sortOrder > step.sortOrder ||
        (s.sortOrder === step.sortOrder && s.id.localeCompare(step.id) > 0)),
  );
}

/**
 * 工程の想定受入数。
 * - オフメインライン工程（分岐系列）: Σ流入エッジの実効数量。
 * - メインライン工程: 直前のメインライン工程（sortOrder 順・CANCELLED と
 *   オフメインラインをスキップ）の良品数（先頭は予定数量）+ Σ流入エッジ
 *   （合流分の加算 — 合流先はメインラインの流れに分岐分が合流する）。
 * いずれも未確定（前工程未記録・分岐元未完了）が混ざれば null。
 */
export function expectedInput(stepId: string, ctx: WorkflowCtx): number | null {
  const step = ctx.steps.find((s) => s.id === stepId);
  if (!step) return null;

  const incoming = ctx.links.filter((l) => l.targetStepId === stepId);
  let linkSum = 0;
  for (const l of incoming) {
    const q = resolveLinkQuantity(l, ctx.steps);
    if (q == null) return null; // 分岐元が未完了/未記録 → 未確定
    linkSum += q;
  }
  if (isOffMainline(stepId, ctx)) return linkSum;

  const ordered = [...ctx.steps]
    .filter((s) => s.status !== "CANCELLED")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const idx = ordered.findIndex((s) => s.id === stepId);
  if (idx < 0) return null;
  // 直前のメインライン工程の良品数を継ぐ（分岐系列の工程はスキップ）
  for (let i = idx - 1; i >= 0; i--) {
    const prev = ordered[i];
    if (isOffMainline(prev.id, ctx)) continue;
    if (prev.outputSuccess == null) return null; // 前工程が未記録
    return prev.outputSuccess + linkSum;
  }
  return ctx.plannedQuantity + linkSum;
}

/**
 * 分岐可能数量: 分岐元から新たに静的エッジで流せる残数。
 * 良品はメインラインの次工程（または動的流出エッジ）へ全量流れるため、
 * 基本は工程分岐数のみ。流し先を持たない終端工程（メインライン後続なし・
 * 動的流出なし）に限り 良品 + 工程分岐 まで。既存の静的流出分は差し引く。
 * 分岐元が未完了なら null。
 */
export function branchableQuantity(
  sourceStepId: string,
  ctx: WorkflowCtx,
): number | null {
  const step = ctx.steps.find((s) => s.id === sourceStepId);
  if (!step || step.status !== "COMPLETED") return null;
  const outgoing = ctx.links.filter((l) => l.sourceStepId === sourceStepId);
  const staticOut = outgoing.reduce(
    (s, l) => s + (l.routedQuantity > 0 ? l.routedQuantity : 0),
    0,
  );
  const hasDynamicOut = outgoing.some((l) => l.routedQuantity <= 0);
  const rework = step.defectRework ?? 0;
  const success = step.outputSuccess ?? 0;
  const base =
    hasDynamicOut || hasMainlineSuccessor(step, ctx)
      ? rework
      : success + rework;
  return Math.max(0, base - staticOut);
}

/**
 * 完成数: 良品がどこにも流れない COMPLETED 工程の残良品の合計
 * （指示書完了時の入庫数）。動的流出エッジ or メインライン後続を持つ工程は
 * 0（良品は次工程へ流れる）。静的流出は工程分岐から優先して引き当て、
 * 良品から流出した分だけ差し引く。
 */
export function computeFinishedQuantity(
  steps: readonly StepState[],
  links: readonly StepLinkState[],
): number {
  // 半製品在庫で終わる分岐の終端は完成数に数えない（半製品として入庫する）。
  return sumUnroutedGood(
    steps,
    links,
    (s) => s.branchStock !== "SEMI_FINISHED",
  );
}

/**
 * 半製品在庫へ入る分岐終端の良品合計（指示書完了時の半製品入庫に足す分）。
 * 工程ごとの半製品バケット（defectSemiFinished）とは別の経路で、
 * 「分岐系列を最後まで流して半製品として置いておく」分がこれにあたる。
 */
export function computeBranchSemiFinishedQuantity(
  steps: readonly StepState[],
  links: readonly StepLinkState[],
): number {
  return sumUnroutedGood(
    steps,
    links,
    (s) => s.branchStock === "SEMI_FINISHED",
  );
}

/**
 * 「良品がどこにも流れない COMPLETED 工程の残良品」を、条件に合う工程だけ
 * 合計する。動的流出エッジ or メインライン後続を持つ工程は 0（次工程へ流れる）。
 * 静的流出は工程分岐から優先して引き当て、良品から流出した分だけ差し引く。
 */
function sumUnroutedGood(
  steps: readonly StepState[],
  links: readonly StepLinkState[],
  include: (s: StepState) => boolean,
): number {
  const ctx: WorkflowCtx = {
    plannedQuantity: 0,
    steps: [...steps],
    links: [...links],
    execDeps: [],
  };
  let total = 0;
  for (const s of steps) {
    if (s.status !== "COMPLETED") continue;
    if (!include(s)) continue;
    const outgoing = links.filter((l) => l.sourceStepId === s.id);
    if (outgoing.some((l) => l.routedQuantity <= 0)) continue; // 動的流出あり
    if (hasMainlineSuccessor(s, ctx)) continue; // 良品は次工程へ
    const staticOut = outgoing.reduce((sum, l) => sum + l.routedQuantity, 0);
    const rework = s.defectRework ?? 0;
    const success = s.outputSuccess ?? 0;
    total += Math.max(0, success - Math.max(0, staticOut - rework));
  }
  return total;
}

/** 分岐系列 1 本（分岐元 → 系列の工程列 → 終端の行き先）。 */
export interface BranchSeries {
  /** 分岐元（本流側の工程）。見つからなければ null。 */
  sourceId: string | null;
  /** 系列の先頭工程。 */
  headId: string;
  /** 系列の工程（先頭から終端まで、たどった順）。 */
  stepIds: string[];
  /** 系列の終端工程。 */
  terminalId: string;
  /** 合流先（本流の工程）。在庫で終わる系列では null。 */
  mergeTargetId: string | null;
  /** 在庫で終わる場合の行き先。合流する系列では null。 */
  stockDisposition: BranchStockDisposition | null;
}

/**
 * 分岐系列の一覧。オフメインライン工程を、動的エッジ優先で辿って 1 本にまとめる
 * （WorkOrderStepsPanel のネスト表示と同じ辿り方）。
 */
export function branchSeriesList(ctx: WorkflowCtx): BranchSeries[] {
  const ordered = [...ctx.steps].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
  const offIds = new Set(
    ordered.filter((s) => isOffMainline(s.id, ctx)).map((s) => s.id),
  );
  const assigned = new Set<string>();
  const out: BranchSeries[] = [];
  for (const s of ordered) {
    if (!offIds.has(s.id) || assigned.has(s.id)) continue;
    const headLink = ctx.links.find((l) => {
      if (l.targetStepId !== s.id) return false;
      const src = ordered.find((t) => t.id === l.sourceStepId);
      return (
        !!src &&
        (src.sortOrder < s.sortOrder ||
          (src.sortOrder === s.sortOrder && src.id.localeCompare(s.id) < 0))
      );
    });
    const stepIds: string[] = [];
    let mergeTargetId: string | null = null;
    let cur: StepState | undefined = s;
    let terminalId = s.id;
    while (cur && !assigned.has(cur.id)) {
      assigned.add(cur.id);
      stepIds.push(cur.id);
      terminalId = cur.id;
      const currentId: string = cur.id;
      const outs: StepLinkState[] = ctx.links.filter(
        (l) => l.sourceStepId === currentId,
      );
      // チェーン継続は動的エッジ（0）優先。本流に着いたらそれが合流先。
      const orderedOuts: StepLinkState[] = [
        ...outs.filter((l) => l.routedQuantity <= 0),
        ...outs.filter((l) => l.routedQuantity > 0),
      ];
      cur = undefined;
      for (const l of orderedOuts) {
        if (!offIds.has(l.targetStepId)) {
          mergeTargetId = l.targetStepId;
          continue;
        }
        if (!assigned.has(l.targetStepId)) {
          cur = ordered.find((t) => t.id === l.targetStepId);
          break;
        }
      }
    }
    const terminal = ordered.find((t) => t.id === terminalId);
    out.push({
      sourceId: headLink?.sourceStepId ?? null,
      headId: s.id,
      stepIds,
      terminalId,
      mergeTargetId,
      stockDisposition: terminal?.branchStock ?? null,
    });
  }
  return out;
}

/**
 * 分岐は必ず「本流へ合流」か「在庫へ」で終わる（§7）。どちらでもない系列を
 * 返す — 空配列なら OK。画面はボタンを止めるために、サーバーは保存を弾く
 * ために同じものを使う。
 *
 * 既存データには終端未設定の系列が残りうるので、**保存時の入力検証**として
 * 使い、既存行を読むだけの画面では警告表示に留める（勝手に直さない —
 * 半製品か製品か、合流かは業務判断のため）。
 */
export function danglingBranches(ctx: WorkflowCtx): BranchSeries[] {
  return branchSeriesList(ctx).filter(
    (b) => b.mergeTargetId == null && b.stockDisposition == null,
  );
}

/**
 * 数量整合（§7）: 良品 + 半製品 + 廃棄 + 工程分岐 = 受入。全て 0 以上。
 * INSPECTION は同一の数式（合格 + 不合格 = 検査数）でラベルのみ変わる。
 * NONE は入力を検証しない（サーバーがパススルー値を自動生成する）。
 */
export function validateQuantities(
  step: {
    inputQuantity: number | null;
    outputSuccess: number | null;
    defectSemiFinished: number | null;
    defectScrap: number | null;
    defectRework: number | null;
  },
  mode: QuantityTrackingMode = "FLOW",
): QuantityIssue[] {
  if (mode === "NONE") return [];
  const labels = QUANTITY_LABELS[mode];
  const issues: QuantityIssue[] = [];
  const input = step.inputQuantity ?? 0;
  const success = step.outputSuccess ?? 0;
  const semi = step.defectSemiFinished ?? 0;
  const scrap = step.defectScrap ?? 0;
  const rework = step.defectRework ?? 0;
  for (const [label, v] of [
    [labels.input, input],
    [labels.success, success],
    [labels.semi, semi],
    [labels.scrap, scrap],
    [labels.rework, rework],
  ] as const) {
    if (v < 0)
      issues.push({
        kind: "NEGATIVE",
        message: `${label}は 0 以上で入力してください`,
      });
  }
  if (success + semi + scrap + rework !== input) {
    issues.push({
      kind: "CONSERVATION",
      message:
        mode === "INSPECTION"
          ? `合格 + 不合格（半製品・廃棄・工程分岐）の合計（${success + semi + scrap + rework}）が検査数（${input}）と一致しません`
          : `良品 + 不良（半製品・廃棄・工程分岐）の合計（${success + semi + scrap + rework}）が受入数（${input}）と一致しません`,
    });
  }
  return issues;
}

/**
 * 分岐ルーティング整合: 静的エッジ（routedQuantity > 0）の合計が
 * 良品 + 工程分岐 を超えないこと（半製品・廃棄はフロー外）。動的エッジ
 * （0 = 良品全量）は定義上自己整合のため対象外。
 */
export function validateRouting(
  step: { outputSuccess: number | null; defectRework: number | null },
  outgoing: readonly StepLinkState[],
): QuantityIssue[] {
  if (outgoing.length === 0) return [];
  const staticTotal = outgoing.reduce(
    (s, l) => s + (l.routedQuantity > 0 ? l.routedQuantity : 0),
    0,
  );
  const limit = (step.outputSuccess ?? 0) + (step.defectRework ?? 0);
  if (staticTotal > limit) {
    return [
      {
        kind: "ROUTING",
        message: `分岐数量の合計（${staticTotal}）が 良品 + 工程分岐（${limit}）を超えています`,
      },
    ];
  }
  return [];
}

/** DAG 形状検証: 自己ループ・未知端点・閉路の検出（Kahn）。 */
export function validateDagShape(
  steps: readonly { id: string }[],
  links: readonly StepLinkState[],
): string[] {
  const ids = new Set(steps.map((s) => s.id));
  const errors: string[] = [];
  for (const l of links) {
    if (l.sourceStepId === l.targetStepId)
      errors.push("自己ループは作成できません");
    if (!ids.has(l.sourceStepId) || !ids.has(l.targetStepId))
      errors.push("リンクの端点が指示書外です");
  }
  if (errors.length > 0) return errors;

  const indeg = new Map<string, number>();
  for (const s of steps) indeg.set(s.id, 0);
  for (const l of links)
    indeg.set(l.targetStepId, (indeg.get(l.targetStepId) ?? 0) + 1);
  const queue = [...indeg.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.pop();
    if (id == null) break;
    visited++;
    for (const l of links) {
      if (l.sourceStepId !== id) continue;
      const d = (indeg.get(l.targetStepId) ?? 0) - 1;
      indeg.set(l.targetStepId, d);
      if (d === 0) queue.push(l.targetStepId);
    }
  }
  if (visited < steps.length) errors.push("分岐が循環しています");
  return errors;
}

export interface GraphNode {
  id: string;
  layer: number; // フロー方向の位置（縦レイアウトでは Y）
  row: number; // レーン（0 = メインライン、1.. = 分岐系列。縦レイアウトでは X）
}

export interface GraphEdge {
  from: string;
  to: string;
  label: string;
  /** flow = メインラインの暗黙フロー / link = 分岐・合流エッジ。 */
  kind: "flow" | "link";
}

/**
 * DAG の層状レイアウト（SVG 縦描画用）。layer はフロー方向（エッジに沿って
 * 単調増加）、row はレーン（メインライン = 0、分岐系列ごとに 1, 2, …）。
 * エッジは明示リンクに加え、メインライン隣接工程間の暗黙フロー
 * （kind: "flow"、無ラベル）を含む — 直列指示書でもフローが描ける。
 */
export function layoutWorkflowGraph(
  steps: readonly StepState[],
  links: readonly StepLinkState[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const ctx: WorkflowCtx = {
    plannedQuantity: 0,
    steps: [...steps],
    links: [...links],
    execDeps: [],
  };
  const ordered = [...steps].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
  const mainline = ordered.filter((s) => !isOffMainline(s.id, ctx));

  // エッジ = メインライン隣接の暗黙フロー + 明示リンク（動的は解決値/全量）
  const edges: GraphEdge[] = [];
  for (let i = 0; i + 1 < mainline.length; i++) {
    edges.push({
      from: mainline[i].id,
      to: mainline[i + 1].id,
      label: "",
      kind: "flow",
    });
  }
  for (const l of links) {
    const resolved = resolveLinkQuantity(l, ordered);
    edges.push({
      from: l.sourceStepId,
      to: l.targetStepId,
      label:
        l.routedQuantity > 0
          ? String(l.routedQuantity)
          : resolved != null
            ? String(resolved)
            : "全量",
      kind: "link",
    });
  }

  // layer: メインライン順で初期化し、エッジ制約（to > from）を反復緩和。
  // 上限つきで収束させる（想定外の閉路があっても停止する）。
  const layer = new Map<string, number>();
  mainline.forEach((s, i) => {
    layer.set(s.id, i);
  });
  for (const s of ordered) if (!layer.has(s.id)) layer.set(s.id, 0);
  for (let pass = 0; pass < edges.length + ordered.length + 1; pass++) {
    let changed = false;
    for (const e of edges) {
      const from = layer.get(e.from) ?? 0;
      const to = layer.get(e.to) ?? 0;
      if (to <= from) {
        layer.set(e.to, from + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // レーン割当: 分岐系列（動的チェーンで続く一連のオフメインライン工程）
  // ごとに 1, 2, …。チェーン継続は動的エッジ優先（静的はフォールバック）。
  const laneOf = new Map<string, number>();
  let nextLane = 1;
  for (const s of ordered) {
    if (!isOffMainline(s.id, ctx) || laneOf.has(s.id)) continue;
    const lane = nextLane++;
    let cur: StepState | undefined = s;
    while (cur && !laneOf.has(cur.id)) {
      laneOf.set(cur.id, lane);
      const outs = links.filter((l) => l.sourceStepId === cur?.id);
      const nextIds = [
        ...outs.filter((l) => l.routedQuantity <= 0),
        ...outs.filter((l) => l.routedQuantity > 0),
      ].map((l) => l.targetStepId);
      cur = undefined;
      for (const id of nextIds) {
        if (laneOf.has(id) || !isOffMainline(id, ctx)) continue;
        cur = ordered.find((t) => t.id === id);
        break;
      }
    }
  }

  const nodes: GraphNode[] = ordered.map((s) => ({
    id: s.id,
    layer: layer.get(s.id) ?? 0,
    row: laneOf.get(s.id) ?? 0,
  }));
  return { nodes, edges };
}

/** 仕掛数（WIP）: IN_PROGRESS は受入数、開始可能な PENDING は想定受入。 */
export function computeWipByStep(
  ctx: WorkflowCtx,
): { stepId: string; processStepId: number; wip: number }[] {
  const result: { stepId: string; processStepId: number; wip: number }[] = [];
  for (const s of ctx.steps) {
    if (s.status === "IN_PROGRESS") {
      result.push({
        stepId: s.id,
        processStepId: s.processStepId,
        wip: s.inputQuantity ?? 0,
      });
    } else if (s.status === "PENDING") {
      const upstream = canStartStep(s.id, ctx);
      if (upstream.ok) {
        const exp = expectedInput(s.id, ctx);
        if (exp != null && exp > 0)
          result.push({
            stepId: s.id,
            processStepId: s.processStepId,
            wip: exp,
          });
      }
    }
  }
  return result;
}

/** 全工程完了か（CANCELLED は除外）。1 つも実工程が無ければ false。 */
export function isWorkOrderComplete(ctx: WorkflowCtx): boolean {
  const active = ctx.steps.filter((s) => s.status !== "CANCELLED");
  return active.length > 0 && active.every((s) => s.status === "COMPLETED");
}

/**
 * 下流工程の閉包（DAG 到達性）: 線形の次工程（分岐系列の工程はスキップ —
 * expectedInput と同じ規則）+ 流出エッジ先を辿った集合。巻き戻しガードは
 * sortOrder ではなくこれで判定する（合流先は分岐工程より小さい sortOrder を
 * 持ち得るため）。
 */
export function downstreamStepIds(stepId: string, ctx: WorkflowCtx): string[] {
  const ordered = ctx.steps
    .filter((s) => s.status !== "CANCELLED")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const linearNext = (id: string): string | null => {
    const idx = ordered.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    for (let i = idx + 1; i < ordered.length; i++) {
      if (!isOffMainline(ordered[i].id, ctx)) return ordered[i].id;
    }
    return null;
  };

  const seen = new Set<string>();
  const queue = [stepId];
  while (queue.length > 0) {
    const cur = queue.pop();
    if (cur == null) break;
    const nexts: string[] = [];
    const ln = linearNext(cur);
    if (ln) nexts.push(ln);
    for (const l of ctx.links) {
      if (l.sourceStepId === cur) nexts.push(l.targetStepId);
    }
    for (const n of nexts) {
      if (n !== stepId && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return [...seen];
}
