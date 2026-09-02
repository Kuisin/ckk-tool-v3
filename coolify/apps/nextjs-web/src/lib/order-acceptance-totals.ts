/**
 * order-acceptance-totals.ts — 注文請書の明細の合計。純ロジック。
 *
 * 合計は 3 か所（詳細のヘッダ要約・明細表の合計行・編集中の明細エディタ）に
 * 出る。同じ数え方を 3 回書くと必ずずれるので、ここ 1 本に寄せる。
 *
 * **単価が未入力の行がある**のがこの書類の常態（抽出で読めなかった / まだ
 * 決めていない）。金額はその行を足せないので、合計は「出せる行の合計」+
 * 「出せなかった行数」の 2 つで持つ — 画面はそれを添えて出す。黙って
 * 少ない金額だけを見せると、それが総額だと読まれてしまう。
 */

/** 合計に必要な明細 1 行ぶん（詳細の view とエディタの行の共通部分）。 */
export interface AcceptanceTotalsItem {
  /** 製品マスタ突合済みの id。null = 製品未特定。 */
  productId: string | null;
  quantity: number;
  /** 未入力は null（金額を出せない）。 */
  unitPrice: number | null;
}

export interface AcceptanceTotals {
  /** 明細の行数。 */
  lineCount: number;
  /** 突合済み製品の**種類**数（同じ製品の複数行は 1 と数える）。 */
  productCount: number;
  /** 製品未特定の行数。 */
  unmatchedCount: number;
  /** 合計数量（全行）。 */
  quantity: number;
  /** 金額を出せた行の合計。 */
  amount: number;
  /** 単価未入力で amount に入っていない行数。 */
  unpricedCount: number;
}

const isFinitePositive = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

export function acceptanceTotals(
  items: readonly AcceptanceTotalsItem[],
): AcceptanceTotals {
  const products = new Set<string>();
  let unmatchedCount = 0;
  let quantity = 0;
  let amount = 0;
  let unpricedCount = 0;

  for (const it of items) {
    if (it.productId) products.add(it.productId);
    else unmatchedCount += 1;
    const q = isFinitePositive(it.quantity) ? it.quantity : 0;
    quantity += q;
    if (isFinitePositive(it.unitPrice)) amount += it.unitPrice * q;
    else unpricedCount += 1;
  }

  return {
    lineCount: items.length,
    productCount: products.size,
    unmatchedCount,
    quantity,
    amount,
    unpricedCount,
  };
}

/**
 * ヘッダに 1 行で出す製品の要約。
 *
 * 「何を頼まれた書類か」は製品名で決まるのに、これまでは明細表を開かないと
 * 分からなかった。全部並べるとヘッダが壊れるので、**先頭 + ほか N 種**にする
 * （完全な一覧はツールチップに出す — 呼び出し側で `names` を使う）。
 */
/** next-intl の `t()` と互換の最小の形（サーバー/クライアントどちらの実体も渡せる）。 */
type TrLike = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

export function productSummary(
  items: readonly { productName: string | null; productText: string | null }[],
  tr: TrLike,
): { label: string; names: string[] } {
  const names: string[] = [];
  for (const it of items) {
    // 突合済みならマスタ名（コードは付けない — 並べると長い）。未突合でも
    // 「注文書にこう書かれていた」は出す（何の書類かを掴む役には立つ）。
    const name = it.productName?.trim() || it.productText?.trim();
    if (name && !names.includes(name)) names.push(name);
  }
  if (names.length === 0) return { label: "—", names };
  const [first, ...rest] = names;
  return {
    label:
      rest.length > 0
        ? tr("sales.orderAcceptanceDetail.productSummaryAndMore", {
            first,
            count: rest.length,
          })
        : first,
    names,
  };
}
