/**
 * wip-stock-core.ts — 在庫管理の「仕掛品」タブの純ロジック（DB も React も読まない）。
 *
 * 突合の規則そのもの（どの仕掛品がどの製品に使えるか）は lib/wip-state-core.ts
 * `matchWip` が唯一の定義で、ここはその結果を**画面の形に畳むだけ**:
 *
 * - 一覧の並び（材種 / 径 / 長 → 加工状態）
 * - 製品ごとの「使える仕掛品 n 本」（ちょうど + 長い + 太い。`other` は数えない —
 *   加工状態が製品の工程の先頭部分になっておらず、使うには人の判断が要る）
 * - 「分類する」（未分類の行を仕掛ブランク × 加工状態へ移す）の入力検証。
 *   画面と Server Action が同じ関数を通す
 */

import type { WipMatchResult } from "./wip-state-core";

/** 一覧の並びに要る最小限の形（行の型は components/inventory/wip/model.ts）。 */
export interface WipGroupable {
  id: string;
  /** 仕掛ブランクの材種・径・長。未分類（品目が製品のまま）は null。 */
  materialTypeId: number | null;
  diameterMm: number | null;
  lengthMm: number | null;
  wipStateId: number;
  /** 済んだ形を変える工程の数（並びの順に使う — 浅い状態が先）。 */
  stepIds: readonly number[];
  isLegacy: boolean;
  quantity: number;
  reservedQuantity: number;
  /** 古い順に並べるための時刻（ISO）。 */
  receivedAt: string | null;
}

export interface WipStateGroup<T> {
  wipStateId: number;
  rows: T[];
}

export interface WipBlankGroup<T> {
  /** `u` = 未分類、それ以外は `材種id|径|長`。 */
  key: string;
  unclassified: boolean;
  materialTypeId: number | null;
  diameterMm: number | null;
  lengthMm: number | null;
  quantity: number;
  reservedQuantity: number;
  states: WipStateGroup<T>[];
}

/** 未分類か — 状態が「未分類」か、仕掛ブランクの寸法が決まっていない行。 */
export function isUnclassifiedWip(r: {
  isLegacy: boolean;
  materialTypeId: number | null;
  diameterMm: number | null;
  lengthMm: number | null;
}): boolean {
  return (
    r.isLegacy ||
    r.materialTypeId == null ||
    r.diameterMm == null ||
    r.lengthMm == null
  );
}

const cmpNum = (a: number | null, b: number | null) => (a ?? 0) - (b ?? 0);

/**
 * 仕掛品を 材種 / 径 / 長 → 加工状態 にまとめる。
 *
 * 並び: **未分類が先頭**（人の手が要る行を埋もれさせない）→ 材種 → 径 → 長。
 * 加工状態は浅いものから（済んだ工程が少ない順）、同じ深さなら状態 id。
 * 状態の中は古い順（先に使う品が上）。
 */
