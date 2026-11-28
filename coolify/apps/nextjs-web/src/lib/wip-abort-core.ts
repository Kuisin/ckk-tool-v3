/**
 * wip-abort-core.ts — 指示書の打ち切り（進行中の指示書を止め、流れの途中に
 * ある良品を仕掛品として在庫へ戻す）の純ロジック。DB も Prisma も読まない。
 *
 * - **どこに何本あるか**（`abortPositions`）: 進行中の工程に受け入れた分と、
 *   完了した工程から次の工程の受け入れを待っている分を、**位置ごと**に数える。
 *   位置ごとに加工状態（済んだ形を変える工程の並び）が違うので、在庫に戻す
 *   ときも位置 1 つ = 仕掛品 1 本。
 * - **申請の検証**（`validateAbortRequest`）: 理由は必須、位置ごとに
 *   戻す数 + 廃棄数 = その位置の数（廃棄は明示する — 黙って消える数を作らない）、
 *   戻す分は工程完了の記録と同じ規則（`validateWipRecording` — 経路の確認と
 *   仕上がり寸法）。
 * - **適用時の突き合わせ**（`abortPremiseIssues`）: 申請してから工程が進んで
 *   いれば適用しない（工程フロー変更と同じ「古い前提のまま当てない」）。
 *
 * **nextjs-web が原本で、nextjs-kiosk へ逐語コピーする twin file**
 * （lib/inventory.ts が打ち切りの計上でこのファイルの型を使い、inventory.ts は
 * 共有端末と共有している）。直したら `pnpm twin:sync`。
 */

import {
  validateWipRecording,
  type WipBlankSize,
  type WipPath,
  type WipRecordingIssue,
  wipPathOptions,
  wipRecordingPath,
  wipSignature,
  wipStateForSource,
} from "./wip-state-core";
import {
  expectedInput,
  isOffMainline,
  resolveLinkQuantity,
  type StepLinkState,
  type StepState,
  type WorkflowCtx,
} from "./workflow-core";

/** 品がいる場所の種類。 */
export type AbortPositionKind =
  /** 進行中の工程に受け入れた分（その工程はまだ済んでいない）。 */
  | "IN_STEP"
  /** 完了した工程から出て、次の工程の受け入れを待っている分。 */
  | "WAITING";

/** 流れの途中で良品がいる 1 か所。 */
export interface AbortPosition {
  /** 位置の識別子（申請と適用の突き合わせに使う）。 */
  key: string;
  kind: AbortPositionKind;
  /** IN_STEP: 品が入っている工程 / WAITING: 品が次に入る（待っている）工程。 */
  stepId: string;
  /** WAITING: 品を出した（完了した）工程。IN_STEP は null。 */
  sourceStepId: string | null;
  /** その位置にいる本数。 */
  quantity: number;
  /**
   * 加工状態の候補 — **済んだ工程を全部並べた形**（工程完了の記録と違い、
   * 発生元を後から足さない）。`stepIds` が推奨（本流）、`alternatives` は
   * 手前に合流があって別の経路を辿った並び。
   */
  path: WipPath;
}

