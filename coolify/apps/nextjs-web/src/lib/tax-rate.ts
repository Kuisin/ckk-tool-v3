/**
 * tax-rate.ts — 課税区分の解決（純ロジック・I/O なし）。
 *
 * **区分を決めるのはここ 1 本**。見積フォーム（クライアントのライブ計算）・見積の
 * 合計（純 model）・締日処理（サーバーの凍結）が同じ関数を通る。以前は
 * 「顧客属性 tax_type → 固定表」を 3 か所が別々に呼んでいて、見積書だけが 10%
 * 固定だった時期がある（非課税・軽減税率の顧客に出す見積の税額が請求書と食い違った）。
 *
 * ## 区分の決まり方
 *
 *   顧客の区分が入っていれば **顧客が勝つ**。顧客が null なら「製品に従う」。
 *   製品も null ならマスタの既定（tax_categories.is_default）。
 *
 * 顧客を先に見るのは、非課税の取引先（輸出免税など）に、製品の区分に関わらず 0% を
 * 通さなければならないため。裏を返すと **非課税の顧客は軽減税率の製品も 0% になる** —
 * 直感に反するので、画面は `resolvedFrom` を出して「顧客指定で上書き」と言うこと。
 *
 * ## 率の決まり方
 *
 *   区分の率の履歴から「適用開始日 ≤ 基準日 の中で最も新しい 1 行」。
 *   **基準日は注文日**（order_acceptances.order_date）。税率改正をまたぐ締日でも、
 *   引き渡しの約束をした時点の率が行ごとに付く。注文日は nullable なので
 *   `billingBasisDate()` が 注文日 → 出荷日 → 締日 の順に落とす — 落ち方を 1 本に
 *   閉じておかないと、締日画面の予定額と発行済み請求書がずれる
 *   （billableUnitPrice が解いたのと同じ罠）。
 *
 * 日付はすべて JST の暦日 `YYYY-MM-DD` の**文字列**で比べる（`Date` を跨がせない）。
 * 価格表の有効期間（components/sales/price-lists/model.ts `isWithinValidity`）と同じ流儀。
 */

/** 率の履歴 1 行。`effectiveFrom` は JST 暦日 "YYYY-MM-DD"（当日を含む）。 */
export interface TaxRateRow {
  effectiveFrom: string;
  rate: number;
}

/** 課税区分 1 件（率の履歴つき）。DB から読む形は lib/tax-categories.ts が作る。 */
export interface TaxCategoryRef {
  id: number;
  /** 旧 enum TAX_TYPE の値（TAXABLE / REDUCED / EXEMPT）か、管理者が足したコード。 */
  code: string;
  nameJa: string;
  nameEn: string;
  /** 帳票の税率区分欄に刷る短いラベル。null = 率から組み立てる（"10%"）。 */
  shortLabelJa: string | null;
  shortLabelEn: string | null;
  /** 並び順は問わない（rateOnDate が自分で選ぶ）。 */
  rates: readonly TaxRateRow[];
}

/** 税区分マスタ 1 式。画面へはサーバーがこの形で渡す（クライアントは DB を見ない）。 */
export interface TaxCatalog {
  categories: readonly TaxCategoryRef[];
  /** tax_categories.is_default の行。マスタが空のときだけ null。 */
  defaultCategoryId: number | null;
}

/** 空のカタログ（マスタ未整備・取得失敗時のフォールバック用）。 */
export const EMPTY_TAX_CATALOG: TaxCatalog = {
  categories: [],
  defaultCategoryId: null,
};

/**
 * 旧・固定表。**新しいコードから呼ばないこと** — 税区分マスタが正で、これは
 * (a) マスタに率が無いときの保険、(b) 税区分マスタ導入以前に発行された書類の
 * 読み出しフォールバック、の 2 つだけに使う。
 */
export const FALLBACK_TAX_RATES: Record<string, number> = {
  TAXABLE: 0.1,
  REDUCED: 0.08,
  EXEMPT: 0,
};

/**
 * 旧・課税区分 → 率。未指定・不明は課税扱い（10%）。
 *
 * @deprecated 税区分マスタ（resolveLineTax）へ移行中。残っているのは上記 2 用途のみ。
 */
export function taxRateFor(taxType: string | null | undefined): number {
  return FALLBACK_TAX_RATES[taxType ?? "TAXABLE"] ?? 0.1;
}