export function groupWipStock<T extends WipGroupable>(
  rows: readonly T[],
): WipBlankGroup<T>[] {
  const groups = new Map<string, WipBlankGroup<T>>();
  for (const r of rows) {
    const unclassified = isUnclassifiedWip(r);
    const key = unclassified
      ? "u"
      : `${r.materialTypeId}|${r.diameterMm}|${r.lengthMm}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        unclassified,
        materialTypeId: unclassified ? null : r.materialTypeId,
        diameterMm: unclassified ? null : r.diameterMm,
        lengthMm: unclassified ? null : r.lengthMm,
        quantity: 0,
        reservedQuantity: 0,
        states: [],
      };
      groups.set(key, g);
    }
    g.quantity += r.quantity;
    g.reservedQuantity += r.reservedQuantity;
    let s = g.states.find((x) => x.wipStateId === r.wipStateId);
    if (!s) {
      s = { wipStateId: r.wipStateId, rows: [] };
      g.states.push(s);
    }
    s.rows.push(r);
  }

  const out = [...groups.values()].sort(
    (a, b) =>
      Number(b.unclassified) - Number(a.unclassified) ||
      cmpNum(a.materialTypeId, b.materialTypeId) ||
      cmpNum(a.diameterMm, b.diameterMm) ||
      cmpNum(a.lengthMm, b.lengthMm),
  );
  for (const g of out) {
    g.states.sort(
      (a, b) =>
        a.rows[0].stepIds.length - b.rows[0].stepIds.length ||
        a.wipStateId - b.wipStateId,
    );
    for (const s of g.states) {
      s.rows.sort(
        (a, b) =>
          (a.receivedAt ?? "￿").localeCompare(b.receivedAt ?? "￿") ||
          a.id.localeCompare(b.id),
      );
    }
  }
  return out;
}

/** 製品 1 つに使える仕掛品のまとめ（製品在庫の「使える仕掛品 n 本」）。 */
export interface UsableWipSummary {
  /** 使える本数（手持ち − 引当 の合計）。 */
  quantity: number;
  /** 対象の在庫行（仕掛品タブの絞り込みに使う）。 */
  inventoryIds: string[];
}

/**
 * 突合の結果から「使える仕掛品」を数える — **ちょうど + 長い + 太い**。
 * `other`（寸法は足りるが加工状態が合わない）は数えない。
 */
export function usableWipSummary(match: WipMatchResult): UsableWipSummary {
  const usable = [...match.exact, ...match.longer, ...match.largerDiameter];
  return {
    quantity: usable.reduce((s, c) => s + c.available, 0),
    inventoryIds: usable.map((c) => c.inventoryId),
  };
}

/** 経過日数（在庫に入ってから何日か）。時刻が読めなければ null。 */
export function wipAgeDays(
  receivedAt: string | Date | null | undefined,
  now: Date | number,
): number | null {
  if (receivedAt == null) return null;
  const t =
    receivedAt instanceof Date ? receivedAt.getTime() : Date.parse(receivedAt);
  if (Number.isNaN(t)) return null;
  const n = now instanceof Date ? now.getTime() : now;
  return Math.max(0, Math.floor((n - t) / 86_400_000));
}

/** 寸法の表示（φ6 × 60）。どちらかが無ければ null。 */
export function wipSizeLabel(
  diameterMm: number | null | undefined,
  lengthMm: number | null | undefined,
): string | null {
  if (diameterMm == null || lengthMm == null) return null;
  return `φ${trimNumber(diameterMm)} × ${trimNumber(lengthMm)}`;
}

/** 6.000 → "6"、8.30 → "8.3"。 */
export function trimNumber(v: number): string {
  return String(Number(v.toFixed(3)));
}

// ─── 分類する（未分類 → 仕掛ブランク × 加工状態） ───────────────────────────

/** 寸法の上限（mm）— lib/wip-state-core.ts の仕上がり寸法と同じ緩い上限。 */
export const WIP_MAX_DIAMETER_MM = 9999;
export const WIP_MAX_LENGTH_MM = 99999;

export interface WipReclassifyInput {
  /** 分類する本数（整数）。 */
  quantity: number | null;
  materialTypeId: number | null;
  diameterMm: number | null;
  lengthMm: number | null;
  /** 済んだ形を変える工程（カタログ id、早い順）。空 = 未加工。 */
  stepIds: readonly number[];
  finishedDiameterMm: number | null;
  finishedLengthMm: number | null;
  /** 目標製品（任意）。 */
  aimedItemId: number | null;
}

export type WipReclassifyIssue =
  | "quantityRequired"
  | "quantityExceedsAvailable"
  | "materialTypeRequired"
  | "diameterInvalid"
  | "lengthInvalid"
  | "finishedDiameterRequired"
  | "finishedLengthRequired"
  | "finishedDiameterInvalid"
  | "finishedLengthInvalid";

export interface WipReclassifyValue {
  quantity: number;
  materialTypeId: number;
  diameterMm: number;
  lengthMm: number;
  stepIds: number[];
  finishedDiameterMm: number;
  finishedLengthMm: number;
  aimedItemId: number | null;
}

const validDim = (v: number | null, max: number): v is number =>
  v != null && Number.isFinite(v) && v > 0 && v <= max;

/**
 * 「分類する」の入力検証。
 *
 * 仕上がり寸法の規則は工程完了の記録（validateWipRecording）と同じ:
 * **形を変える工程が 1 つでも済んでいれば必須**、1 つも無ければ（未加工）
 * 仕掛ブランクの寸法を既定にする（入力があればそれを優先）。
 */
export function validateWipReclassify(
  input: WipReclassifyInput,
  available: number,
): { issues: WipReclassifyIssue[]; value: WipReclassifyValue | null } {
  const issues: WipReclassifyIssue[] = [];
  const q = input.quantity;
  if (q == null || !Number.isInteger(q) || q <= 0) {
    issues.push("quantityRequired");
  } else if (q > available) {
    issues.push("quantityExceedsAvailable");
  }
  if (input.materialTypeId == null) issues.push("materialTypeRequired");
  if (!validDim(input.diameterMm, WIP_MAX_DIAMETER_MM)) {
    issues.push("diameterInvalid");
  }
  if (!validDim(input.lengthMm, WIP_MAX_LENGTH_MM))
    issues.push("lengthInvalid");

  const shaped = input.stepIds.length > 0;
  let fd = input.finishedDiameterMm;
  let fl = input.finishedLengthMm;
  if (fd == null) {
    if (shaped) issues.push("finishedDiameterRequired");
    else fd = input.diameterMm;
  } else if (!validDim(fd, WIP_MAX_DIAMETER_MM)) {
    issues.push("finishedDiameterInvalid");
  }
  if (fl == null) {
    if (shaped) issues.push("finishedLengthRequired");
    else fl = input.lengthMm;
  } else if (!validDim(fl, WIP_MAX_LENGTH_MM)) {
    issues.push("finishedLengthInvalid");
  }

  if (issues.length > 0) return { issues, value: null };
  return {
    issues,
    value: {
      quantity: q as number,
      materialTypeId: input.materialTypeId as number,
      diameterMm: input.diameterMm as number,
      lengthMm: input.lengthMm as number,
      stepIds: [...input.stepIds],
      finishedDiameterMm: fd as number,
      finishedLengthMm: fl as number,
      aimedItemId: input.aimedItemId,
    },
  };
}
