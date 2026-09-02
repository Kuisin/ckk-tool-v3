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

/** next-intl の `t()` と互換の最小の形（サーバー/クライアントどちらの実体も渡せる）。 */
type TrLike = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

/**
 * 割当リストの検証。最初のエラーメッセージを返す（null = OK）。
 * lines は allocations の orderLineId に対応する現況（不足 = 明細なしエラー）。
 */
export function validateAllocations(
  args: {
    type: "FROM_STOCK" | "MANUFACTURE";
    plannedQuantity: number;
    allocations: readonly AllocationInput[];
    lines: readonly LineAllocInfo[];
  },
  tr: TrLike,
): string | null {
  const { type, plannedQuantity, allocations, lines } = args;
  if (allocations.length === 0) return null; // 在庫向けの独立指示書
  if (type === "FROM_STOCK" && allocations.length > 1) {
    return tr("production.workOrderActions.stockWorkOrderOneLineOnly");
  }
  const seen = new Set<string>();
  const byId = new Map(lines.map((l) => [l.orderLineId, l]));
  let productId: number | null = null;
  let total = 0;
  for (const a of allocations) {
    if (seen.has(a.orderLineId)) {
      return tr("production.workOrderActions.duplicateOrderLineAllocation");
    }
    seen.add(a.orderLineId);
    if (!Number.isInteger(a.quantity) || a.quantity < 1) {
      return tr(
        "production.workOrderActions.allocationQuantityMustBePositiveInteger",
      );
    }
    const line = byId.get(a.orderLineId);
    if (!line) return tr("production.workOrderActions.orderLineNotFound");
    if (
      !(ALLOCATABLE_LINE_STATUSES as readonly string[]).includes(line.status)
    ) {
      return tr("production.workOrderActions.orderLineNotAllocatable", {
        number: line.number,
      });
    }
    if (line.productId == null) {
      return tr(
        "production.workOrderActions.orderLineProductUnresolvedForLine",
        {
          number: line.number,
        },
      );
    }
    if (productId == null) {
      productId = line.productId;
    } else if (line.productId !== productId) {
      return tr("production.workOrderActions.allocationsMustShareProduct");
    }
    const remaining = remainingAllocatable(line);
    if (a.quantity > remaining) {
      return tr("production.workOrderActions.allocationExceedsRemaining", {
        number: line.number,
        lineQuantity: line.lineQuantity,
        otherAllocated: line.otherAllocated,
        remaining,
      });
    }
    total += a.quantity;
  }
  if (type === "FROM_STOCK" && plannedQuantity !== total) {
    return tr(
      "production.workOrderActions.stockPlannedQuantityMustMatchAllocation",
    );
  }
  if (plannedQuantity < total) {
    return tr(
      "production.workOrderActions.plannedQuantityBelowAllocationTotal",
      {
        total,
      },
    );
  }
  return null;
}

/** 実効割当の計算に使う 1 リンク分の入力。 */
export interface EffectiveAllocLink {
  quantity: number;
  /** WORK_ORDER_STATUS。 */
  workOrderStatus: string;
  /**
   * 完了済み指示書での、この明細への実際の完成配分（distributeFinished の
   * 取り分）。未完了は null。
   */
  finishedShare: number | null;
}

/**
 * 明細から見た「手配済み」の実効値。
 *
 * 未完了の指示書は割当数のまま（作る約束）。**完了済みは実際にできた分**
 * （min(割当数, 完成配分)）— 不良が多くて割当より少なくしかできなかった
 * 指示書のぶんは受注残へ戻り、追加の指示書を割り当て直せる。
 * キャンセル済みは 0。
 */
export function effectiveAllocated(
  links: readonly EffectiveAllocLink[],
): number {
  let total = 0;
  for (const l of links) {
    if (l.workOrderStatus === "CANCELLED") continue;
    if (l.workOrderStatus === "COMPLETED" && l.finishedShare != null) {
      total += Math.min(l.quantity, l.finishedShare);
    } else {
      total += l.quantity;
    }
  }
  return total;
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
