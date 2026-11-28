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
 * 計上（lib/inventory.ts onWorkOrderCompletedTx）は第 3 段からここを通る:
 * 発生元ごとの行き先は `planWipPostings`、工程完了のときに記録する仕上がり寸法と
 * 経路の確認は `validateWipRecording`、半製品の投入の順は
 * `orderSemiFinishedForConsumption`。画面（Web・共有端末）はこの 3 つの結果を
 * 見せるだけで、規則を持たない。
 */

import {
  type BranchStockDisposition,
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
 * migration の埋め戻し（20261126170000_wip_state_core）が同じ規則。
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

// ─── 在庫に置くときの記録（仕上がり寸法・経路の確認）と計上の行き先 ────────

/** 仕掛ブランクの寸法（材種 × 径 × 長）。 */
export interface WipBlankSize {
  materialTypeId: number;
  diameterMm: number;
  lengthMm: number;
}

/**
 * 指示書の仕掛ブランク — 材種・径は指示書の素材から、長さは製品の要求長から。
 * 指示書に素材が無ければ（または素材に材種・径が無ければ）製品の要求素材へ落ちる。
 * どれかが決まらなければ null（計上は製品の行のまま「未分類」へ落ちる）。
 *
 * 移行（20261126200000_wip_backfill の app.wip_legacy_bucket）もこの規則で
 * 既存の半製品を振り分けた。
 */
export function wipBlankFor(args: {
  material: { materialTypeId: number | null; diameterMm: number | null } | null;
  product: {
    requiresMaterialTypeId: number | null;
    requiresDiameterMm: number | null;
    requiresLengthMm: number | null;
  };
}): WipBlankSize | null {
  let mt = args.material?.materialTypeId ?? null;
  let d = args.material?.diameterMm ?? null;
  if (mt == null || d == null) {
    mt = args.product.requiresMaterialTypeId;
    d = args.product.requiresDiameterMm;
  }
  const l = args.product.requiresLengthMm;
  if (mt == null || d == null || l == null) return null;
  return { materialTypeId: mt, diameterMm: d, lengthMm: l };
}

/**
 * 工程に記録する経路（`work_order_steps.wip_path_step_ids`）の形 —
 * **発生元の工程そのものを含めない**並び。途中で振り分けた分（DEFECT）は
 * これがそのまま加工状態で、分岐の終端（BRANCH_TERMINAL）はこれに発生元を
 * 足したものが加工状態（`wipStateForSource`）。含めない形で 1 つだけ持てば、
 * 同じ工程から両方の種類が出ても 1 列で足りる。
 */
export function wipRecordingPath(
  steps: readonly StepState[],
  links: readonly StepLinkState[],
  stepId: string,
  affectsWipState: (processStepId: number) => boolean,
  /**
   * 指示書の開始状態（在庫の仕掛品から始めた指示書の、投入した仕掛品で済んで
   * いた工程 — work_orders.start_wip_state_id）。**頭に付ける** — 指示書の工程には
   * 載っていない（作成時に落としてある）ので、付けないと「続きから作った品」が
   * 浅い加工状態で在庫に戻り、次の指示書が済んでいる工程をもう一度流す。
   */
  startStepIds: readonly number[] = [],
): WipPath {
  const path = wipPathForSource(steps, links, stepId, affectsWipState, {
    includeSource: false,
  });
  if (startStepIds.length === 0) return path;
  return {
    stepIds: [...startStepIds, ...path.stepIds],
    ambiguous: path.ambiguous,
    alternatives: path.alternatives.map((a) => [...startStepIds, ...a]),
  };
}

/** 経路（発生元を含めない並び）から、発生元の種類に応じた加工状態を作る。 */
export function wipStateForSource(
  upstreamStepIds: readonly number[],
  sourceProcessStepId: number,
  kind: SemiFinishedSourceKind,
  affectsWipState: (processStepId: number) => boolean,
): number[] {
  return kind === "BRANCH_TERMINAL" && affectsWipState(sourceProcessStepId)
    ? [...upstreamStepIds, sourceProcessStepId]
    : [...upstreamStepIds];
}

/**
 * 工程 1 件の「在庫に置く分」を記録するための材料 — サーバー（lib/wip-recording.ts）
 * が揃えて画面へ渡す形（シリアライズ可能）。画面はこれとこのファイルの関数だけで描く。
 */
export interface WipRecordingView {
  /**
   * 経路（この工程自身を含めない、済んだ形を変える工程の並び）。
   * `stepIds` が推奨、`alternatives` が合流してきた側を辿った別案。
   */
  path: WipPath;
  /** この工程自身が加工状態に数える工程か（工程マスタ affects_wip_state）。 */
  sourceAffects: boolean;
  /** この工程のカタログ id（分岐の終端では加工状態の末尾に入る）。 */
  sourceProcessStepId: number;
  /** 分岐系列の終端処理（SEMI_FINISHED なら良品が仕掛品として在庫に入る）。 */
  branchStock: BranchStockDisposition | null;
  /** 仕掛ブランクの寸法（仕上がり寸法の既定）。決まらなければ null。 */
  blank: { diameterMm: number; lengthMm: number } | null;
  /** 工程名（カタログ id → 多言語名の JSON）— 加工状態のラベルを組むのに使う。 */
  stepNames: Record<number, unknown>;
}

/** `validateWipRecording` が返す不備（文言は各アプリが自分の辞書で当てる）。 */
export type WipRecordingIssue =
  | "finishedDiameterRequired"
  | "finishedLengthRequired"
  | "finishedDiameterInvalid"
  | "finishedLengthInvalid"
  | "pathChoiceRequired"
  | "pathChoiceInvalid";

export interface WipRecordingInput {
  finishedDiameterMm?: number | null;
  finishedLengthMm?: number | null;
  /** 選んだ経路（発生元を含めない並び）。曖昧でなければ無視する。 */
  pathStepIds?: number[] | null;
}

export interface WipRecordingValue {
  finishedDiameterMm: number | null;
  finishedLengthMm: number | null;
  /** 工程に保存する経路。曖昧でなければ null（推奨のまま）。 */
  pathStepIds: number[] | null;
}

/** 仕上がり寸法の上限（mm）— 桁あふれと打ち間違いを止めるだけの緩い上限。 */
const MAX_FINISHED_DIAMETER_MM = 9999;
const MAX_FINISHED_LENGTH_MM = 99999;

function validDimension(v: number | null | undefined, max: number): boolean {
  return v != null && Number.isFinite(v) && v > 0 && v <= max;
}

/**
 * 品物が工程を離れて在庫に入るか — 半製品の数を記録した（> 0）か、
 * 「半製品在庫へ」で終わる分岐の終端で良品がある。**仕上がり寸法と経路の確認が
 * 要るのはこのときだけ**（利用者の決定 2026-11-25）。
 */
export function storesWip(q: {
  defectSemiFinished: number | null;
  outputSuccess: number | null;
  branchStock?: string | null;
}): boolean {
  return (
    (q.defectSemiFinished ?? 0) > 0 ||
    (q.branchStock === "SEMI_FINISHED" && (q.outputSuccess ?? 0) > 0)
  );
}

/**
 * この完了で在庫に入る仕掛品の加工状態（発生元の種類ごと）。画面はこれで
 * 「この数はこの加工状態で在庫に入る」を見せ、仕上がり寸法が必須か
 * （どれかの加工状態に形を変える工程が入っているか）を決める。
 * 在庫に置かない完了なら空。
 */
export function wipRecordingStates(
  q: { defectSemiFinished: number | null; outputSuccess: number | null },
  source: {
    branchStock?: string | null;
    sourceAffects: boolean;
    sourceProcessStepId: number;
  },
  upstreamStepIds: readonly number[],
): { kind: SemiFinishedSourceKind; stepIds: number[] }[] {
  const out: { kind: SemiFinishedSourceKind; stepIds: number[] }[] = [];
  if ((q.defectSemiFinished ?? 0) > 0) {
    out.push({ kind: "DEFECT", stepIds: [...upstreamStepIds] });
  }
  if (source.branchStock === "SEMI_FINISHED" && (q.outputSuccess ?? 0) > 0) {
    out.push({
      kind: "BRANCH_TERMINAL",
      stepIds: wipStateForSource(
        upstreamStepIds,
        source.sourceProcessStepId,
        "BRANCH_TERMINAL",
        () => source.sourceAffects,
      ),
    });
  }
  return out;
}

/**
 * 工程完了のときに記録する「在庫に置く分」の検証 — Web と共有端末の両方が
 * これを通す（規則を 2 か所に書かない）。
 *
 * - 在庫に置かない（`stores` = false）なら何も要らない。入力は捨てる。
 * - **経路**: 手前に合流があって加工状態が一通りに決まらないとき
 *   （`path.ambiguous`）は、記録する人が選ぶ（推奨 = 本流が既定で選ばれている）。
 *   選んだ並びは候補（推奨 + 別案）のどれかでなければならない。
 *   曖昧でなければ保存しない（null = 推奨のまま）。
 * - **仕上がり寸法**: 形を変える工程が加工状態に 1 つでも入っていれば必須。
 *   1 つも無ければ（切り出しただけ等）ブランクの寸法を既定にする —
 *   入力があればそれを優先する。ブランクが決まらない指示書では空のまま通す。
 *
 * `sourceCountsAsDone` = この工程自身が加工状態に入るか（分岐の終端で、
 * 工程が加工状態に数える工程のとき）。
 */
export function validateWipRecording(args: {
  stores: boolean;
  path: WipPath;
  sourceCountsAsDone: boolean;
  blank: Pick<WipBlankSize, "diameterMm" | "lengthMm"> | null;
  input: WipRecordingInput | null | undefined;
}): { issues: WipRecordingIssue[]; value: WipRecordingValue } {
  const empty: WipRecordingValue = {
    finishedDiameterMm: null,
    finishedLengthMm: null,
    pathStepIds: null,
  };
  if (!args.stores) return { issues: [], value: empty };

  const issues: WipRecordingIssue[] = [];
  const input = args.input ?? {};

  let upstream = args.path.stepIds;
  let pathStepIds: number[] | null = null;
  if (args.path.ambiguous) {
    if (input.pathStepIds == null) {
      issues.push("pathChoiceRequired");
    } else {
      let sig: string | null = null;
      try {
        sig = wipSignature(input.pathStepIds);
      } catch {
        sig = null;
      }
      const options = [args.path.stepIds, ...args.path.alternatives];
      const hit =
        sig == null ? undefined : options.find((o) => wipSignature(o) === sig);
      if (!hit) issues.push("pathChoiceInvalid");
      else {
        upstream = hit;
        pathStepIds = [...hit];
      }
    }
  }

  const shaped = upstream.length > 0 || args.sourceCountsAsDone;
  let d = input.finishedDiameterMm ?? null;
  let l = input.finishedLengthMm ?? null;
  if (d == null) {
    if (shaped) issues.push("finishedDiameterRequired");
    else d = args.blank?.diameterMm ?? null;
  } else if (!validDimension(d, MAX_FINISHED_DIAMETER_MM)) {
    issues.push("finishedDiameterInvalid");
  }
  if (l == null) {
    if (shaped) issues.push("finishedLengthRequired");
    else l = args.blank?.lengthMm ?? null;
  } else if (!validDimension(l, MAX_FINISHED_LENGTH_MM)) {
    issues.push("finishedLengthInvalid");
  }

  return {
    issues,
    value:
      issues.length > 0
        ? empty
        : { finishedDiameterMm: d, finishedLengthMm: l, pathStepIds },
  };
}

/** 画面の入力（下書き）。経路は候補の番号で持つ（0 = 推奨）。 */
export interface WipRecordingDraft {
  finishedDiameterMm: number | null;
  finishedLengthMm: number | null;
  pathIndex: number;
}

/** 経路の候補 — 先頭が推奨（本流）。 */
export function wipPathOptions(path: WipPath): number[][] {
  return [path.stepIds, ...path.alternatives];
}

/**
 * 画面の下書きを、サーバーと**同じ規則**で確かめる（Web と共有端末の入力欄が
 * 使う）。返す `input` をそのまま完了の要求に載せる。
 *
 * - `states` が空 = この完了では在庫に置かない → 入力欄を出さない。
 * - `dimensionsRequired` = どれかの加工状態に形を変える工程が入っている。
 * - `issues` があれば完了ボタンを止める（サーバーも同じ理由で拒む）。
 */
export function checkWipRecordingDraft(
  view: WipRecordingView,
  q: { defectSemiFinished: number | null; outputSuccess: number | null },
  draft: WipRecordingDraft,
): {
  states: { kind: SemiFinishedSourceKind; stepIds: number[] }[];
  dimensionsRequired: boolean;
  input: WipRecordingInput | null;
  issues: WipRecordingIssue[];
} {
  const options = wipPathOptions(view.path);
  const upstream = options[draft.pathIndex] ?? options[0];
  const states = wipRecordingStates(q, view, upstream);
  if (states.length === 0) {
    return { states, dimensionsRequired: false, input: null, issues: [] };
  }
  const input: WipRecordingInput = {
    finishedDiameterMm: draft.finishedDiameterMm,
    finishedLengthMm: draft.finishedLengthMm,
    pathStepIds: view.path.ambiguous ? [...upstream] : null,
  };
  const { issues } = validateWipRecording({
    stores: true,
    path: view.path,
    sourceCountsAsDone: states.some(
      (s) => s.kind === "BRANCH_TERMINAL" && view.sourceAffects,
    ),
    blank: view.blank,
    input,
  });
  return {
    states,
    dimensionsRequired: states.some((s) => s.stepIds.length > 0),
    input,
    issues,
  };
}

/**
 * `work_order_steps.wip_path_step_ids`（JSON 配列）を読む。正の整数の配列で
 * なければ null（= 推奨のまま）— 壊れた値で計上を止めない。
 */
export function parseWipPathStepIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids: number[] = [];
  for (const v of value) {
    if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) return null;
    ids.push(v);
  }
  return ids;
}

