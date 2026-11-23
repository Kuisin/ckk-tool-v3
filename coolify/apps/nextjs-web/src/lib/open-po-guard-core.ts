/**
 * open-po-guard-core.ts — 素材入荷（PU03）で「発注済みの素材を直接調達として
 * 入れようとしていないか」を見る（純ロジック）。
 *
 * なぜ要るか: PU03 の入荷は発注明細に紐づかない（直接調達）。発注書で注文
 * した素材の一部が届いたときに PU03 で記録すると、発注書の残数量が減らない
 * まま在庫に入り、あとで発注書の「入荷完了」を押すと**同じ素材がもう一度
 * 入庫する**。発注した分は素材発注書の「分割入荷」で記録する。
 *
 * ここは止めない — 同じ素材を同じ仕入先から別に買うことは実際にある。
 * 引っかかったら**確認させる**（画面がチェックを要求し、サーバーも確認なしの
 * 保存を拒む）。
 */

export interface OpenPoLine {
  purchaseOrderId: string;
  poNumber: string;
  supplierBpId: string;
  itemId: number;
  /** 発注数 − 累計入荷数（> 0 のものだけ渡す想定だが、ここでも見る）。 */
  remaining: number;
  unit: string;
}

export interface ReceiptCandidate {
  itemId: number;
  /** 未選択（null）なら仕入先を問わず同じ素材を見る。 */
  supplierBpId: string | null;
}

/**
 * 候補に当たる「発注済み・未入荷あり」の発注明細。発注書単位で 1 件にまとめ、
 * 発注番号順に並べる（画面にそのまま出す）。
 */
export function openPoConflicts(
  lines: OpenPoLine[],
  candidates: ReceiptCandidate[],
): OpenPoLine[] {
  const hits = new Map<string, OpenPoLine>();
  for (const line of lines) {
    if (!(line.remaining > 0)) continue;
    const match = candidates.some(
      (c) =>
        c.itemId === line.itemId &&
        (c.supplierBpId == null || c.supplierBpId === line.supplierBpId),
    );
    if (!match) continue;
    const key = `${line.purchaseOrderId}:${line.itemId}`;
    const prev = hits.get(key);
    hits.set(
      key,
      prev ? { ...prev, remaining: prev.remaining + line.remaining } : line,
    );
  }
  return [...hits.values()].sort((a, b) =>
    a.poNumber.localeCompare(b.poNumber),
  );
}
