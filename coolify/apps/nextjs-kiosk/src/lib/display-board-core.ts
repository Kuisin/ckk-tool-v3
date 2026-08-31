/**
 * display-board-core.ts — 生産ボードの純ロジック（並べ替え・進捗・ページ分割）。
 * DB に触れない純関数のみ — vitest で単体テスト（display-board-core.test.ts）。
 *
 * ボードの設計方針は「遠くから、触らずに読める」:
 *   - 進行中を上、次に着手できるもの、その後に未着手
 *   - 1 画面に収まらない分は**横スクロールではなくページ送り**にする
 *     （誰も触らない画面では、画面外に出た情報は存在しないのと同じ）
 */

export type BoardStepStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type BoardStep = {
  id: string;
  name: string;
  sortOrder: number;
  status: BoardStepStatus;
  /** 進行中の工程が「一時停止中」か（ロック解放 = 誰も作業していない）。 */
  paused: boolean;
  inputQuantity: number | null;
  outputSuccessQuantity: number | null;
  /** 担当者名（作業計画から。重複排除済み）。 */
  assignees: string[];
};

export type BoardRow = {
  workOrderId: string;
  /** ロット番号（現場が口にする番号）。 */
  lotNumber: number;
  /** 書類番号 WOR-YYYYMM-NNNNN。 */
  documentNumber: string;
  productName: string;
  plannedQuantity: number;
  steps: BoardStep[];
};

/** 表示用に畳んだ 1 行。 */
export type BoardEntry = {
  workOrderId: string;
  lotNumber: number;
  documentNumber: string;
  productName: string;
  plannedQuantity: number;
  /** いま見せる工程（進行中 → 無ければ次に来る未着手 → 無ければ最後の完了）。 */
  currentStepName: string | null;
  currentStepStatus: BoardStepStatus | null;
  paused: boolean;
  assignees: string[];
  /** 完了した工程数 / 全工程数（キャンセルは母数から外す）。 */
  completedSteps: number;
  totalSteps: number;
  /** 0–100 の整数。工程数がゼロなら 0。 */
  progressPercent: number;
  /** 直近工程の良品数（無ければ受入数、どちらも無ければ null）。 */
  quantity: number | null;
};

/** 並べ替えの優先度 — 小さいほど上。 */
function rank(entry: BoardEntry): number {
  if (entry.currentStepStatus === "IN_PROGRESS") return entry.paused ? 1 : 0;
  if (entry.currentStepStatus === "PENDING") return 2;
  return 3;
}

/**
 * 1 指示書 → 1 行。「いま何をしているか」を 1 つだけ選ぶ。
 *
 * 選び方（現場が知りたい順）:
 *   1. 進行中の工程があればそれ（複数あれば工程順で最初）
 *   2. 無ければ、これから着手する最初の未着手工程
 *   3. どちらも無ければ最後に完了した工程（＝もう終わっている）
 * キャンセルされた工程は常に選ばない。
 */
export function toBoardEntry(row: BoardRow): BoardEntry {
  const live = [...row.steps]
    .filter((s) => s.status !== "CANCELLED")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const current =
    live.find((s) => s.status === "IN_PROGRESS") ??
    live.find((s) => s.status === "PENDING") ??
    [...live].reverse().find((s) => s.status === "COMPLETED") ??
    null;

  const completedSteps = live.filter((s) => s.status === "COMPLETED").length;
  const totalSteps = live.length;

  return {
    workOrderId: row.workOrderId,
    lotNumber: row.lotNumber,
    documentNumber: row.documentNumber,
    productName: row.productName,
    plannedQuantity: row.plannedQuantity,
    currentStepName: current?.name ?? null,
    currentStepStatus: current?.status ?? null,
    paused: current?.status === "IN_PROGRESS" ? current.paused : false,
    assignees: current?.assignees ?? [],
    completedSteps,
    totalSteps,
    progressPercent:
      totalSteps === 0 ? 0 : Math.round((completedSteps / totalSteps) * 100),
    quantity: current?.outputSuccessQuantity ?? current?.inputQuantity ?? null,
  };
}

/**
 * 表示順: 進行中 → 一時停止中 → 着手待ち → 完了。同順位はロット番号の
 * 小さい順（＝古い順。現場の「先に流したもの」の並び）。
 */
export function sortBoardEntries(entries: BoardEntry[]): BoardEntry[] {
  return [...entries].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return a.lotNumber - b.lotNumber;
  });
}

/**
 * ページ分割。1 画面に入る行数で切って、順番に見せる。
 * `perPage` が 0 以下なら 1 ページに全部（分割しない）。
 */
export function paginate<T>(items: T[], perPage: number): T[][] {
  if (perPage <= 0) return items.length ? [items] : [[]];
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) {
    pages.push(items.slice(i, i + perPage));
  }
  return pages;
}

/** いま何ページ目を見せるか（経過時間から決める — 状態を持たない）。 */
export function pageIndexAt(
  elapsedMs: number,
  pageCount: number,
  intervalMs: number,
): number {
  if (pageCount <= 1 || intervalMs <= 0) return 0;
  return Math.floor(elapsedMs / intervalMs) % pageCount;
}
