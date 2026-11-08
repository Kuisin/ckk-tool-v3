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
 *     ※ 比べるのは **品目 id（items.id）**。旧 products.id と値の意味が違う
 *       だけで型は同じ number なので、混ぜても型では止まらない（列名を
 *       itemId にしてあるのはそのため — option-search.ts 冒頭の節）。
 *   - FROM_STOCK（在庫分）は割当 1 件のみ・割当数 = 予定数量
 *     （在庫引当の消費先が一意である必要があるため）
 *   - REGRIND（再研磨）も割当 1 件のみ・割当数 = 予定数量。しかも明細は
 *     注文種別 REGRIND のものだけ（顧客の工具を預かって返す注文）。逆に
 *     REGRIND の明細は再研磨の指示書にしか割り当てられない —
 *     製造分に載ると、他社の工具が自社の完成品として入庫する。
 *     所有者（預り品バケットの顧客）は割当明細から導くので 1 件に限る。
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
  /** 明細の製品 — **品目 id（items.id）**。未突合の明細は null。 */
  itemId: number | null;
  /**
   * 再研磨の明細が指す**工具**（品目 id）。再研磨では itemId が「売る役務」
   * （再研磨品目）なので、指示書が預かって研いで返す物はこちら。
   */
  toolItemId?: number | null;
  status: string;
  /** 注文種別（ORDER_TYPE）。REGRIND の明細は再研磨の指示書だけに載る。 */
  orderType?: string;
}

/** 指示書の種別（app.WORK_ORDER_TYPE）。lib/workflow-core.ts と同じ集合。 */
export type AllocWorkOrderType = "FROM_STOCK" | "MANUFACTURE" | "REGRIND";

/**
 * その注文明細から作る指示書の**種別**。
 *
 * **製造か再研磨かを決めるのは注文請書**（明細の注文種別）で、指示書ではない。
 * 顧客が「研ぎ直してほしい」と言ったものを製造分で作り直すことは無いし、その逆も
 * 無い。だから指示書側では選ばせず、明細から決める。
 *
 * 決まるのは**再研磨かどうかの軸だけ**。再研磨でない明細は、在庫から出すのか
 * 作るのか（在庫分 / 製造分）がまだ決まっておらず、それは生産側の判断なので
 * `preferred` で受ける。
 *
 * ここが唯一の定義元 — 以前は注文明細の詳細・未処理指示書の一覧・指示書
 * ビルダーがそれぞれ `orderType === "REGRIND"` を書いていて、URL に
 * `&type=REGRIND` を付け忘れた入口が実際にあった。
 *
 * @param orderType 明細の注文種別（null / 未指定 = 明細に紐づかない在庫向け）
 * @param preferred 呼び出し側の希望（URL のプリセット等）。再研磨の明細では無視する
 */
export function workOrderTypeForLine(
  orderType: string | null | undefined,
  preferred?: AllocWorkOrderType | null,
): AllocWorkOrderType {
  if (orderType === "REGRIND") return "REGRIND";
  // 再研磨でない明細に再研磨の指示書は作れない（逆も）— validateAllocations が
  // 保存側でも同じことを言う。希望が再研磨なら黙って製造分へ落とす。
  if (preferred === "FROM_STOCK" || preferred === "MANUFACTURE") {
    return preferred;
  }
  return "MANUFACTURE";
}

/**
 * その明細に対して**指示書が扱う物**の品目 id。
 *
 * 製造・在庫分はそのまま明細の製品。**再研磨だけ違う** — 明細の itemId は
 * 「再研磨という役務」（値段が付いている品目）で、工場が受け取って研いで
 * 返すのは工具のほう。指示書の対象・預り品のバケット・出荷する物は全部
 * 工具で数えるので、ここで 1 回だけ読み替える。
 */
export function allocTargetItemId(
  line: Pick<LineAllocInfo, "itemId" | "toolItemId" | "orderType">,
): number | null {
  return line.orderType === "REGRIND" ? (line.toolItemId ?? null) : line.itemId;
}

/** この明細にまだ割り当てられる数量（受注数量 − 他の指示書の割当）。 */
export function remainingAllocatable(info: {
  lineQuantity: number;
  otherAllocated: number;
}): number {
  return Math.max(0, info.lineQuantity - info.otherAllocated);
}

/**
 * 割当を受け付ける明細ステータス（未確定・キャンセル・出荷済は不可）。
 * DRAFT（注文請書が未確定）は含めない — 枝番も金額も無く、確定時に行が
 * 消える・数量が変わることがあるので、指示書を先に紐付けると割当の前提が
 * 崩れる。
 */
export const ALLOCATABLE_LINE_STATUSES = [
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
    type: AllocWorkOrderType;
    plannedQuantity: number;
    allocations: readonly AllocationInput[];
    lines: readonly LineAllocInfo[];
  },
  tr: TrLike,
): string | null {
  const { type, plannedQuantity, allocations, lines } = args;
  if (allocations.length === 0) {
    // 在庫向けの独立指示書（製造分のみ）。再研磨は顧客の物を預かるので明細が要る。
    if (type === "REGRIND")
      return tr("production.workOrderActions.regrindOrderRequiresOrderLine");
    return null;
  }
  // 在庫分・再研磨は明細 1 件だけ（消費先 / 所有者が一意である必要がある）。
  if (type === "FROM_STOCK" && allocations.length > 1) {
    return tr("production.workOrderActions.stockWorkOrderOneLineOnly");
  }
  if (type === "REGRIND" && allocations.length > 1) {
    return tr("production.workOrderActions.regrindWorkOrderOneLineOnly");
  }
  const seen = new Set<string>();
  const byId = new Map(lines.map((l) => [l.orderLineId, l]));
  let itemId: number | null = null;
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
    if (line.itemId == null) {
      return tr(
        "production.workOrderActions.orderLineProductUnresolvedForLine",
        {
          number: line.number,
        },
      );
    }
    // 再研磨の明細は「何を研ぐのか」が決まっていないと指示書にできない。
    if (line.orderType === "REGRIND" && line.toolItemId == null) {
      return tr("production.workOrderActions.regrindLineToolMissing", {
        number: line.number,
      });
    }
    // 再研磨の明細 ⇄ 再研磨の指示書 は 1 対 1 の対応。混ぜると他社の工具が
    // 自社の完成品として入庫する（製造分）か、作るはずの物が預り品になる。
    const lineIsRegrind = line.orderType === "REGRIND";
    if (type === "REGRIND" && !lineIsRegrind) {
      return tr("production.workOrderActions.regrindLinesOnly");
    }
    if (type !== "REGRIND" && lineIsRegrind) {
      return tr(
        "production.workOrderActions.regrindLineRequiresRegrindWorkOrder",
      );
    }
    // 同じ指示書に載る明細は同じ物でなければならない。再研磨では
    // その「物」は工具（allocTargetItemId）。
    const target = allocTargetItemId(line);
    if (itemId == null) {
      itemId = target;
    } else if (target !== itemId) {
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
  if (type === "REGRIND" && plannedQuantity !== total) {
    return tr(
      "production.workOrderActions.regrindPlannedQuantityMustMatchAllocation",
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
