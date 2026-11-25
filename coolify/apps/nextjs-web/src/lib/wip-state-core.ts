/**
 * wip-state-core.ts — 仕掛品（途中まで加工した品）の加工状態と突合の純ロジック。
 *
 * 仕掛品は「材種 × 径 × 長」の仕掛ブランク品目（items.item_type = 'BLANK'）に、
 * **加工状態**（= 済んだ形を変える工程の並び。app.wip_states）と、研削後の
 * 仕上がり寸法・目標製品を添えて在庫に置く（_specs/tables.md の在庫節）。
 * ここはその「並び」の作り方・突合の規則だけを持つ。DB も Prisma も読まない。
 *
 * **nextjs-web が原本で、nextjs-kiosk へ逐語コピーする twin file**
 * （共有端末も工程完了で仕掛品を入庫する）。直したら `pnpm twin:sync`。
 *
 * この段（仕掛品の再設計 PR 1）では**誰もまだ呼ばない** — 計上の切り替えは
 * 後の段。既存の半製品の計上（lib/inventory.ts onWorkOrderCompletedTx）は
 * このファイルとは無関係に従来どおり動く。
 */

import {
  isOffMainline,
  START_STEP_CODES,
  type StepLinkState,
  type StepState,
  type WorkflowCtx,
} from "./workflow-core";

// ─── 工程マスタの既定 ───────────────────────────────────────────────────────

/** 既定で加工状態に数える工程カテゴリ（品物の形を変えるもの）。 */
export const WIP_STATE_DEFAULT_CATEGORIES = [
  "MATERIAL_PREP",
  "MACHINING",
  "COATING",
] as const;

/**
 * 工程マスタ（MS08）の `affects_wip_state` の既定 — 新しく作る工程の初期値と、
 * migration の埋め戻し（20261126150000_wip_state_core）が同じ規則。
 *
 * 開始工程（出し・受渡し・製品受入）は在庫を動かすだけなので、カテゴリが
 * 材料準備でも数えない。検査・承認・出荷・再研磨は品物の形を変えない
 * （再研磨は顧客の物で、そもそも仕掛品にならない）。
 */
export function defaultAffectsWipState(step: {
  category: string;
  code: string;
}): boolean {
  if ((START_STEP_CODES as readonly string[]).includes(step.code)) return false;
  return (WIP_STATE_DEFAULT_CATEGORIES as readonly string[]).includes(
    step.category,
  );
}

// ─── 加工状態の署名 ─────────────────────────────────────────────────────────

/**
 * 加工状態の署名 — `wip_states.signature`（一意）の**唯一の作り方**。
 *
 * 並びは順序つき（[円筒, 段加工] と [段加工, 円筒] は別の状態）なので並べ替え
 * ない。同じ工程が 2 回入る（手直しでもう一度通した）ことも許す。
 * 何も済んでいない状態（切り出しただけのブランク等）は空文字。
 */
export function wipSignature(stepIds: readonly number[]): string {
  for (const id of stepIds) {
    if (!Number.isInteger(id) || id <= 0) {
      // i18n-ignore — 画面に出る道が無い内部不変条件（カタログ id は正の整数）
      throw new Error(`invalid process step id in wip state: ${id}`);
    }
  }
  return stepIds.join(",");
}

/** `state` が `route` の先頭部分（prefix）か。空の状態はどの route の prefix でもある。 */
export function isWipPrefix(
  state: readonly number[],
  route: readonly number[],
): boolean {
  if (state.length > route.length) return false;
  return state.every((id, i) => route[i] === id);
}

// ─── 指示書の工程グラフから加工状態を読む ──────────────────────────────────

