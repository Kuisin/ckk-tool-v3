/**
 * work-order-links-core.ts — 指示書→指示書リンク（work_order_links）の純ロジック。
 *
 * source の完成数が target の受入として渡る（例: リブ母材 WO → 製品 WO）。
 * ここが不変条件の唯一の判定元:
 *   - 自己リンク禁止（DB CHECK のバックストップあり）
 *   - 重複リンク禁止（DB unique のバックストップあり）
 *   - 閉路禁止（wouldCreateCycle — DB では守れないためサーバー tx 内で必ず通す）
 *   - quantity は 1 以上 or null（null = 完了時の完成数全量）
 */

export interface WoLinkEdge {
  sourceWorkOrderId: string;
  targetWorkOrderId: string;
}

/**
 * 既存エッジ集合に newEdge を足すと閉路ができるか。
 * target から辿って source に戻れたら閉路（DFS）。
 */
export function wouldCreateCycle(
  edges: readonly WoLinkEdge[],
  newEdge: WoLinkEdge,
): boolean {
  if (newEdge.sourceWorkOrderId === newEdge.targetWorkOrderId) return true;
  const bySource = new Map<string, string[]>();
  for (const e of edges) {
    const list = bySource.get(e.sourceWorkOrderId) ?? [];
    list.push(e.targetWorkOrderId);
    bySource.set(e.sourceWorkOrderId, list);
  }
  // newEdge.target から下流を辿り、newEdge.source に到達したら閉路
  const seen = new Set<string>();
  const stack = [newEdge.targetWorkOrderId];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (cur === newEdge.sourceWorkOrderId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of bySource.get(cur) ?? []) stack.push(next);
  }
  return false;
}

export type WoLinkIssue =
  | { kind: "SELF" }
  | { kind: "DUPLICATE" }
  | { kind: "CYCLE" }
  | { kind: "QUANTITY" };

/** リンク追加の純検証（存在・状態の検証はサーバー層が行う）。 */
export function validateNewWoLink(
  edges: readonly WoLinkEdge[],
  newEdge: WoLinkEdge,
  quantity: number | null,
): WoLinkIssue | null {
  if (newEdge.sourceWorkOrderId === newEdge.targetWorkOrderId)
    return { kind: "SELF" };
  if (
    edges.some(
      (e) =>
        e.sourceWorkOrderId === newEdge.sourceWorkOrderId &&
        e.targetWorkOrderId === newEdge.targetWorkOrderId,
    )
  )
    return { kind: "DUPLICATE" };
  if (quantity != null && (!Number.isInteger(quantity) || quantity < 1))
    return { kind: "QUANTITY" };
  if (wouldCreateCycle(edges, newEdge)) return { kind: "CYCLE" };
  return null;
}

export const WO_LINK_ISSUE_MESSAGE: Record<WoLinkIssue["kind"], string> = {
  SELF: "同じ指示書へはリンクできません",
  DUPLICATE: "この指示書へのリンクは既にあります",
  CYCLE: "リンクが循環します（先行関係が閉路になる）",
  QUANTITY: "受け渡し数量は 1 以上の整数で入力してください",
};