function orderKey(a: StepState, b: StepState): number {
  return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

function appendSource(
  path: WipPath,
  source: StepState,
  includeSource: boolean,
  affectsWipState: (processStepId: number) => boolean,
): WipPath {
  if (!includeSource) return path;
  const add = (ids: readonly number[]) =>
    wipStateForSource(
      ids,
      source.processStepId,
      "BRANCH_TERMINAL",
      affectsWipState,
    );
  return {
    stepIds: add(path.stepIds),
    ambiguous: path.ambiguous,
    alternatives: path.alternatives.map(add),
  };
}

/**
 * 打ち切りで在庫へ戻せる良品の位置と本数。
 *
 * - **進行中の工程**: 受入数（未記録なら想定受入数）。加工状態にその工程は
 *   入れない — 途中で止めた品はその工程を終えていない（半製品の振り分けと
 *   同じ規則。済んだことにすると次の指示書がその工程を飛ばす）。
 * - **完了した工程の後ろで待っている分**: 次の工程が未着手のとき、
 *   本流の直前工程の良品と、流入リンクの数（分岐・合流）を**出どころごと**に
 *   数える。出どころが違えば加工状態が違うので 1 か所にまとめない。
 *   良品の全量を運ぶ流れ（本流・動的リンク）は出どころの工程を済んだことにし、
 *   工程分岐で抜いた分（静的リンク）は済んだことにしない（不良として途中で
 *   抜いた品 — 半製品の振り分けと同じ）。
 *
 * 既に在庫の行き先が決まっている分（工程に記録した半製品・半製品在庫で終わる
 * 分岐の終端・完成数）はここに出さない — 打ち切りの適用でも指示書の完了と
 * 同じ計上（lib/inventory.ts）がそれを入れる。
 *
 * 並びは工程順（品がいる工程、次に出どころ）。
 */
export function abortPositions(
  steps: readonly StepState[],
  links: readonly StepLinkState[],
  affectsWipState: (processStepId: number) => boolean,
  options: {
    /** 指示書の開始状態（在庫の仕掛品から始めた指示書）— 頭に付ける。 */
    startStepIds?: readonly number[];
    /** 先頭工程の想定受入（受入数が未記録の進行中工程のため）。 */
    plannedQuantity?: number;
  } = {},
): AbortPosition[] {
  const startStepIds = options.startStepIds ?? [];
  const ctx: WorkflowCtx = {
    plannedQuantity: options.plannedQuantity ?? 0,
    steps: [...steps],
    links: [...links],
    execDeps: [],
  };
  const byId = new Map(steps.map((s) => [s.id, s]));
  const ordered = steps.filter((s) => s.status !== "CANCELLED").sort(orderKey);
  const out: AbortPosition[] = [];
  const waiting = new Map<string, AbortPosition>();

  const upstreamOf = (step: StepState): WipPath =>
    wipRecordingPath(steps, links, step.id, affectsWipState, startStepIds);

  const addWaiting = (
    target: StepState,
    source: StepState,
    quantity: number,
    includeSource: boolean,
  ) => {
    if (quantity <= 0) return;
    const key = `W:${target.id}:${source.id}:${includeSource ? "G" : "R"}`;
    const existing = waiting.get(key);
    if (existing) {
      existing.quantity += quantity;
      return;
    }
    const pos: AbortPosition = {
      key,
      kind: "WAITING",
      stepId: target.id,
      sourceStepId: source.id,
      quantity,
      path: appendSource(
        upstreamOf(source),
        source,
        includeSource,
        affectsWipState,
      ),
    };
    waiting.set(key, pos);
    out.push(pos);
  };

  for (let i = 0; i < ordered.length; i++) {
    const step = ordered[i];
    if (step.status === "IN_PROGRESS") {
      const quantity = step.inputQuantity ?? expectedInput(step.id, ctx) ?? 0;
      if (quantity > 0) {
        out.push({
          key: `S:${step.id}`,
          kind: "IN_STEP",
          stepId: step.id,
          sourceStepId: null,
          quantity,
          path: upstreamOf(step),
        });
      }
      continue;
    }
    if (step.status !== "PENDING") continue;

    // 本流の直前工程から（分岐系列の工程は飛ばす — expectedInput と同じ規則）。
    if (!isOffMainline(step.id, ctx)) {
      for (let j = i - 1; j >= 0; j--) {
        const prev = ordered[j];
        if (isOffMainline(prev.id, ctx)) continue;
        if (prev.status === "COMPLETED") {
          addWaiting(step, prev, prev.outputSuccess ?? 0, true);
        }
        break;
      }
    }
    // 流入リンク（分岐の頭・系列内の連鎖・合流）から。
    for (const link of links) {
      if (link.targetStepId !== step.id) continue;
      const src = byId.get(link.sourceStepId);
      if (!src || src.status !== "COMPLETED") continue;
      const quantity = resolveLinkQuantity(link, steps) ?? 0;
      addWaiting(step, src, quantity, link.routedQuantity <= 0);
    }
  }
  return out;
}

// ─── 申請 ───────────────────────────────────────────────────────────────────

/** 位置 1 か所ぶんの入力（画面 → サーバー）。 */
export interface AbortPositionInput {
  key: string;
  /** 仕掛品として在庫へ戻す本数。 */
  returnQuantity: number;
  /** 廃棄する本数（**明示** — 戻さない分は必ずここに入る）。 */
  scrapQuantity: number;
  /** 選んだ加工状態（曖昧なときだけ。候補のどれか）。 */
  pathStepIds?: number[] | null;
  finishedDiameterMm?: number | null;
  finishedLengthMm?: number | null;
}

/** 検証の不備（文言は画面が自分の辞書で当てる）。 */
export type AbortIssue =
  | { kind: "reasonRequired" }
  | { kind: "positionMissing"; key: string }
  | { kind: "positionUnknown"; key: string }
  | { kind: "quantityInvalid"; key: string }
  | { kind: "quantityMismatch"; key: string }
  | { kind: "wip"; key: string; issue: WipRecordingIssue };

/** 保存する 1 か所ぶん（申請時点の本数も持つ — 適用時の突き合わせ用）。 */
export interface AbortPayloadPosition {
  key: string;
  kind: AbortPositionKind;
  stepId: string;
  sourceStepId: string | null;
  /** 申請時点でその位置にいた本数。 */
  quantity: number;
  returnQuantity: number;
  scrapQuantity: number;
  /** 戻す分の加工状態（戻す分が 0 なら推奨のまま）。 */
  stepIds: number[];
  finishedDiameterMm: number | null;
  finishedLengthMm: number | null;
}

/** work_order_aborts.payload の形。 */
export interface WorkOrderAbortPayload {
  version: 1;
  positions: AbortPayloadPosition[];
}

const MAX_QUANTITY = 1_000_000;

function validQuantity(v: unknown): v is number {
  return (
    typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_QUANTITY
  );
}

/**
 * 打ち切りの申請を確かめる — 画面（入力欄の不備表示）とサーバー（申請の入口）
 * が同じこれを通す。
 *
 * - 理由は**常に必須**（承認の有無に関わらず — 利用者の決定 2026-11-25）。
 * - 位置はすべて答える（戻す + 廃棄 = その位置の本数）。入力の漏れを
 *   「全部廃棄」と読まない — 数が黙って消えるのを防ぐ。
 * - 戻す分は工程完了で在庫に置くときと同じ規則（`validateWipRecording`）:
 *   加工状態が曖昧なら選ぶ、形を変える工程が 1 つでも済んでいれば
 *   仕上がり寸法が必須。何も済んでいなければブランクの寸法を既定にする。
 */
export function validateAbortRequest(args: {
  positions: readonly AbortPosition[];
  reason: string | null | undefined;
  inputs: readonly AbortPositionInput[];
  blank: Pick<WipBlankSize, "diameterMm" | "lengthMm"> | null;
}): { issues: AbortIssue[]; payload: WorkOrderAbortPayload | null } {
  const issues: AbortIssue[] = [];
  if (!args.reason || args.reason.trim() === "") {
    issues.push({ kind: "reasonRequired" });
  }
  const known = new Set(args.positions.map((p) => p.key));
  const inputOf = new Map<string, AbortPositionInput>();
  for (const input of args.inputs) {
    if (!known.has(input.key)) {
      issues.push({ kind: "positionUnknown", key: input.key });
      continue;
    }
    inputOf.set(input.key, input);
  }

  const out: AbortPayloadPosition[] = [];
  for (const pos of args.positions) {
    const input = inputOf.get(pos.key);
    if (!input) {
      issues.push({ kind: "positionMissing", key: pos.key });
      continue;
    }
    if (
      !validQuantity(input.returnQuantity) ||
      !validQuantity(input.scrapQuantity)
    ) {
      issues.push({ kind: "quantityInvalid", key: pos.key });
      continue;
    }
    if (input.returnQuantity + input.scrapQuantity !== pos.quantity) {
      issues.push({ kind: "quantityMismatch", key: pos.key });
      continue;
    }
    const recorded = validateWipRecording({
      stores: input.returnQuantity > 0,
      path: pos.path,
      // 候補はすでに済んだ工程を全部並べた形 — 発生元を後から足さない。
      sourceCountsAsDone: false,
      blank: args.blank,
      input: {
        finishedDiameterMm: input.finishedDiameterMm ?? null,
        finishedLengthMm: input.finishedLengthMm ?? null,
        pathStepIds: input.pathStepIds ?? null,
      },
    });
    for (const issue of recorded.issues) {
      issues.push({ kind: "wip", key: pos.key, issue });
    }
    out.push({
      key: pos.key,
      kind: pos.kind,
      stepId: pos.stepId,
      sourceStepId: pos.sourceStepId,
      quantity: pos.quantity,
      returnQuantity: input.returnQuantity,
      scrapQuantity: input.scrapQuantity,
      stepIds: recorded.value.pathStepIds ?? [...pos.path.stepIds],
      finishedDiameterMm: recorded.value.finishedDiameterMm,
      finishedLengthMm: recorded.value.finishedLengthMm,
    });
  }
  return issues.length > 0
    ? { issues, payload: null }
    : { issues, payload: { version: 1, positions: out } };
}

/**
 * 画面の既定の入力 — 全数を戻す、加工状態は推奨、寸法は空（形を変える工程が
 * 済んでいなければブランクの寸法を既定にするのは検証側の仕事）。
 */
export function defaultAbortInputs(
  positions: readonly AbortPosition[],
): AbortPositionInput[] {
  return positions.map((p) => ({
    key: p.key,
    returnQuantity: p.quantity,
    scrapQuantity: 0,
    pathStepIds: p.path.ambiguous ? [...p.path.stepIds] : null,
    finishedDiameterMm: null,
    finishedLengthMm: null,
  }));
}

/** 保存された payload を読む（形が違えば null — 適用は FAILED にする）。 */
export function parseAbortPayload(
  value: unknown,
): WorkOrderAbortPayload | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { version?: unknown; positions?: unknown };
  if (v.version !== 1 || !Array.isArray(v.positions)) return null;
  const positions: AbortPayloadPosition[] = [];
  for (const raw of v.positions) {
    if (!raw || typeof raw !== "object") return null;
    const p = raw as Record<string, unknown>;
    const num = (x: unknown): number | null =>
      typeof x === "number" && Number.isFinite(x) ? x : null;
    if (
      typeof p.key !== "string" ||
      (p.kind !== "IN_STEP" && p.kind !== "WAITING") ||
      typeof p.stepId !== "string" ||
      !(p.sourceStepId === null || typeof p.sourceStepId === "string") ||
      !validQuantity(p.quantity) ||
      !validQuantity(p.returnQuantity) ||
      !validQuantity(p.scrapQuantity) ||
      !Array.isArray(p.stepIds) ||
      !p.stepIds.every((id) => typeof id === "number" && Number.isInteger(id))
    ) {
      return null;
    }
    positions.push({
      key: p.key,
      kind: p.kind,
      stepId: p.stepId,
      sourceStepId: p.sourceStepId as string | null,
      quantity: p.quantity,
      returnQuantity: p.returnQuantity,
      scrapQuantity: p.scrapQuantity,
      stepIds: p.stepIds as number[],
      finishedDiameterMm: num(p.finishedDiameterMm),
      finishedLengthMm: num(p.finishedLengthMm),
    });
  }
  return { version: 1, positions };
}