/** 計上が読む工程 — エンジンの状態に、工程に記録した 3 つを足したもの。 */
export interface WipPostingStep extends StepState {
  finishedDiameterMm?: number | null;
  finishedLengthMm?: number | null;
  /** 記録した経路（発生元を含めない並び）。null = 推奨のまま。 */
  wipPathStepIds?: readonly number[] | null;
}

/** 指示書の完了で入れる仕掛品 1 本（発生元 1 件 = 1 本）。 */
export interface WipPosting {
  sourceStepId: string;
  kind: SemiFinishedSourceKind;
  quantity: number;
  /** 加工状態（wip_states.step_ids）。 */
  stepIds: number[];
  finishedDiameterMm: number | null;
  finishedLengthMm: number | null;
}

/**
 * 指示書の完了で入れる仕掛品の一覧 — **発生元ごとに 1 本**。
 *
 * 数は `computeSemiFinishedSources` そのまま（合計は従来の 1 本にまとめた計上と
 * 同じ — 試験で縛ってある）。加工状態は工程に記録した経路があればそれ、無ければ
 * 推奨（本流）。仕上がり寸法は工程に記録した値、無ければ「形を変える工程が
 * 1 つも済んでいない」ときだけブランクの寸法。
 *
 * **ここは落とさない。** 記録が欠けている（旧アプリが完了させた工程・一括完了）
 * からといって指示書の完了を止めると、現場では終わっている指示書が画面の上だけ
 * 終われなくなる。必須の検証は工程完了の入口（validateWipRecording）の仕事。
 */
