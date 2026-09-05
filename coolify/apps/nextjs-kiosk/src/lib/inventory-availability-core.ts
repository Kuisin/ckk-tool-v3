/**
 * inventory-availability-core.ts — 「この出荷が実際に引ける数」の判定（純関数）。
 *
 * 出荷（DISPATCH）はロット在庫のバケット（保管場所×棚で分かれる）から順に
 * 出庫する。ここで **`quantity` をそのまま取ってはいけない** — その数には
 * *他の注文明細*が押さえている予約（`reserved_quantity`）が含まれる。含めた
 * まま出すと、明細 A の出荷が明細 B（在庫からの手配 FROM_STOCK）のために
 * 確保してあった在庫を食い、あとから B が「在庫不足」で出せなくなる。
 * 予約の意味が「先に取ってある」ではなく「早い者勝ち」になってしまう。
 *
 * したがって 1 バケットで引ける数は:
 *
 *   引ける数 = quantity − reserved_quantity + （**この注文明細自身**の予約分）
 *
 * 最後の項が要るのは、その明細のための予約は他人のものではなく、まさに
 * この出荷で消費するために取ってあるから。引かないと自分の予約に自分で
 * 阻まれ、正しく引き当ててある出荷ほど失敗する。予約は出庫後に
 * RELEASE される（onDeliveryOrderShippedTx の後段）ので、二重には効かない。
 *
 * 注文明細に紐づかない出荷（`orderLineId` が null）は自分の予約が無いので、
 * 単純に「予約されていない分」だけを引く。
 */

/** 在庫バケット 1 行分（判定に要る列だけ）。 */
export interface AvailabilityBucket {
  id: string;
  quantity: number;
  reservedQuantity: number;
}

/** その出荷明細に属する生きた予約（RESERVED | CONFIRMED）の、バケット別合計。 */
export type OwnReservedByBucket = ReadonlyMap<string, number>;

/**
 * 1 バケットから引ける数（0 未満にはしない）。
 * `ownReserved` はそのバケットに対する**この注文明細自身**の予約数。
 */
export function bucketAvailable(
  bucket: AvailabilityBucket,
  ownReserved = 0,
): number {
  const free = bucket.quantity - bucket.reservedQuantity + ownReserved;
  // 自分の予約分を足しても、実在庫（quantity）を超えては引けない。
  return Math.max(0, Math.min(free, bucket.quantity));
}

/** 全バケットの合計。出荷前に「そもそも足りるか」を見るために使う。 */
export function totalAvailable(
  buckets: readonly AvailabilityBucket[],
  ownReserved: OwnReservedByBucket = new Map(),
): number {
  return buckets.reduce(
    (sum, b) => sum + bucketAvailable(b, ownReserved.get(b.id) ?? 0),
    0,
  );
}

/** 1 バケットからの取り分（バケットごとの引ける数と残要求のうち小さいほう）。 */
export interface AllocationStep {
  bucketId: string;
  take: number;
}

/**
 * 要求数をバケット順に割り付ける。
 * `shortfall > 0` なら在庫不足 — 呼び出し側は 1 件も出庫せずに失敗させること
 * （部分的に出してから落ちると、台帳だけ減って出荷は立たない）。
 */
export function allocateFromBuckets(
  buckets: readonly AvailabilityBucket[],
  requested: number,
  ownReserved: OwnReservedByBucket = new Map(),
): { steps: AllocationStep[]; shortfall: number } {
  let remaining = requested;
  const steps: AllocationStep[] = [];
  for (const b of buckets) {
    if (remaining <= 0) break;
    const take = Math.min(
      bucketAvailable(b, ownReserved.get(b.id) ?? 0),
      remaining,
    );
    if (take <= 0) continue;
    steps.push({ bucketId: b.id, take });
    remaining -= take;
  }
  return { steps, shortfall: Math.max(0, remaining) };
}