/** 突き合わせの不一致（適用しない理由）。 */
export type AbortPremiseIssue =
  /** 申請した位置が無くなった（工程が進んだ・戻った）。 */
  | { kind: "positionGone"; key: string }
  /** 位置の本数が変わった。 */
  | { kind: "quantityChanged"; key: string; was: number; now: number }
  /** 申請に無い位置ができた（その品の行き先が決まっていない）。 */
  | { kind: "positionAdded"; key: string }
  /** 選んだ加工状態が、いまの候補に無い。 */
  | { kind: "stateChanged"; key: string };

/**
 * 申請した内容が、いまの工程の状態でもそのまま当てはまるか。
 *
 * 承認を待つあいだに現場が工程を進めると、申請した位置の品はもう別の場所に
 * いる。古い数のまま戻すと在庫が二重になる・足りなくなるので、1 つでも
 * 食い違えば適用しない（呼び出し側が FAILED + 理由で残す）。
 */
export function abortPremiseIssues(
  payload: WorkOrderAbortPayload,
  current: readonly AbortPosition[],
): AbortPremiseIssue[] {
  const issues: AbortPremiseIssue[] = [];
  const now = new Map(current.map((p) => [p.key, p]));
  const asked = new Set(payload.positions.map((p) => p.key));
  for (const p of payload.positions) {
    const cur = now.get(p.key);
    if (!cur) {
      issues.push({ kind: "positionGone", key: p.key });
      continue;
    }
    if (cur.quantity !== p.quantity) {
      issues.push({
        kind: "quantityChanged",
        key: p.key,
        was: p.quantity,
        now: cur.quantity,
      });
      continue;
    }
    if (p.returnQuantity > 0) {
      const sig = wipSignature(p.stepIds);
      if (!wipPathOptions(cur.path).some((o) => wipSignature(o) === sig)) {
        issues.push({ kind: "stateChanged", key: p.key });
      }
    }
  }
  for (const cur of current) {
    if (!asked.has(cur.key))
      issues.push({ kind: "positionAdded", key: cur.key });
  }
  return issues;
}