/**
 * 基準日に効いている率。適用開始日 ≤ 基準日 の中で**最も新しい** 1 行を採る。
 * どの行も始まっていなければ null（呼び出し側がフォールバックを決める）。
 *
 * 履歴に終了日が無いのは意図的 — 終わりは「次に始まる行の前日」なので、隙間
 * （どの率でもない日）も重なり（2 つの率が当たる日）も作れない。
 */
export function rateOnDate(
  category: TaxCategoryRef,
  basisDate: string,
): number | null {
  let best: TaxRateRow | null = null;
  for (const row of category.rates) {
    if (row.effectiveFrom > basisDate) continue;
    if (best == null || row.effectiveFrom > best.effectiveFrom) best = row;
  }
  return best?.rate ?? null;
}

/** 区分がどこから決まったか。画面の「顧客指定で上書き」バッジと監査のため。 */
export type TaxResolvedFrom = "CUSTOMER" | "PRODUCT" | "DEFAULT" | "FALLBACK";

export interface LineTax {
  /** 解決できた区分。マスタが空なら null。 */
  categoryId: number | null;
  /** 区分のコード（帳票ラベルの分岐に使う）。解決できなければ null。 */
  code: string | null;
  rate: number;
  resolvedFrom: TaxResolvedFrom;
}

/**
 * 顧客優先で区分 id を決める。**customer が null = 「製品に従う」**。
 *
 * 顧客の列を nullable にしたのが移行の要で、既存顧客は全行 backfill 済み
 * （= 誰も「製品に従う」になっていない）ため、移行の時点では製品の区分は
 * どの請求書にも効かない。効かせたい顧客だけを管理者が「製品に従う」に倒す。
 */
export function resolveTaxCategoryId(
  customerTaxCategoryId: number | null | undefined,
  productTaxCategoryId: number | null | undefined,
  defaultCategoryId: number | null,
): number | null {
  return (
    customerTaxCategoryId ?? productTaxCategoryId ?? defaultCategoryId ?? null
  );
}

export interface LineTaxInput {
  customerTaxCategoryId: number | null;
  productTaxCategoryId: number | null;
  /** JST 暦日 "YYYY-MM-DD"。請求は billingBasisDate() が作る。 */
  basisDate: string;
}

/**
 * 明細 1 行の課税区分と率。**一本化の入口** — 画面もサーバーもここを通る。
 *
 * 解決できなかったときは `resolvedFrom: "FALLBACK"` で旧・固定表に落ちる。落とす先を
 * 「一律 10%」ではなく**その区分のコードの旧値**にしてあるのは、率行を入れ忘れた
 * 非課税の区分が黙って 10% で請求されるのを避けるため。
 */
export function resolveLineTax(
  catalog: TaxCatalog,
  input: LineTaxInput,
): LineTax {
  const categoryId = resolveTaxCategoryId(
    input.customerTaxCategoryId,
    input.productTaxCategoryId,
    catalog.defaultCategoryId,
  );
  const category =
    categoryId == null
      ? undefined
      : catalog.categories.find((c) => c.id === categoryId);

  if (category == null) {
    // マスタが空 / 参照先が消えている。旧挙動（課税 10%）に落ちる。
    return {
      categoryId: null,
      code: null,
      rate: taxRateFor(null),
      resolvedFrom: "FALLBACK",
    };
  }

  const resolvedFrom: TaxResolvedFrom =
    input.customerTaxCategoryId != null
      ? "CUSTOMER"
      : input.productTaxCategoryId != null
        ? "PRODUCT"
        : "DEFAULT";

  const rate = rateOnDate(category, input.basisDate);
  if (rate == null) {
    // 区分はあるが、その日に効いている率行が無い（履歴の入れ忘れ・未来日のみ）。
    return {
      categoryId: category.id,
      code: category.code,
      rate: taxRateFor(category.code),
      resolvedFrom: "FALLBACK",
    };
  }
  return { categoryId: category.id, code: category.code, rate, resolvedFrom };
}

/**
 * 請求明細の率基準日 — **注文日**、無ければ 出荷日、それも無ければ 締日。
 *
 * 落ち方をここ 1 本に閉じるのが肝心で、締日画面の予定額（data.ts）と発行済み
 * 請求書（actions.ts）が別々に落ちると、画面と請求額が食い違う。
 * すべて JST 暦日 "YYYY-MM-DD"。
 */
export function billingBasisDate(
  orderDate: string | null | undefined,
  shippedAt: string | null | undefined,
  closingDate: string,
): string {
  return orderDate || shippedAt || closingDate;
}