export function planWipPostings(
  steps: readonly WipPostingStep[],
  links: readonly StepLinkState[],
  affectsWipState: (processStepId: number) => boolean,
  blank: Pick<WipBlankSize, "diameterMm" | "lengthMm"> | null,
  /**
   * 指示書の開始状態（`wipRecordingPath` の説明）。工程に記録した経路
   * （wipPathStepIds）は記録の時点で頭に付いているので、ここで付けるのは
   * 記録が無く推奨を計算し直すときだけ。
   */
  startStepIds: readonly number[] = [],
): WipPosting[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const out: WipPosting[] = [];
  for (const source of computeSemiFinishedSources(steps, links)) {
    const step = byId.get(source.stepId);
    if (!step) continue;
    const upstream =
      step.wipPathStepIds ??
      wipRecordingPath(steps, links, step.id, affectsWipState, startStepIds)
        .stepIds;
    const stepIds = wipStateForSource(
      upstream,
      step.processStepId,
      source.kind,
      affectsWipState,
    );
    const unshaped = stepIds.length === 0;
    out.push({
      sourceStepId: step.id,
      kind: source.kind,
      quantity: source.quantity,
      stepIds,
      finishedDiameterMm:
        step.finishedDiameterMm ??
        (unshaped ? (blank?.diameterMm ?? null) : null),
      finishedLengthMm:
        step.finishedLengthMm ?? (unshaped ? (blank?.lengthMm ?? null) : null),
    });
  }
  return out;
}