/** 打ち切りで入れる仕掛品 1 本（位置 1 か所 = 1 本）。 */
export interface AbortWipPosting {
  /** 在庫の行の「発生工程」（WAITING は出どころの工程、IN_STEP は入っていた工程）。 */
  sourceStepId: string;
  quantity: number;
  stepIds: number[];
  finishedDiameterMm: number | null;
  finishedLengthMm: number | null;
}

/** payload → 計上（戻す分が 0 の位置は入れない）と、廃棄の合計。 */
export function abortSettlement(payload: WorkOrderAbortPayload): {
  postings: AbortWipPosting[];
  scrap: number;
  returned: number;
} {
  const postings: AbortWipPosting[] = [];
  let scrap = 0;
  let returned = 0;
  for (const p of payload.positions) {
    scrap += p.scrapQuantity;
    if (p.returnQuantity <= 0) continue;
    returned += p.returnQuantity;
    postings.push({
      sourceStepId: p.sourceStepId ?? p.stepId,
      quantity: p.returnQuantity,
      stepIds: [...p.stepIds],
      finishedDiameterMm: p.finishedDiameterMm,
      finishedLengthMm: p.finishedLengthMm,
    });
  }
  return { postings, scrap, returned };
}

/**
 * 打ち切れる指示書か。進行中（工程が動いている）の**製造分**だけ。
 *
 * - 着手前（下書き〜承認済みで工程が動いていない）はキャンセルで足りる。
 * - 在庫分（FROM_STOCK）は完成品を在庫から出して流しているので、途中の品を
 *   「仕掛ブランク × 加工状態」に戻すと完成品が未加工の素材に化ける。
 * - 再研磨は顧客の物で、そもそも自社の仕掛品にならない。
 */
export type AbortBlock = "notInProgress" | "typeNotAbortable";

export function abortBlock(wo: {
  status: string;
  type: string;
}): AbortBlock | null {
  if (wo.status !== "IN_PROGRESS") return "notInProgress";
  if (wo.type !== "MANUFACTURE") return "typeNotAbortable";
  return null;
}
