import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAYMENT_TERMS_DAYS,
  paymentTermsShape,
  resolveBillingPartyId,
  resolveDueDate,
} from "./billing-terms-core";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("resolveDueDate — 支払日が未設定（従来の挙動）", () => {
  it("締日 + 支払サイト", () => {
    expect(iso(resolveDueDate(d("2026-06-30"), { paymentTermsDays: 60 }))).toBe(
      "2026-08-29",
    );
  });

  it("支払サイトも無ければ既定 30 日", () => {
    expect(iso(resolveDueDate(d("2026-06-30"), {}))).toBe("2026-07-30");
    expect(DEFAULT_PAYMENT_TERMS_DAYS).toBe(30);
  });
});

describe("resolveDueDate — 支払日があるとき", () => {
  it("月末締め・翌月末払い（締日当日にならない）", () => {
    // 6/30 締め・末日払い → 7/31。締日の翌日以降で最初の月末。
    expect(iso(resolveDueDate(d("2026-06-30"), { paymentDay: 31 }))).toBe(
      "2026-07-31",
    );
  });

  it("20 日締め・翌月 10 日払い", () => {
    expect(iso(resolveDueDate(d("2026-06-20"), { paymentDay: 10 }))).toBe(
      "2026-07-10",
    );
  });

  it("20 日締め・当月 25 日払い（同じ月に来る支払日はその月）", () => {
    expect(iso(resolveDueDate(d("2026-06-20"), { paymentDay: 25 }))).toBe(
      "2026-06-25",
    );
  });

  it("支払サイトと併用すると、サイトを満たしたあと最初の支払日", () => {
    // 6/30 + 60 日 = 8/29 → 8/29 以降で最初の月末 = 8/31（翌々月末払い）。
    expect(
      iso(
        resolveDueDate(d("2026-06-30"), {
          paymentTermsDays: 60,
          paymentDay: 31,
        }),
      ),
    ).toBe("2026-08-31");
    // 6/20 + 30 日 = 7/20 → 7/20 以降で最初の 10 日 = 8/10。
    expect(
      iso(
        resolveDueDate(d("2026-06-20"), {
          paymentTermsDays: 30,
          paymentDay: 10,
        }),
      ),
    ).toBe("2026-08-10");
  });

  it("月の日数を超える支払日は月末へ丸める（2 月の 31 日払い）", () => {
    expect(iso(resolveDueDate(d("2026-01-31"), { paymentDay: 31 }))).toBe(
      "2026-02-28",
    );
    expect(iso(resolveDueDate(d("2028-01-31"), { paymentDay: 31 }))).toBe(
      "2028-02-29", // 閏年
    );
  });

  it("年をまたぐ（12 月締め → 1 月払い）", () => {
    expect(iso(resolveDueDate(d("2026-12-31"), { paymentDay: 20 }))).toBe(
      "2027-01-20",
    );
  });

  it("支払サイト 0 でも締日当日にはならない", () => {
    // 6/25 締め・25 日払い。サイト 0 でも「締日の翌日以降」なので翌月 25 日。
    expect(
      iso(
        resolveDueDate(d("2026-06-25"), {
          paymentTermsDays: 0,
          paymentDay: 25,
        }),
      ),
    ).toBe("2026-07-25");
  });
});

describe("paymentTermsShape", () => {
  it("支払日があれば dayOfMonth（サイトは併記用に残す）", () => {
    expect(paymentTermsShape({ paymentDay: 25, paymentTermsDays: 30 })).toEqual(
      {
        kind: "dayOfMonth",
        paymentDay: 25,
        paymentTermsDays: 30,
      },
    );
    expect(paymentTermsShape({ paymentDay: 25 })).toEqual({
      kind: "dayOfMonth",
      paymentDay: 25,
      paymentTermsDays: null,
    });
  });

  it("サイトだけなら days / どちらも無ければ default", () => {
    expect(paymentTermsShape({ paymentTermsDays: 45 })).toEqual({
      kind: "days",
      paymentTermsDays: 45,
    });
    expect(paymentTermsShape({})).toEqual({
      kind: "default",
      paymentTermsDays: 30,
    });
  });
});

describe("resolveBillingPartyId", () => {
  it("請求先があればそちら、無ければ顧客本人", () => {
    expect(resolveBillingPartyId("cust", "billing")).toBe("billing");
    expect(resolveBillingPartyId("cust", null)).toBe("cust");
    expect(resolveBillingPartyId("cust", undefined)).toBe("cust");
  });
});
