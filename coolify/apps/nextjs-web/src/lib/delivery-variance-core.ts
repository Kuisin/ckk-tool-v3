/**
 * delivery-variance-core.ts — 過不足納品の判定（pure / client-safe・依存なし）。
 *
 * 「受注 100 本に対して 98 本しか出来なかった」「端数で 102 本になった」を
 * そのまま納品してよいのか、その手前に決裁が要るのか、請求はいくらか。
 * この 4 つの問いに答えるのがこのファイルで、**画面もサーバーも必ずここを通す**。
 *
 * 判断の主体は 3 つあり、どれか 1 つでも欠けると過不足出荷にはならない:
 *
 *   1. 指示書（work_orders.allow_quantity_variance）
 *      「このロットは過不足のまま出してよい」— 生産側の許可。既定は false で、
 *      false なら顧客がどれだけ寛容でも受注数量ちょうどしか出せない。
 *
 *   2. 顧客（bp_customer_attrs.delivery_tolerance_*）
 *      「どこまでのずれなら受け取る」— 商流の約束。基準（% / 数量）1 つに対して
 *      不足側・超過側の幅を持つ。未設定は 0 = その側を認めない。
 *
 *   3. 顧客（bp_customer_attrs.variance_approval_*）
 *      「ずれたとき決裁を挟むか」— 範囲の**内**と**外**で別々に設定する。
 *      内は既定 false（現場が止まらない）、外は既定 true（黙って通さない）。
 *
 * ★ 範囲の外は「禁止」ではなく「既定で承認が要る」。禁止したいときは指示書の
 *   許可を出さない（1 が唯一の可否スイッチ）。ここを取り違えると、範囲外の
 *   出荷が承認を経ずに素通りする設定を作ってしまう。
 *
 * ★ 判定に使う数量は **その注文明細の累計納品数**（この出荷書のぶんを含む）で、
 *   出荷書 1 通ぶんではない。分割出荷で 50 + 48 と積んだとき、2 通目だけを見て
 *   「52 本不足」と言っても意味が無い。顧客が受け取る総量だけが約束の相手。
 */

/** 許容幅の尺度（bp_customer_attrs.delivery_tolerance_basis）。 */
export type DeliveryToleranceBasis = "PERCENT" | "QUANTITY";

/** 顧客が持つ過不足の設定一式。 */
export interface DeliveryTolerance {
  basis: DeliveryToleranceBasis;
  /** 不足側の許容幅。null = 0 = 不足を認めない。 */
  under: number | null;
  /** 超過側の許容幅。null = 0 = 超過を認めない。 */
  over: number | null;
  /** 許容範囲の内側の過不足でも承認を要求するか。 */
  approvalWithin: boolean;
  /** 許容範囲の外側の過不足で承認を要求するか。 */
  approvalOutside: boolean;
}

/**
 * 顧客属性が無い / CUSTOMER ロールが付いていない相手の既定。
 *
 * 幅ゼロ + 範囲外は承認必須 = 「過不足はすべて決裁を通す」。マスタ未設定を
 * 「制限なし」に倒すと、設定を忘れた顧客が最も緩くなる（設定漏れが最も危険な
 * 側に落ちる）ので、未設定は必ず厳しい側にする。
 */
export const DEFAULT_DELIVERY_TOLERANCE: DeliveryTolerance = {
  basis: "PERCENT",
  under: null,
  over: null,
  approvalWithin: false,
  approvalOutside: true,
};

/** 受注数量に対する納品数量の向き。 */
export type VarianceKind = "EXACT" | "SHORT" | "OVER";

export interface DeliveryVarianceVerdict {
  /** 納品数 − 受注数（負 = 不足 / 正 = 超過）。 */
  variance: number;
  kind: VarianceKind;
  /** その向きに許された幅（受注数量に対する絶対量へ正規化済み）。 */
  allowance: number;
  /** |variance| ≤ allowance か。EXACT は常に true。 */
  withinTolerance: boolean;
  /** この納品数で出荷するのに承認が要るか。EXACT は常に false。 */
  approvalRequired: boolean;
}

/**
 * 片側の許容幅を「本数」に直す。% 基準は受注数量に掛けてから **切り捨てない** —
 * 100 本の 2% は 2 本で、97 本（3 本不足）は範囲外。小数のまま比較することで
 * 「99.5 本まで」のような端数の丸め方を決めずに済む。
 *
 * 受注数量が 0 以下、または幅が未設定・負なら 0（その側を認めない）。
 */
