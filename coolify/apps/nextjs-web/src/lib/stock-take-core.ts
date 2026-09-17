/**
 * stock-take-core.ts — 棚卸の判定（純ロジック・I/O なし）。
 *
 * 画面（何を出すか）とサーバー（何を計上するか）が**同じ関数**を見るための置き場。
 * 差異の数え方が 2 か所にあると、画面に出ている差異と実際に当たる調整がずれる。
 *
 * client-safe（`server-only` 無し）。
 */

/** 棚卸 1 行 = 1 在庫バケット。 */
export interface StockTakeLineInput {
  /** 取り込んだ時点の帳簿数（表示用）。 */
  bookQuantity: number;
  /** 数えた数。null = 未カウント。 */
  countedQuantity: number | null;
  /** 確定時にその場で読み直した実数。確定処理だけが渡す。 */
  liveQuantity?: number;
}

/**
 * 差異 = 数えた数 − 実数。
 *
 * **基準は `liveQuantity`（確定時に読み直した実数）で、取り込み時点の
 * `bookQuantity` ではない。** 数え始めてから確定するまでに在庫は動く（出荷が
 * 通る、入荷が載る）ので、取り込み時点との差を当てると、その間の正しい動きを
 * 打ち消してしまう。`bookQuantity` は「取り込んだときはこうだった」を画面に
 * 出すためだけに持つ。
 *
 * 未カウント（null）は差異ではない — 数えなかっただけなので 0 を返し、
 * 呼び出し側は計上しない（`shouldPost` が false になる）。
 */
export function stockTakeDifference(line: StockTakeLineInput): number {
  if (line.countedQuantity == null) return 0;
  const base = line.liveQuantity ?? line.bookQuantity;
  return line.countedQuantity - base;
}

/** 調整を計上する行か（数えてあって、かつ差異がある行だけ）。 */
export function shouldPost(line: StockTakeLineInput): boolean {
  return line.countedQuantity != null && stockTakeDifference(line) !== 0;
}

/** 数えた行の数。 */
export function countedLines(lines: StockTakeLineInput[]): number {
  return lines.filter((l) => l.countedQuantity != null).length;
}

/**
 * 差異のある行の数。**数えた行だけ**を対象にする — 「差異ゼロ」と「まだ
 * 数えていない」を同じ扱いにしない（承認条件 difference_count もこの定義）。
 */
export function differenceCount(lines: StockTakeLineInput[]): number {
  return lines.filter(shouldPost).length;
}

/** 過不足の合計（増える側 / 減る側を別々に — 相殺して 0 に見せない）。 */
export function differenceTotals(lines: StockTakeLineInput[]): {
  over: number;
  under: number;
} {
  let over = 0;
  let under = 0;
  for (const l of lines) {
    if (!shouldPost(l)) continue;
    const d = stockTakeDifference(l);
    if (d > 0) over += d;
    else under += -d;
  }
  return { over, under };
}

export type StockTakeStatus = "DRAFT" | "COUNTING" | "CONFIRMED" | "CANCELLED";
export type StockTakeApprovalStatus =
  | "NONE"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

export interface StockTakeState {
  status: StockTakeStatus;
  approvalStatus: StockTakeApprovalStatus;
}

/** 数量を書き換えられるか（確定・キャンセル後は読むだけ）。 */
export function canEditCounts(s: StockTakeState): boolean {
  return (
    (s.status === "DRAFT" || s.status === "COUNTING") &&
    s.approvalStatus !== "PENDING"
  );
}

/**
 * 確定（= 調整の適用）に進めるか。
 *
 * 承認依頼中は不可 — 承認を待っている最中に本人が当ててしまえるなら、承認は
 * 何も止めていない。差し戻し後は数え直して再依頼できるので DRAFT/COUNTING と
 * 同じ扱いにする。
 */
export function canSubmit(s: StockTakeState, lines: StockTakeLineInput[]): boolean {
  if (s.status !== "DRAFT" && s.status !== "COUNTING") return false;
  if (s.approvalStatus === "PENDING") return false;
  return countedLines(lines) > 0;
}

/** キャンセルできるか（確定済みは戻せない — 逆仕訳の棚卸を起こす）。 */
export function canCancel(s: StockTakeState): boolean {
  return s.status === "DRAFT" || s.status === "COUNTING";
}
