/**
 * work-order-alloc-core — 指示書 ↔ 注文明細の割当（work_order_order_lines）の
 * 純ルール（isomorphic — server 検証と builder 表示の唯一の判定元）。
 *
 * モデル: 1 指示書は複数明細を束ねられ（統合ロット）、1 明細は複数指示書に
 * 分けて手配できる（分割・部分手配）。quantity = その指示書がその明細のために
 * 充当する数量。
 *
 * 不変条件:
 *   - 明細ごと: Σ 割当（キャンセル済み指示書を除く）≤ 受注数量
 *   - 指示書ごと: 予定数量 ≥ Σ 割当（不良予備分の上乗せは自由）
 *   - 割当明細の製品は指示書の製品と同一（1 指示書 = 1 製品 1 ロット）
 *   - FROM_STOCK（在庫分）は割当 1 件のみ・割当数 = 予定数量
 *     （在庫引当の消費先が一意である必要があるため）
 */

/** 保存ペイロードの 1 割当行。 */
export interface AllocationInput {
  orderLineId: string;
  quantity: number;
}

/** 検証に使う明細側の現況（server が集計して渡す）。 */
export interface LineAllocInfo {
  orderLineId: string;
  /** 表示番号（エラーメッセージ用）。 */
  number: string;
  /** 受注数量。 */
  lineQuantity: number;
  /** 他の指示書（キャンセル除く・編集時は自分を除く）の割当合計。 */
  otherAllocated: number;
  productId: number | null;
  status: string;
}

/** この明細にまだ割り当てられる数量（受注数量 − 他の指示書の割当）。 */
export function remainingAllocatable(info: {
  lineQuantity: number;
  otherAllocated: number;
}): number {
  return Math.max(0, info.lineQuantity - info.otherAllocated);
}

/** 割当を受け付ける明細ステータス（キャンセル・出荷済は不可）。 */
export const ALLOCATABLE_LINE_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "IN_PRODUCTION",
  "PARTIAL_SHIPPED",
] as const;

/**
 * 割当リストの検証。最初のエラーメッセージを返す（null = OK）。
 * lines は allocations の orderLineId に対応する現況（不足 = 明細なしエラー）。
 */
export function validateAllocations(args: {
  type: "FROM_STOCK" | "MANUFACTURE";
  plannedQuantity: number;
  allocations: readonly AllocationInput[];
  lines: readonly LineAllocInfo[];
}): string | null {
  const { type, plannedQuantity, allocations, lines } = args;
  if (allocations.length === 0) return null; // 在庫向けの独立指示書
  if (type === "FROM_STOCK" && allocations.length > 1) {
    return "在庫分の指示書は 1 つの注文明細のみ割り当てられます";
  }
  const seen = new Set<string>();
  const byId = new Map(lines.map((l) => [l.orderLineId, l]));
  let productId: number | null = null;
  let total = 0;
  for (const a of allocations) {
    if (seen.has(a.orderLineId)) {
      return "同じ注文明細を複数回割り当てることはできません";
    }
    seen.add(a.orderLineId);
    if (!Number.isInteger(a.quantity) || a.quantity < 1) {
      return "割当数量は1以上の整数で入力してください";
    }
    const line = byId.get(a.orderLineId);
    if (!line) return "対象の注文明細が見つかりません";
    if (
      !(ALLOCATABLE_LINE_STATUSES as readonly string[]).includes(line.status)
    ) {
      return `注文明細 ${line.number} には指示書を割り当てられません（キャンセル・出荷済）`;
    }
    if (line.productId == null) {
      return `注文明細 ${line.number} は製品未特定のため指示書を作成できません`;
    }
    if (productId == null) {
      productId = line.productId;
    } else if (line.productId !== productId) {
      return "1 つの指示書に割り当てる注文明細は同一製品である必要があります";
    }
    const remaining = remainingAllocatable(line);
    if (a.quantity > remaining) {
      return (
        `注文明細 ${line.number} への割当が受注残を超えています` +
        `（受注数量 ${line.lineQuantity} − 手配済 ${line.otherAllocated} = 残 ${remaining}）`
      );
    }
    total += a.quantity;
  }
  if (type === "FROM_STOCK" && plannedQuantity !== total) {
    return "在庫分の指示書は予定数量と割当数量を一致させてください";
  }
  if (plannedQuantity < total) {
    return `予定数量が割当合計 ${total} を下回っています（不良予備分の上乗せは自由ですが、割当合計以上にしてください）`;
  }
  return null;
}

/**
 * 完成数量を割当順に明細へ配分する（出荷候補の既定数量など表示・既定値用）。
 * 統合ロットで 1 つの完成数を複数明細が二重取りしないための決定的な配分。
 */
export function distributeFinished(
  allocations: readonly { orderLineId: string; quantity: number }[],
  finished: number,
): Map<string, number> {
  const out = new Map<string, number>();
  let rest = Math.max(0, finished);
  for (const a of allocations) {
    const take = Math.min(a.quantity, rest);
    out.set(a.orderLineId, take);
    rest -= take;
  }
  return out;
}
