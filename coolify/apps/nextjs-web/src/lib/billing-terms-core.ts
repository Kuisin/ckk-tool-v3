/**
 * billing-terms-core.ts — 締日から**支払期日**を出す。純ロジック・client-safe。
 *
 * これまで支払期日は `締日 + 支払サイト日数（既定 30）`だけで、取引先マスタの
 * **支払日**（毎月何日に払うか）を誰も読んでいなかった。日本の商習慣は
 * 「月末締め翌月末払い」「20 日締め翌月 10 日払い」のように**日付**で決まるので、
 * 日数だけで出した期日は実際の入金日とほぼ一致しない — 入金消込の基準にならず、
 * 請求書に刷る「お支払期限」も嘘になる。
 *
 * 規則は 1 つだけ:
 *   **支払日が設定されていれば、それが期日を決める。**
 *   締日 +
 *     支払サイト日数（無ければ 0）を足した日を「最短の期日」とし、
 *   そこ以降で最初に来る支払日が期日。
 *
 * 「そこ以降」の下限は**締日の翌日**にしてある — でないと「月末締め・末日払い」が
 * 締日当日（= 出荷したその日に入金）になってしまう。
 *
 * 支払日が無い取引先は**これまでと 1 日も変わらない**（締日 + 支払サイト、
 * 支払サイトも無ければ既定 30 日）。設定を入れた取引先からだけ挙動が変わる。
 *
 * 日付はすべて UTC 起点の暦日（DB の @db.Date と同じ扱い — model.ts に揃える）。
 */

/** 支払日が未設定のときの支払サイト既定値（従来の挙動）。 */
export const DEFAULT_PAYMENT_TERMS_DAYS = 30;

export interface PaymentTerms {
  /** 支払サイト（日数）。null = 未設定。 */
  paymentTermsDays?: number | null;
  /** 支払日（1–31。31 と月の日数超えは月末）。null = 未設定。 */
  paymentDay?: number | null;
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** その年月の日数（UTC）。 */
function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/**
 * `year`/`month0` の「支払日」に当たる暦日。31 と月の日数を超える指定は月末
 * （締日の closingDateFor と同じ約束 — 2 月の「31 日払い」は 2/28）。
 */
function paymentDateIn(year: number, month0: number, paymentDay: number): Date {
  const day = Math.min(Math.max(paymentDay, 1), daysInMonth(year, month0));
  return new Date(Date.UTC(year, month0, day));
}

/**
 * `floor` 以降で最初に来る支払日。同じ月の支払日が `floor` より前なら翌月へ送る。
 */
function firstPaymentDateOnOrAfter(floor: Date, paymentDay: number): Date {
  const year = floor.getUTCFullYear();
  const month0 = floor.getUTCMonth();
  const thisMonth = paymentDateIn(year, month0, paymentDay);
  if (thisMonth >= floor) return thisMonth;
  return paymentDateIn(year, month0 + 1, paymentDay);
}

/**
 * 支払期日。**唯一の定義元** — 締日処理（請求書の due_date）も画面の表示も
 * ここを通す。別々に計算すると、画面に出ている期日と請求書に刷られた期日が
 * 食い違う。
 */
export function resolveDueDate(closingDate: Date, terms: PaymentTerms): Date {
  const { paymentTermsDays, paymentDay } = terms;
  if (paymentDay == null) {
    // 従来どおり — 締日 + 支払サイト（未設定は 30 日）。
    return addDaysUtc(
      closingDate,
      paymentTermsDays ?? DEFAULT_PAYMENT_TERMS_DAYS,
    );
  }
  // 支払日があるとき: 締日 + 支払サイト を最短の期日とし、**必ず締日の翌日以降**。
  const floor = addDaysUtc(closingDate, Math.max(paymentTermsDays ?? 0, 1));
  return firstPaymentDateOnOrAfter(floor, paymentDay);
}

/**
 * 支払条件を人に読める 1 行にする（締日画面・請求書画面の説明用）。
 * 文言そのものは呼び出し側が `tr` で組む — ここは**どの形か**だけを返す。
 */
export type PaymentTermsShape =
  | { kind: "dayOfMonth"; paymentDay: number; paymentTermsDays: number | null }
  | { kind: "days"; paymentTermsDays: number }
  | { kind: "default"; paymentTermsDays: number };

export function paymentTermsShape(terms: PaymentTerms): PaymentTermsShape {
  if (terms.paymentDay != null) {
    return {
      kind: "dayOfMonth",
      paymentDay: terms.paymentDay,
      paymentTermsDays: terms.paymentTermsDays ?? null,
    };
  }
  if (terms.paymentTermsDays != null) {
    return { kind: "days", paymentTermsDays: terms.paymentTermsDays };
  }
  return { kind: "default", paymentTermsDays: DEFAULT_PAYMENT_TERMS_DAYS };
}

/**
 * 請求書の宛先 — **請求先が設定されていればそちら**、無ければ顧客本人。
 *
 * 取引先マスタの請求先（`bp_customer_attrs.billing_bp_id`）は「請求先が別法人の
 * 場合」のために作られていたが、締日処理が読んでいなかったので**設定しても
 * 何も起きなかった**。親会社へまとめて請求する取引が実在するのに、請求書は
 * 発注元の会社宛で出ていた。
 *
 * ★ **束ねはしない。** 同じ請求先を持つ複数の顧客がいても、請求書は顧客ごとに
 *   1 通のまま（締日行が 顧客 × 締日 で立つ）。宛先だけが請求先になる。
 *   1 通に束ねるのは締日行の単位そのものを変える話で、それは別の判断。
 */
export function resolveBillingPartyId(
  customerBpId: string,
  billingBpId: string | null | undefined,
): string {
  return billingBpId ?? customerBpId;
}