/**
 * 指示書の工程のうち、形を変える工程（カタログ id）の並び — 本流だけ、工程順。
 * 半製品を投入する指示書が「どの加工状態の仕掛品なら続きから作れるか」を
 * 判定するのに使う（`isWipPrefix` の相手）。
 */
export function mainlinePartChangingStepIds(
  steps: readonly StepState[],
  links: readonly StepLinkState[],
  affectsWipState: (processStepId: number) => boolean,
): number[] {
  const ctx = ctxOf(steps, links);
  return [...steps]
    .filter((s) => s.status !== "CANCELLED" && !isOffMainline(s.id, ctx))
    .sort(orderKey)
    .map((s) => s.processStepId)
    .filter(affectsWipState);
}

/**
 * 半製品の投入で、どのバケットから先に落とすか。
 *
 * 1. 狙いのロット（工程の伝票欄から読めたもの）
 * 2. **この指示書のブランク**に載っていて、加工状態が指示書の工程の先頭部分に
 *    なっているもの（続きから作れる）
 * 3. それ以外（同じ目標製品の残り — 未分類・状態が合わないもの）
 *
 * 同じ段の中は渡された順（呼び出し側が古い順に並べて渡す）を保つ。
 * 別の製品を目標にした仕掛品を引くのは後の段（PR 5）— ここには渡されない。
 */
