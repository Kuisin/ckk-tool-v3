import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type { Tr } from "@/lib/i18n";
import ja from "../../../../messages/ja.json";
import {
  allocateLotUsage,
  combinabilityError,
  planAutoDeliveryNotes,
} from "./model";

// biome-ignore lint/suspicious/noExplicitAny: next-intl's messages type is too wide for a plain JSON import here
const tr = createTranslator({ locale: "ja", messages: ja as any }) as Tr;

describe("combinabilityError — 1 出荷書に束ねられる条件", () => {
  const ref = (
    over: Partial<{
      customerBpId: string | null;
      shipToBpId: string | null;
      deliveryMethod: string;
      endUserBpId: string | null;
    }> = {},
  ) => ({
    customerBpId: "cust-1",
    shipToBpId: null,
    deliveryMethod: "NORMAL",
    ...over,
  });

  it("同一顧客 × 同一出荷先 × 同一配送方法なら null", () => {
    expect(
      combinabilityError(
        [ref(), ref(), ref({ shipToBpId: null })],
        tr,
        "cust-1",
      ),
    ).toBeNull();
    expect(
      combinabilityError(
        [ref({ shipToBpId: "bp-2" }), ref({ shipToBpId: "bp-2" })],
        tr,
      ),
    ).toBeNull();
  });

  it("空配列は null（注文明細なしの出荷書）", () => {
    expect(combinabilityError([], tr)).toBeNull();
  });

  it("ヘッダの顧客と食い違うと顧客エラー", () => {
    expect(combinabilityError([ref()], tr, "cust-9")).toMatch(/同じ顧客/);
  });

  it("明細間で顧客が違うと顧客エラー", () => {
    expect(
      combinabilityError([ref(), ref({ customerBpId: "cust-2" })], tr),
    ).toMatch(/同じ顧客/);
  });

  it("出荷先が違うと出荷先エラー（null と指定ありも別扱い）", () => {
    expect(
      combinabilityError([ref(), ref({ shipToBpId: "bp-2" })], tr, "cust-1"),
    ).toMatch(/同じ出荷先/);
    expect(
      combinabilityError(
        [ref({ shipToBpId: "bp-2" }), ref({ shipToBpId: "bp-3" })],
        tr,
      ),
    ).toMatch(/同じ出荷先/);
  });

  it("配送方法が違うと配送方法エラー", () => {
    expect(
      combinabilityError(
        [ref(), ref({ deliveryMethod: "DIRECT_TO_USER" })],
        tr,
        "cust-1",
      ),
    ).toMatch(/同じ配送方法/);
  });

  it("ユーザー直送でエンドユーザーが違うとエンドユーザーエラー", () => {
    expect(
      combinabilityError(
        [
          ref({ deliveryMethod: "DIRECT_TO_USER", endUserBpId: "eu-1" }),
          ref({ deliveryMethod: "DIRECT_TO_USER", endUserBpId: "eu-2" }),
        ],
        tr,
      ),
    ).toMatch(/同じ届け先|エンドユーザー|最終需要家/);
  });

  it("通常配送ではエンドユーザーの食い違いを見ない", () => {
    expect(
      combinabilityError(
        [ref({ endUserBpId: "eu-1" }), ref({ endUserBpId: "eu-2" })],
        tr,
        "cust-1",
      ),
    ).toBeNull();
  });
});

describe("planAutoDeliveryNotes — 出荷書確定時の納品書自動作成の内訳", () => {
  it("通常配送は顧客宛・価格記載ありの 1 通", () => {
    expect(
      planAutoDeliveryNotes({
        customerBpId: "cust-1",
        customerBranchBpId: "branch-1",
        deliveryMethod: "NORMAL",
        endUserBpId: null,
      }),
    ).toEqual([
      {
        recipientBpId: "cust-1",
        recipientBranchBpId: "branch-1",
        endUserBpId: null,
        includePrice: true,
      },
    ]);
  });

  it("ユーザー直送は最終需要家宛(価格なし)+顧客宛(価格あり)の 2 通", () => {
    expect(
      planAutoDeliveryNotes({
        customerBpId: "cust-1",
        customerBranchBpId: null,
        deliveryMethod: "DIRECT_TO_USER",
        endUserBpId: "eu-1",
      }),
    ).toEqual([
      {
        recipientBpId: "eu-1",
        recipientBranchBpId: null,
        endUserBpId: null,
        includePrice: false,
      },
      {
        recipientBpId: "cust-1",
        recipientBranchBpId: null,
        endUserBpId: "eu-1",
        includePrice: true,
      },
    ]);
  });

  it("ユーザー直送でエンドユーザー未解決なら顧客宛(価格あり)のみ", () => {
    expect(
      planAutoDeliveryNotes({
        customerBpId: "cust-1",
        customerBranchBpId: null,
        deliveryMethod: "DIRECT_TO_USER",
        endUserBpId: null,
      }),
    ).toEqual([
      {
        recipientBpId: "cust-1",
        recipientBranchBpId: null,
        endUserBpId: null,
        includePrice: true,
      },
    ]);
  });
});

describe("allocateLotUsage — 未出荷数量のロット割付", () => {
  it("残数ちょうどまで指示書番号順に充当する", () => {
    expect(
      allocateLotUsage(100, [
        { lotNumber: 2, outputQuantity: 60, stockQuantity: 60 },
        { lotNumber: 1, outputQuantity: 60, stockQuantity: 60 },
      ]),
    ).toEqual([
      { lotNumber: 1, quantity: 60 },
      { lotNumber: 2, quantity: 40 }, // 出来高 60 でも必要な 40 だけ
    ]);
  });

  it("統合ロットでは自明細の取り分（outputQuantity）を超えない", () => {
    // 指示書全体の在庫は 100 あるが、この明細の取り分は 30。
    expect(
      allocateLotUsage(80, [
        { lotNumber: 5, outputQuantity: 30, stockQuantity: 100 },
      ]),
    ).toEqual([{ lotNumber: 5, quantity: 30 }]);
  });

  it("現物在庫が取り分より少なければ在庫までしか充当しない", () => {
    expect(
      allocateLotUsage(50, [
        { lotNumber: 3, outputQuantity: 50, stockQuantity: 20 },
        { lotNumber: 4, outputQuantity: 50, stockQuantity: 40 },
      ]),
    ).toEqual([
      { lotNumber: 3, quantity: 20 },
      { lotNumber: 4, quantity: 30 },
    ]);
  });

  it("在庫ゼロのロットは行を作らない", () => {
    expect(
      allocateLotUsage(10, [
        { lotNumber: 1, outputQuantity: 10, stockQuantity: 0 },
        { lotNumber: 2, outputQuantity: 10, stockQuantity: 10 },
      ]),
    ).toEqual([{ lotNumber: 2, quantity: 10 }]);
  });

  it("残数ゼロ以下・ロットなしは空", () => {
    expect(
      allocateLotUsage(0, [
        { lotNumber: 1, outputQuantity: 10, stockQuantity: 10 },
      ]),
    ).toEqual([]);
    expect(allocateLotUsage(-5, [])).toEqual([]);
    expect(allocateLotUsage(10, [])).toEqual([]);
  });
});