function orderKey(a: StepState, b: StepState): number {
  return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

function precedes(a: StepState, b: StepState): boolean {
  return orderKey(a, b) < 0;
}

function ctxOf(
  steps: readonly StepState[],
  links: readonly StepLinkState[],
): WorkflowCtx {
  return {
    plannedQuantity: 0,
    steps: [...steps],
    links: [...links],
    execDeps: [],
  };
}

/**
 * 工程の手前の工程（品物がどこから来たか）。**先頭が推奨**で、残りは合流で
 * 入ってくる別の経路。
 *
 * - 分岐系列の工程（オフメインライン）: 手前の工程から入るリンクの元。
 *   系列内の連鎖は動的リンク（routedQuantity = 0）なので、動的を推奨にする。
 * - 本流の工程: 推奨は直前の本流工程（CANCELLED と分岐系列は飛ばす）。
 *   入ってくるリンク（合流してくる分岐）の元は別の経路として後ろに並ぶ —
 *   分岐系列は本流より後ろに並ぶので、合流リンクの元は工程順では後ろにいる。
 *   辿り返しの輪は呼び出し側（wipPathForSource）が切る。
 *
 * 推奨を本流にするのは利用者の決定（2026-11-25）: 合流先から先の品は本流と同じ
 * 形に揃っている見込みが高い。ただし確実ではないので、別の経路も返して
 * 呼び出し側（計上の段）が利用者に確かめられるようにする。
 */
function predecessors(
  step: StepState,
  ctx: WorkflowCtx,
  byId: Map<string, StepState>,
): StepState[] {
  const incoming = ctx.links
    .filter((l) => l.targetStepId === step.id)
    .map((l) => ({ link: l, src: byId.get(l.sourceStepId) }))
    .filter(
      (x): x is { link: StepLinkState; src: StepState } =>
        x.src != null && x.src.status !== "CANCELLED",
    )
    .sort(
      (a, b) =>
        (a.link.routedQuantity <= 0 ? 0 : 1) -
          (b.link.routedQuantity <= 0 ? 0 : 1) || orderKey(b.src, a.src),
    )
    .map((x) => x.src);

  let primary: StepState | null;
  if (isOffMainline(step.id, ctx)) {
    // 分岐系列に入ってきた元（手前に並ぶ工程）。後ろに並ぶ工程からのリンクは
    // 別の系列が合流してきたもの。
    primary = incoming.find((s) => precedes(s, step)) ?? null;
  } else {
    const mainline = ctx.steps
      .filter(
        (s) =>
          s.status !== "CANCELLED" &&
          !isOffMainline(s.id, ctx) &&
          precedes(s, step),
      )
      .sort(orderKey);
    primary = mainline[mainline.length - 1] ?? null;
  }
  const out: StepState[] = primary ? [primary] : [];
  for (const s of incoming) if (!out.includes(s)) out.push(s);
  return out;
}

export interface WipPathOptions {
  /**
   * 発生元の工程そのものを済んだ工程に数えるか（既定 true）。
   *
   * 分岐系列の終端で「半製品在庫へ」置いた品はその工程を終えている（true）。
   * 工程の途中で半製品に振り分けた品（output_defect_semi_finished）は、その
   * 工程を**終えていない**（false）— 済んだことにすると、次の指示書がその
   * 工程を飛ばして形の足りない品を流す（利用者の決定 2026-11-25）。
   * `semiFinishedSourcePath` はこの区別を発生元の種類から決める。
   */
  includeSource?: boolean;
}

/** 加工状態の推定結果。 */
export interface WipPath {
  /** 推奨の並び（合流では本流を辿ったもの）。 */
  stepIds: number[];
  /**
   * 発生元の手前に合流があり、別の経路を辿ると**違う並び**になる。
   * true のとき、計上の段は推奨を既定にして利用者に確かめること。
   */
  ambiguous: boolean;
  /** 推奨と異なる並び（重複なし・見つかった順）。ambiguous=false なら空。 */
  alternatives: number[][];
}

/** 経路の列挙の上限（合流が重なる指示書で組み合わせが爆発しないように）。 */
const MAX_WIP_PATHS = 16;

/**
 * 発生元の工程までに品物が通った、**加工状態に数える工程**（カタログ id）の並び。
 *
 * 開始工程から発生元まで手前の工程を辿り（`predecessors` — 先頭が推奨）、
 * 早い順に並べ、`affectsWipState` が true のカタログ工程だけを残す。
 * 手前の工程のうち未着手（PENDING）のものは品物が通っていないので数えない。
 *
 * 発生元の手前に合流があれば、合流してくる側を辿った並びも `alternatives` に
 * 返す（推奨と同じ並びになるものは数えない — 違いが無ければ聞く必要も無い）。
 */
export function wipPathForSource(
  steps: readonly StepState[],
  links: readonly StepLinkState[],
  sourceStepId: string,
  affectsWipState: (processStepId: number) => boolean,
  options: WipPathOptions = {},
): WipPath {
  const includeSource = options.includeSource ?? true;
  const ctx = ctxOf(steps, links);
  const byId = new Map(steps.map((s) => [s.id, s]));
  const source = byId.get(sourceStepId);
  if (!source) return { stepIds: [], ambiguous: false, alternatives: [] };

  const toStepIds = (chain: readonly StepState[]): number[] => {
    const out: number[] = [];
    for (const s of [...chain].reverse()) {
      if (s.id === source.id) {
        if (!includeSource) continue;
      } else if (s.status === "PENDING" || s.status === "CANCELLED") {
        continue;
      }
      if (affectsWipState(s.processStepId)) out.push(s.processStepId);
    }
    return out;
  };

  // 深さ優先で、推奨（先頭の手前工程）から順に経路を列挙する。
  // 最初に見つかる経路が推奨の経路になる。
  const chains: StepState[][] = [];
  const walk = (cur: StepState, chain: StepState[]) => {
    if (chains.length >= MAX_WIP_PATHS) return;
    const next = [...chain, cur];
    const preds = predecessors(cur, ctx, byId).filter((p) => !next.includes(p));
    if (preds.length === 0) {
      chains.push(next);
      return;
    }
    for (const p of preds) walk(p, next);
  };
  walk(source, []);

  const stepIds = toStepIds(chains[0] ?? [source]);
  const seen = new Set([wipSignature(stepIds)]);
  const alternatives: number[][] = [];
  for (const chain of chains.slice(1)) {
    const ids = toStepIds(chain);
    const sig = wipSignature(ids);
    if (seen.has(sig)) continue;
    seen.add(sig);
    alternatives.push(ids);
  }
  return { stepIds, ambiguous: alternatives.length > 0, alternatives };
}

/** 半製品の発生元の種類。 */
export type SemiFinishedSourceKind =
  /** 工程の途中で半製品に振り分けた分（output_defect_semi_finished）。 */
  | "DEFECT"
  /** 「半製品在庫へ」で終わる分岐系列の終端の残良品。 */
  | "BRANCH_TERMINAL";

export interface SemiFinishedSource {
  stepId: string;
  kind: SemiFinishedSourceKind;
  quantity: number;
}

/** 本流で、自分より後ろに（CANCELLED 以外の）本流工程があるか。 */
function hasMainlineSuccessor(step: StepState, ctx: WorkflowCtx): boolean {
  if (isOffMainline(step.id, ctx)) return false;
  return ctx.steps.some(
    (s) =>
      s.id !== step.id &&
      s.status !== "CANCELLED" &&
      !isOffMainline(s.id, ctx) &&
      precedes(step, s),
  );
}

/**
 * 指示書の完了で半製品として在庫に入る数を、**発生元の工程ごと**に割ったもの。
 *
 * いまの計上（onWorkOrderCompletedTx）は
 *   Σ 全工程の output_defect_semi_finished + computeBranchSemiFinishedQuantity
 * を 1 本のバケットに入れている。仕掛品では発生元ごとに加工状態が違うので、
 * 同じ合計を工程ごとに割る（合計が変わらないことは試験で縛ってある）。
 *
 * 分岐終端の数え方は workflow-core の sumUnroutedGood と同じ: 良品がどこにも
 * 流れない（動的流出も本流の後続も無い）COMPLETED 工程の残良品で、静的流出は
 * 工程分岐から先に引き当てる。
 *
 * 並びは工程順（sortOrder, id）。同じ工程から両方の種類が出ることもある。
 */
export function computeSemiFinishedSources(
  steps: readonly StepState[],
  links: readonly StepLinkState[],
): SemiFinishedSource[] {
  const ctx = ctxOf(steps, links);
  const out: SemiFinishedSource[] = [];
  for (const s of [...steps].sort(orderKey)) {
    const defect = s.defectSemiFinished ?? 0;
    if (defect > 0) {
      out.push({ stepId: s.id, kind: "DEFECT", quantity: defect });
    }
    if (s.status !== "COMPLETED" || s.branchStock !== "SEMI_FINISHED") continue;
    const outgoing = links.filter((l) => l.sourceStepId === s.id);
    if (outgoing.some((l) => l.routedQuantity <= 0)) continue;
    if (hasMainlineSuccessor(s, ctx)) continue;
    const staticOut = outgoing.reduce((sum, l) => sum + l.routedQuantity, 0);
    const rework = s.defectRework ?? 0;
    const success = s.outputSuccess ?? 0;
    const qty = Math.max(0, success - Math.max(0, staticOut - rework));
    if (qty > 0) {
      out.push({ stepId: s.id, kind: "BRANCH_TERMINAL", quantity: qty });
    }
  }
  return out;
}

/**
 * 半製品の発生元 1 件の加工状態。途中で振り分けた分（DEFECT）は発生元の工程を
 * 済んだことにしない（`WipPathOptions.includeSource` の説明）。
 */
export function semiFinishedSourcePath(
  steps: readonly StepState[],
  links: readonly StepLinkState[],
  source: Pick<SemiFinishedSource, "stepId" | "kind">,
  affectsWipState: (processStepId: number) => boolean,
): WipPath {
  return wipPathForSource(steps, links, source.stepId, affectsWipState, {
    includeSource: source.kind === "BRANCH_TERMINAL",
  });
}

// ─── 突合（どの仕掛品をこの製品に使えるか） ───────────────────────────────

/** 突合の相手 — 作りたい製品が要求する素材（items.requires_*）。 */
export interface WipMatchProduct {
  itemId: number;
  materialTypeId: number | null;
  diameterMm: number | null;
  lengthMm: number | null;
}

/** 仕掛品バケット 1 つ（ブランクの寸法は品目側、状態と仕上がりはバケット側）。 */
export interface WipBucket {
  inventoryId: string;
  /** ブランクの材種・径・長（items.material_type_id / diameter_mm / length_mm）。 */
  materialTypeId: number | null;
  diameterMm: number | null;
  lengthMm: number | null;
  /** 加工状態（wip_states.step_ids）。 */
  stepIds: readonly number[];
  /** 研削後の仕上がり寸法（あれば突合に効く）。 */
  finishedDiameterMm?: number | null;
  finishedLengthMm?: number | null;
  /** 目標製品。作りたい製品と同じなら順位が上がる。 */
  aimedItemId?: number | null;
  /** 使える数（手持ち − 引当）。0 以下は候補にしない。 */
  available: number;
  /** 古い順に使う（FIFO）ための時刻とロット。どちらも無ければ後ろへ。 */
  receivedAt?: Date | string | null;
  lotNumber?: number | null;
}

/** 寸法の上での区分（3 つは別々に見せる — 利用者の決定 2026-11-25）。 */
export type WipDimensionGroup = "exact" | "longer" | "largerDiameter";

export interface WipCandidate extends WipBucket {
  dimensionGroup: WipDimensionGroup;
  /** 製品の工程のうち、まだ残っている形を変える工程（prefix のときだけ）。 */
  remainingStepIds: number[] | null;
}

export interface WipMatchResult {
  /** 同じ径・同じ長。 */
  exact: WipCandidate[];
  /** 同じ径で長い（切って使う）。 */
  longer: WipCandidate[];
  /** 太い（長さは足りている）。削って使う。 */
  largerDiameter: WipCandidate[];
  /**
   * 寸法は使えるが、加工状態が製品の工程の先頭部分になっていない
   * （製品の工程に無い加工が済んでいる / 順序が違う）。使うには人の判断が要る。
   */
  other: WipCandidate[];
}

const EPS = 1e-6;
const eq = (a: number, b: number) => Math.abs(a - b) < EPS;
const gt = (a: number, b: number) => a - b >= EPS;
const ge = (a: number, b: number) => a - b > -EPS;

/** 寸法の区分。使えない（細い・短い・寸法不明）なら null。 */
function dimensionGroupOf(
  product: WipMatchProduct,
  b: WipBucket,
): WipDimensionGroup | null {
  const D = product.diameterMm;
  const L = product.lengthMm;
  if (D == null || L == null || b.diameterMm == null || b.lengthMm == null) {
    return null;
  }
  let group: WipDimensionGroup;
  if (eq(b.diameterMm, D) && eq(b.lengthMm, L)) group = "exact";
  else if (eq(b.diameterMm, D) && gt(b.lengthMm, L)) group = "longer";
  else if (gt(b.diameterMm, D) && ge(b.lengthMm, L)) group = "largerDiameter";
  else return null;

  // 研削後の仕上がり寸法は、ブランクの寸法より強い — もう削ってしまった品は
  // ブランクが太くても細い。区分ごとに、仕上がりが製品の要求を満たすこと。
  const fd = b.finishedDiameterMm;
  const fl = b.finishedLengthMm;
  if (group === "exact") {
    if (fd != null && !eq(fd, D)) return null;
    if (fl != null && !eq(fl, L)) return null;
  } else if (group === "longer") {
    if (fd != null && !eq(fd, D)) return null;
    if (fl != null && !ge(fl, L)) return null;
  } else {
    if (fd != null && !ge(fd, D)) return null;
    if (fl != null && !ge(fl, L)) return null;
  }
  return group;
}

function timeOf(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** null を後ろへ回す昇順比較。 */
function nullsLast(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function rank(productItemId: number) {
  return (a: WipCandidate, b: WipCandidate): number => {
    const aimA = a.aimedItemId === productItemId ? 0 : 1;
    const aimB = b.aimedItemId === productItemId ? 0 : 1;
    return (
      aimA - aimB ||
      nullsLast(timeOf(a.receivedAt), timeOf(b.receivedAt)) ||
      nullsLast(a.lotNumber ?? null, b.lotNumber ?? null) ||
      a.inventoryId.localeCompare(b.inventoryId)
    );
  };
}

/**
 * 製品に使える仕掛品の候補を、寸法の区分ごとに分けて返す。
 *
 * - **材種が同じ**ことは必須（違えば候補にしない）。
 * - 寸法: exact = 同じ径・同じ長 / longer = 同じ径で長い /
 *   largerDiameter = 太い（長さは足りる）。細い・短いものは使えないので出さない。
 *   仕上がり寸法があればそれも満たすこと（`dimensionGroupOf`）。
 * - 加工状態: 製品の形を変える工程の並び（`routePartChangingStepIds`）の
 *   **先頭部分**であること。そうでないものは寸法の区分に関わらず `other`。
 * - 各区分の中は、目標製品がこの製品のもの → 古い順（FIFO）。
 */
export function matchWip(
  product: WipMatchProduct,
  routePartChangingStepIds: readonly number[],
  buckets: readonly WipBucket[],
): WipMatchResult {
  const result: WipMatchResult = {
    exact: [],
    longer: [],
    largerDiameter: [],
    other: [],
  };
  if (product.materialTypeId == null) return result;

  for (const b of buckets) {
    if (!(b.available > 0)) continue;
    if (b.materialTypeId !== product.materialTypeId) continue;
    const dimensionGroup = dimensionGroupOf(product, b);
    if (dimensionGroup == null) continue;
    const prefix = isWipPrefix(b.stepIds, routePartChangingStepIds);
    const candidate: WipCandidate = {
      ...b,
      dimensionGroup,
      remainingStepIds: prefix
        ? routePartChangingStepIds.slice(b.stepIds.length)
        : null,
    };
    if (!prefix) result.other.push(candidate);
    else result[dimensionGroup].push(candidate);
  }

  const byRank = rank(product.itemId);
  result.exact.sort(byRank);
  result.longer.sort(byRank);
  result.largerDiameter.sort(byRank);
  result.other.sort(byRank);
  return result;
}