export function orderSemiFinishedForConsumption<
  T extends {
    itemId: number;
    lotNumber: number | null;
    /** 加工状態の並び。未分類（is_legacy）は null。 */
    stepIds: readonly number[] | null;
  },
>(
  buckets: readonly T[],
  args: {
    blankItemId: number | null;
    routeStepIds: readonly number[];
    lotHint: number | null;
  },
): T[] {
  const score = (b: T): number => {
    if (args.lotHint != null && b.lotNumber === args.lotHint) return 0;
    const compatible =
      args.blankItemId != null &&
      b.itemId === args.blankItemId &&
      b.stepIds != null &&
      isWipPrefix(b.stepIds, args.routeStepIds);
    return compatible ? 1 : 2;
  };
  return buckets
    .map((b, i) => ({ b, i, s: score(b) }))
    .sort((x, y) => x.s - y.s || x.i - y.i)
    .map((x) => x.b);
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

// ─── 在庫の仕掛品から指示書を始める ───────────────────────────────────────

/** 指示書の工程 1 つ（工程順に並べて渡す）。 */
export interface WipStartRouteStep {
  processStepId: number;
  /** 加工状態に数える工程か（工程マスタ affects_wip_state）。 */
  affectsWipState: boolean;
  /** 開始工程（出し・受渡し）か。開始工程は飛ばさず、半製品出しへ差し替える。 */
  isStart: boolean;
}

export interface WipStartPlan {
  /** 仕掛品の加工状態が、製品の工程の**先頭部分**になっているか。 */
  isPrefix: boolean;
  /** 先頭から一致した、形を変える工程の数。 */
  matched: number;
  /**
   * 飛ばせる工程（工程順）— 一致した最後の形を変える工程まで。その手前に挟まる
   * 形を変えない工程（途中の検査など）も含む: 品物はもうそこを通り過ぎている。
   * 一致した最後の工程より**後ろ**の検査・承認は含めない（済んだかどうかを
   * 加工状態からは言えないので、やり直す側に倒す）。
   */
  skippableStepIds: number[];
  /** 実際に飛ばす工程 = 飛ばせる工程 −「この工程はもう一度行う」と選んだ工程。 */
  skippedStepIds: number[];
}

/**
 * 在庫の仕掛品から始める指示書で、**どの工程を飛ばすか**の唯一の規則。
 * 画面（指示書ビルダーの灰色表示）とサーバー（工程の作成）が同じ関数を通す。
 *
 * 飛ばすのは「仕掛品で済んでいる」と言える工程だけ — 製品の形を変える工程の
 * 並びと、仕掛品の加工状態が**先頭から一致した分**。長い・太い仕掛品でも規則は
 * 同じで、状態に入っていない切断・研削は残る（寸法を合わせる工程を勝手に
 * 飛ばさない）。状態に入っている工程をもう一度行いたいとき（長い仕掛品を
 * 切り直す等）は `redoStepIds` で残す。
 *
 * 加工状態が先頭部分になっていない（`isPrefix` = false）仕掛品は、一致した
 * ところまでしか飛ばさない。使うこと自体に人の判断と理由が要る
 * （`matchWip` の `other`）。
 */
export function planWipStart(
  route: readonly WipStartRouteStep[],
  stateStepIds: readonly number[],
  redoStepIds: readonly number[] = [],
): WipStartPlan {
  const shaping = route
    .map((s, index) => ({ ...s, index }))
    .filter((s) => s.affectsWipState && !s.isStart);
  let matched = 0;
  while (
    matched < stateStepIds.length &&
    matched < shaping.length &&
    shaping[matched].processStepId === stateStepIds[matched]
  ) {
    matched += 1;
  }
  const isPrefix = matched === stateStepIds.length;
  if (matched === 0) {
    return { isPrefix, matched, skippableStepIds: [], skippedStepIds: [] };
  }
  const lastIndex = shaping[matched - 1].index;
  const skippableStepIds = route
    .slice(0, lastIndex + 1)
    .filter((s) => !s.isStart)
    .map((s) => s.processStepId);
  const redo = new Set(redoStepIds);
  return {
    isPrefix,
    matched,
    skippableStepIds,
    skippedStepIds: skippableStepIds.filter((id) => !redo.has(id)),
  };
}

/**
 * 開始状態の工程のうち、指示書の工程に**載っていない**もの = 飛ばした工程。
 * 指示書詳細（Web）と指示書スキャン（共有端末）の「飛ばした工程」が同じ答えに
 * なるよう、ここで 1 つに決める。「もう一度行う」と選んだ工程は指示書に
 * 載っているので、ここには出ない。
 */
export function wipStartSkippedStepIds(
  stateStepIds: readonly number[],
  workOrderProcessStepIds: readonly number[],
): number[] {
  const present = new Set(workOrderProcessStepIds);
  return stateStepIds.filter((id) => !present.has(id));
}

/** 投入に選んだ仕掛品 1 本（在庫バケット × 数量）。 */
export interface WipDrawInput {
  inventoryId: string;
  quantity: number;
}

/** 選べる仕掛品 1 本（`matchWip` の結果を、検証に要るだけの形にしたもの）。 */
export interface WipDrawCandidate {
  inventoryId: string;
  wipStateId: number;
  /** 寸法の区分。`other` = 加工状態が製品の工程の先頭部分になっていない。 */
  group: WipDimensionGroup | "other";
  /** 使える数（手持ち − 引当）。 */
  available: number;
}

export type WipDrawIssue =
  /** 候補に無い（もう在庫に無い・この製品には使えない・見える範囲の外）。 */
  | "notACandidate"
  | "duplicate"
  | "quantityInvalid"
  | "quantityExceedsAvailable"
  /** 加工状態の違う仕掛品を 1 枚の指示書に混ぜている。 */
  | "mixedStates"
  /** `other` を選んだのに理由が無い。 */
  | "overrideReasonRequired";

/**
 * 投入する仕掛品の選び方の検証 — 画面（保存ボタンを止める）とサーバー
 * （保存を拒む）が同じ関数を通す。
 *
 * - 選んだバケットは候補（`matchWip` が返したもの）の中にあること。
 * - 数量は 1 以上の整数で、使える数（手持ち − 引当）以下。
 * - **1 枚の指示書に加工状態は 1 つ**。状態が違えば飛ばす工程が違うので、
 *   混ぜると「どこから始める指示書か」が決まらない。
 * - 加工状態が製品の工程の先頭部分になっていないもの（`other`）を 1 本でも
 *   選んだら、理由が要る（監査ログに残す）。
 *
 * 予定数量との大小はここでは問わない（予備を多めに出す・一部だけ仕掛品で
 * 賄えないときは指示書を分ける、は人が決める。画面は差を見せるだけ）。
 */
export function validateWipDraws(
  draws: readonly WipDrawInput[],
  candidates: readonly WipDrawCandidate[],
  overrideReason: string | null | undefined,
): {
  issues: WipDrawIssue[];
  /** 開始状態（選んだバケットの加工状態）。選んでいない・混ざっているなら null。 */
  wipStateId: number | null;
  needsOverride: boolean;
  total: number;
} {
  const issues = new Set<WipDrawIssue>();
  const byId = new Map(candidates.map((c) => [c.inventoryId, c]));
  const seen = new Set<string>();
  const states = new Set<number>();
  let needsOverride = false;
  let total = 0;
  for (const d of draws) {
    if (seen.has(d.inventoryId)) issues.add("duplicate");
    seen.add(d.inventoryId);
    const c = byId.get(d.inventoryId);
    if (!c) {
      issues.add("notACandidate");
      continue;
    }
    if (!Number.isInteger(d.quantity) || d.quantity <= 0) {
      issues.add("quantityInvalid");
    } else {
      if (d.quantity > c.available) issues.add("quantityExceedsAvailable");
      total += d.quantity;
    }
    states.add(c.wipStateId);
    if (c.group === "other") needsOverride = true;
  }
  if (states.size > 1) issues.add("mixedStates");
  if (needsOverride && !(overrideReason ?? "").trim()) {
    issues.add("overrideReasonRequired");
  }
  return {
    issues: [...issues],
    wipStateId: states.size === 1 ? [...states][0] : null,
    needsOverride,
    total,
  };
}

/** 完了のときの、投入した仕掛品 1 本の現況。 */
export interface WipDrawStock {
  inventoryId: string;
  /** この指示書がそのバケットに持っている予約（RESERVED の合計）。 */
  reserved: number;
  /** バケットの手持ち。 */
  onHand: number;
  /** バケット全体の引当（他の指示書の分も含む。この指示書の分も含む）。 */
  reservedTotal: number;
}

export interface WipDrawConsumption {
  inventoryId: string;
  /** 解除する予約（この指示書の予約は使った数に関わらず全部ほどく）。 */
  release: number;
  /** 在庫から落とす数。 */
  out: number;
}

/**
 * 完了のときに、投入した仕掛品を**どのバケットからいくつ落とすか**。
 *
 * 落とすのは選んだバケットだけ（古い順などの推測へ落ちない）。
 * 1. 選んだ順に、予約した数まで（手持ちが足りなければあるだけ）。
 * 2. 出した数が予約より多ければ、同じバケットの**空き**（他の指示書が引き当てて
 *    いない分）から足す。他の指示書の予約には手を付けない。
 * 3. それでも足りない分は `shortage` — 落とさない（台帳に無い物は落とせない）。
 *    完了は止めない（素材の消費と同じ方針）。
 *
 * 予約は使った数に関わらず全部ほどく — 出した数が少なかったときに予約だけ残ると、
 * 使われない予約が空き数量を食い続ける。
 */
export function planWipDrawConsumption(
  draws: readonly WipDrawStock[],
  needed: number,
): { lines: WipDrawConsumption[]; shortage: number } {
  let left = Math.max(0, needed);
  const lines = draws.map((d) => {
    const take = Math.max(0, Math.min(left, d.reserved, d.onHand));
    left -= take;
    return { inventoryId: d.inventoryId, release: d.reserved, out: take };
  });
  if (left > 0) {
    draws.forEach((d, i) => {
      if (left <= 0) return;
      // 予約をほどいたあとの空き = 手持ち − 落とした分 − 他の指示書の引当。
      const others = Math.max(0, d.reservedTotal - d.reserved);
      const free = Math.max(0, d.onHand - lines[i].out - others);
      const extra = Math.min(left, free);
      lines[i].out += extra;
      left -= extra;
    });
  }
  return { lines, shortage: left };
}
