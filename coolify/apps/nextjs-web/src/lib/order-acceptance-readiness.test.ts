/**
 * order-acceptance-readiness.test.ts — 承認依頼 / 確定の完成条件。
 *
 * サーバー（承認依頼を弾く）と画面（ボタンを押せなくする）が同じ判定を
 * 使うので、ここがずれると「押せるのに失敗する」ボタンが生まれる。
 */

import { describe, expect, it } from "vitest";
import {
  acceptanceReadiness,
  normalizeShipToBpId,
  readinessSummary,
  shipToApplies,
} from "./order-acceptance-readiness";

/** テスト用の最小 tr — key と params をそのまま文字列化する。 */
const tr = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as unknown as Parameters<
  typeof acceptanceReadiness
>[1];

const item = (over: {
  productId?: string | null;
  quantity?: number;
  unitPrice?: number | null;
}) => ({ productId: "12", quantity: 10, unitPrice: 1000, ...over }) as const;

/** 配送方法の既定（通常配送・エンドユーザーなし）。 */
const delivery = (
  over: Partial<{
    deliveryMethod: "NORMAL" | "DIRECT_TO_USER";
    endUserBpId: string | null;
  }> = {},
) => ({ deliveryMethod: "NORMAL" as const, endUserBpId: null, ...over });

describe("acceptanceReadiness", () => {
  it("顧客 + 全行に製品と単価が揃えば ok", () => {
    const r = acceptanceReadiness(
      {
        ...delivery(),
        customerBpId: "bp-1",
        items: [item({}), item({})],
      },
      tr,
    );
    expect(r).toEqual({ ok: true, issues: [] });
  });

  it("顧客未特定を拾う", () => {
    const r = acceptanceReadiness(
      {
        ...delivery(),
        customerBpId: null,
        items: [item({})],
      },
      tr,
    );
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.kind)).toEqual(["customer"]);
  });

  it("明細 0 件はそこで打ち切る（行の指摘は出さない）", () => {
    const r = acceptanceReadiness(
      {
        ...delivery(),
        customerBpId: "bp-1",
        items: [],
      },
      tr,
    );
    expect(r.issues).toEqual([
      {
        kind: "items",
        message: "sales.orderAcceptanceReadiness.noLineItems",
      },
    ]);
  });

  it("製品未特定・単価未入力を行番号つきで挙げる", () => {
    const r = acceptanceReadiness(
      {
        ...delivery(),
        customerBpId: "bp-1",
        items: [
          item({}),
          item({ productId: null }),
          item({ unitPrice: null }),
          item({ productId: null, unitPrice: null }),
        ],
      },
      tr,
    );
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([
      {
        kind: "product",
        message:
          'sales.orderAcceptanceReadiness.lineProductNotIdentified:{"rows":"2, 4"}',
      },
      {
        kind: "price",
        message:
          'sales.orderAcceptanceReadiness.lineUnitPriceNotEntered:{"rows":"3, 4"}',
      },
    ]);
  });

  it("単価 0 は「未入力」ではない（サンプルは 0 円がある）", () => {
    const r = acceptanceReadiness(
      {
        ...delivery(),
        customerBpId: "bp-1",
        items: [item({ unitPrice: 0 })],
      },
      tr,
    );
    expect(r.ok).toBe(true);
  });

  it("空文字の productId は未特定として扱う", () => {
    const r = acceptanceReadiness(
      {
        ...delivery(),
        customerBpId: "bp-1",
        items: [item({ productId: "" })],
      },
      tr,
    );
    expect(r.ok).toBe(false);
  });

  it("ユーザー直送でエンドユーザー未指定を拾う", () => {
    const r = acceptanceReadiness(
      {
        ...delivery({ deliveryMethod: "DIRECT_TO_USER" }),
        customerBpId: "bp-1",
        items: [item({})],
      },
      tr,
    );
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([
      {
        kind: "endUser",
        message: "sales.orderAcceptanceReadiness.directToUserButEndUserNot",
      },
    ]);
  });

  it("ユーザー直送でもエンドユーザーが居れば ok", () => {
    const r = acceptanceReadiness(
      {
        ...delivery({ deliveryMethod: "DIRECT_TO_USER", endUserBpId: "bp-9" }),
        customerBpId: "bp-1",
        items: [item({})],
      },
      tr,
    );
    expect(r.ok).toBe(true);
  });
});

describe("readinessSummary", () => {
  it("先頭 3 件までを並べ、残りは件数で示す", () => {
    const issues = acceptanceReadiness(
      {
        ...delivery(),
        customerBpId: null,
        items: [item({ productId: null, unitPrice: null })],
      },
      tr,
    ).issues;
    expect(readinessSummary(issues, tr)).toBe(
      'sales.orderAcceptanceReadiness.customerNotIdentified / sales.orderAcceptanceReadiness.lineProductNotIdentified:{"rows":"1"} / sales.orderAcceptanceReadiness.lineUnitPriceNotEntered:{"rows":"1"}',
    );
    expect(readinessSummary(issues, tr, 1)).toBe(
      'sales.orderAcceptanceReadiness.customerNotIdentified sales.orderAcceptanceReadiness.andNMore:{"count":2}',
    );
  });
});

describe("shipToApplies / normalizeShipToBpId — 出荷先は通常配送だけの欄", () => {
  it("通常配送では出荷先を持てる", () => {
    expect(shipToApplies("NORMAL")).toBe(true);
    expect(normalizeShipToBpId("NORMAL", "bp-1")).toBe("bp-1");
  });

  it("ユーザー直送では出荷先を落とす（届け先はエンドユーザー）", () => {
    expect(shipToApplies("DIRECT_TO_USER")).toBe(false);
    expect(normalizeShipToBpId("DIRECT_TO_USER", "bp-1")).toBeNull();
  });

  it("未指定はどちらの配送方法でも null のまま", () => {
    expect(normalizeShipToBpId("NORMAL", null)).toBeNull();
    expect(normalizeShipToBpId("DIRECT_TO_USER", null)).toBeNull();
  });
});