export function toleranceAllowance(
  orderedQuantity: number,
  tolerance: DeliveryTolerance,
  side: "under" | "over",
): number {
  const raw = side === "under" ? tolerance.under : tolerance.over;
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return 0;
  if (tolerance.basis === "QUANTITY") return raw;
  if (!(orderedQuantity > 0)) return 0;
  return (orderedQuantity * raw) / 100;
}

/**
 * 受注数量と累計納品数量から、向き・範囲内か・承認が要るかを決める。
 *
 * `deliveredQuantity` は**その注文明細の累計**（この出荷書のぶんを含む）。
 */
export function evaluateDeliveryVariance(input: {
  orderedQuantity: number;
  deliveredQuantity: number;
  tolerance: DeliveryTolerance;
}): DeliveryVarianceVerdict {
  const variance = input.deliveredQuantity - input.orderedQuantity;
  if (variance === 0) {
    return {
      variance: 0,
      kind: "EXACT",
      allowance: 0,
      withinTolerance: true,
      approvalRequired: false,
    };
  }
  const kind: VarianceKind = variance > 0 ? "OVER" : "SHORT";
  const allowance = toleranceAllowance(
    input.orderedQuantity,
    input.tolerance,
    kind === "OVER" ? "over" : "under",
  );
  const withinTolerance = Math.abs(variance) <= allowance;
  return {
    variance,
    kind,
    allowance,
    withinTolerance,
    approvalRequired: withinTolerance
      ? input.tolerance.approvalWithin
      : input.tolerance.approvalOutside,
  };
}

/**
 * その注文明細に過不足納品が許されているか = 関連する指示書のうち **1 つでも**
 * 「過不足のまま出してよい」ものがあるか。
 *
 * 「全部」ではなく「1 つでも」なのは、分割手配された明細の最後のロットだけが
 * 端数になるのが普通だから。全ロットに印を付けないと出せない仕様にすると、
 * 端数の出た 1 ロットのために過去のロットまで遡って設定し直すことになる。
 * 逆に、印を 1 つも付けなければ従来どおり受注数量ちょうどしか出せない。
 *
 * 指示書が 1 件も無い明細（在庫からの直接出荷など）は false = 従来どおり。
 */
export function lineVariancePermitted(
  workOrders: readonly { allowQuantityVariance: boolean }[],
): boolean {
  return workOrders.some((w) => w.allowQuantityVariance);
}

/**
 * 出荷後の注文明細ステータス。変えるべきでないときは null。
 *
 * `closesLine` は出荷書の「この出荷で締める」宣言（delivery_orders.
 * closes_order_lines）。不足納品と一部出荷は数量では見分けが付かないので、
 * 締めたかどうかは人の宣言でしか決まらない。
 *
 * 超過（納品 > 受注）は宣言を待たずに SHIPPED — もう出す残りが無い。
 */
export function deliveredLineStatus(
  orderedQuantity: number,
  deliveredQuantity: number,
  closesLine: boolean,
): "SHIPPED" | "PARTIAL_SHIPPED" | null {
  if (deliveredQuantity <= 0) return null;
  if (deliveredQuantity >= orderedQuantity) return "SHIPPED";
  return closesLine ? "SHIPPED" : "PARTIAL_SHIPPED";
}

/**
 * **許容範囲に収まったまま**この出荷書に積める数量（1 注文明細ぶん）。
 *
 * これは保存の上限ではない — 過不足が許されているなら、範囲を超える数量も
 * 積める（顧客設定が要求すれば承認を通る）。ここが答えるのは「どこから先が
 * 範囲外になるか」で、画面が入力中に注意を出すための線。**唯一の禁止**は
 * 「指示書が過不足を許していないのに受注数を超える」ことで、それは
 * `variancePermitted` が false のときの戻り値（= 受注残）が表す。
 *
 * 許容幅は端数を持ちうる（% 基準）ので、本数としては切り捨てる。
 */
export function toleranceLoadLimit(input: {
  orderedQuantity: number;
  /** 他の出荷書に既に載っている数量（下書きを含む）。 */
  otherDeliveredQuantity: number;
  variancePermitted: boolean;
  tolerance: DeliveryTolerance;
}): number {
  const base = input.orderedQuantity - input.otherDeliveredQuantity;
  if (!input.variancePermitted) return Math.max(0, base);
  const over = Math.floor(
    toleranceAllowance(input.orderedQuantity, input.tolerance, "over"),
  );
  return Math.max(0, base + over);
}

/** 画面のバッジ・文言が引く i18n キーの語尾（EXACT は表示しない）。 */
export function varianceMessageKey(
  kind: VarianceKind,
): "short" | "over" | null {
  return kind === "SHORT" ? "short" : kind === "OVER" ? "over" : null;
}
