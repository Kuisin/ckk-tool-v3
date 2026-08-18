/**
 * order-line-core.ts — 注文明細のラインチェック（pure / client-safe）。
 *
 * ルール: **承認 → 確定の後は明細を変更できない。**
 * 注文明細は注文請書の明細行そのもの（1 行 = 1 明細で固定、分割も統合もしない）
 * なので、「変更してよいか」の判定はここ 1 箇所に集約し、サーバーアクションは
 * 保存前に必ずこれを通す。UI も同じ関数で出し分ける — 判定が 2 箇所に分かれると
 * 画面では編集できるのに保存で弾かれる、という食い違いが必ず起きる。
 *
 * DB 側にも同じ不変条件を CHECK 制約 order_lines_confirmed_complete で置いている
 * （確定済み = 枝番・製品・単価・金額・確定日時が揃っている）。
 */

export type OrderLineStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "IN_PRODUCTION"
  | "PARTIAL_SHIPPED"
  | "SHIPPED"
  | "CANCELLED";

/** 注文請書ヘッダのステータス（明細の編集可否を左右する）。 */
export type AcceptanceStatus =
  | "IMPORT"
  | "DRAFT"
  | "REQUESTED"
  | "APPROVED"
  | "COMPLETED"
  | "ARCHIVED";

/** 編集可否の判定に必要な行の状態。 */
export interface LineLockState {
  status: OrderLineStatus;
  /** 確定時に採番される枝番。null = 未確定。 */
  branch: number | null;
  /** 指示書の承認依頼中ロック。 */
  isLocked: boolean;
}

/** ヘッダがこの状態なら明細を編集してよい（取込中・下書きのみ）。 */
export function isAcceptanceEditable(status: AcceptanceStatus): boolean {
  return status === "IMPORT" || status === "DRAFT";
}

/**
 * 明細内容（製品・数量・単価・納期）を書き換えてよいか。
 *
 * 3 条件すべてが必要 — status だけでは足りない。branch != null は
 * 「公開番号 ORD-…-NN が世に出た」という不可逆な事実の印で、将来
 * status の遷移をいじっても編集を許してしまわないための最後の砦。
 */
export function isLineEditable(line: LineLockState): boolean {
  return line.status === "DRAFT" && line.branch == null && !line.isLocked;
}

/** 編集不可の理由（UI 表示とエラー文言の唯一の出所）。可なら null。 */
export function lineEditBlockReason(line: LineLockState): string | null {
  if (line.branch != null) return "確定済みの注文明細は変更できません";
  if (line.status !== "DRAFT") return "確定済みの注文明細は変更できません";
  if (line.isLocked) return "承認依頼中の注文明細は変更できません";
  return null;
}

/**
 * 注文請書ヘッダ + 明細一式から、明細の全置換（下書き保存・再抽出）が
 * 許されるかを判定する。1 行でも確定済みなら理由を返す。
 */
export function linesReplaceBlockReason(
  acceptanceStatus: AcceptanceStatus,
  lines: LineLockState[],
): string | null {
  if (!isAcceptanceEditable(acceptanceStatus)) {
    return "下書きの注文請書のみ編集できます";
  }
  for (const line of lines) {
    const reason = lineEditBlockReason(line);
    if (reason) return reason;
  }
  return null;
}

/** キャンセル可能か — 出荷済・キャンセル済以降は不可。 */
export function isLineCancellable(
  line: Pick<LineLockState, "status">,
): boolean {
  return line.status !== "SHIPPED" && line.status !== "CANCELLED";
}

/** 在庫照合できるか — 確定済みかつ製造着手前のみ。 */
export function isLineStockCheckable(
  line: Pick<LineLockState, "status">,
): boolean {
  return line.status === "DRAFT" || line.status === "CONFIRMED";
}

/**
 * 出荷累計 → 明細ステータス。変化させるべきでないときは null。
 * 受注数量を超える出荷は呼び出し側で弾く（ここは判定しない）。
 */
export function lineShipStatus(
  orderedQuantity: number,
  shippedQuantity: number,
): "SHIPPED" | "PARTIAL_SHIPPED" | null {
  if (shippedQuantity <= 0) return null;
  return shippedQuantity >= orderedQuantity ? "SHIPPED" : "PARTIAL_SHIPPED";
}

/**
 * 確定時の枝番採番。既存の最大枝番の次から count 個。
 * max + n の形にしているのは、将来「確定済み注文請書に行を足す」フローが
 * 増えても既存の番号を再発行しないため。
 */
export function nextBranches(currentMax: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => currentMax + i + 1);
}

/** 確定してよい明細か（製品と単価が揃っているか）。理由 or null。 */
export function lineConfirmBlockReason(line: {
  productId: number | null;
  unitPrice: unknown;
}): string | null {
  if (line.productId == null) return "製品未特定";
  if (line.unitPrice == null) return "単価未入力";
  return null;
}
