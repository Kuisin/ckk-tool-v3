/**
 * atp-core.ts — 素材の available-to-promise 純ロジック（§5 素材判断）。
 *
 * available = 手持ち（on-hand）− 予約（reserved）+ 入荷予定（on-order:
 * 発注 ORDERED の明細を expected_at 順に累積）。Prisma I/O は lib/atp.ts。
 */

export interface AtpSupply {
  /** 入荷予定日（ISO yyyy-mm-dd）。未定（null）は末尾に「日付未定」として扱う。 */
  date: string | null;
  quantity: number;
  /** 参照（発注番号 PO-… 等）。 */
  ref?: string;
}

export interface AtpInput {
  onHand: number;
  reserved: number;
  expectedReceipts: AtpSupply[];
}

export interface AtpPoint {
  /** null = 現時点（入荷予定を含まない）。 */
  date: string | null;
  /** その日の入荷量（現時点行は 0）。 */
  delta: number;
  /** 累積 available。 */
  available: number;
  refs: string[];
}

/** 現時点の available（入荷予定を含まない）。 */
export function atpNow(input: AtpInput): number {
  return input.onHand - input.reserved;
}

/**
 * ATP タイムライン: 現時点行 + 入荷予定日ごとの累積行（同日はマージ）。
 * 日付未定（date=null）の入荷は最終行「未定」として末尾に置く。
 */
export function buildAtpTimeline(input: AtpInput): AtpPoint[] {
  const points: AtpPoint[] = [
    { date: null, delta: 0, available: atpNow(input), refs: [] },
  ];

  const dated = input.expectedReceipts
    .filter((r) => r.date != null)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const undated = input.expectedReceipts.filter((r) => r.date == null);

  let acc = atpNow(input);
  let i = 0;
  while (i < dated.length) {
    const date = dated[i].date;
    let delta = 0;
    const refs: string[] = [];
    while (i < dated.length && dated[i].date === date) {
      delta += dated[i].quantity;
      if (dated[i].ref) refs.push(dated[i].ref as string);
      i++;
    }
    acc += delta;
    points.push({ date, delta, available: acc, refs });
  }

  if (undated.length > 0) {
    const delta = undated.reduce((s, r) => s + r.quantity, 0);
    acc += delta;
    points.push({
      date: "9999-12-31", // 「未定」マーカー（表示側で 未定 と描画）
      delta,
      available: acc,
      refs: undated.flatMap((r) => (r.ref ? [r.ref] : [])),
    });
  }

  return points;
}

/** 指定日時点の available（その日までの入荷予定を含む。未定分は含まない）。 */
export function availableOn(input: AtpInput, date: string): number {
  let acc = atpNow(input);
  for (const r of input.expectedReceipts) {
    if (r.date != null && r.date <= date) acc += r.quantity;
  }
  return acc;
}
