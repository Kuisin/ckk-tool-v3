/**
 * order-acceptance-readiness.test.ts — 承認依頼 / 確定の完成条件。
 *
 * サーバー（承認依頼を弾く）と画面（ボタンを押せなくする）が同じ判定を
 * 使うので、ここがずれると「押せるのに失敗する」ボタンが生まれる。
 */

import { describe, expect, it } from "vitest";
import {
  acceptanceReadiness,
  readinessSummary,
} from "./order-acceptance-readiness";

const item = (over: { productId?: string | null; unitPrice?: number | null }) =>
  ({ productId: "12", unitPrice: 1000, ...over }) as const;

/** 配送方法の既定（通常配送・エンドユーザーなし）。 */
const delivery = (
  over: Partial<{
    deliveryMethod: "NORMAL" | "DIRECT_TO_USER";
    endUserBpId: string | null;
  }> = {},
) => ({ deliveryMethod: "NORMAL" as const, endUserBpId: null, ...over });

describe("acceptanceReadiness", () => {
  it("顧客 + 全行に製品と単価が揃えば ok", () => {
    const r = acceptanceReadiness({
      ...delivery(),
      customerBpId: "bp-1",
      items: [item({}), item({})],
    });
    expect(r).toEqual({ ok: true, issues: [] });
  });

  it("顧客未特定を拾う", () => {
    const r = acceptanceReadiness({
      ...delivery(),
      customerBpId: null,
      items: [item({})],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.kind)).toEqual(["customer"]);
  });

  it("明細 0 件はそこで打ち切る（行の指摘は出さない）", () => {
    const r = acceptanceReadiness({
      ...delivery(),
      customerBpId: "bp-1",
      items: [],
    });
    expect(r.issues).toEqual([
      { kind: "items", message: "明細が 1 件もありません" },
    ]);
  });

  it("製品未特定・単価未入力を行番号つきで挙げる", () => {
    const r = acceptanceReadiness({
      ...delivery(),
      customerBpId: "bp-1",
      items: [
        item({}),
        item({ productId: null }),
        item({ unitPrice: null }),
        item({ productId: null, unitPrice: null }),
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([
      { kind: "product", message: "明細 2, 4 行目: 製品が未特定です" },
      { kind: "price", message: "明細 3, 4 行目: 単価が未入力です" },
    ]);
  });

  it("単価 0 は「未入力」ではない（サンプルは 0 円がある）", () => {
    const r = acceptanceReadiness({
      ...delivery(),
      customerBpId: "bp-1",
      items: [item({ unitPrice: 0 })],
    });
    expect(r.ok).toBe(true);
  });

  it("空文字の productId は未特定として扱う", () => {
    const r = acceptanceReadiness({
      ...delivery(),
      customerBpId: "bp-1",
      items: [item({ productId: "" })],
    });
    expect(r.ok).toBe(false);
  });

  it("ユーザー直送でエンドユーザー未指定を拾う", () => {
    const r = acceptanceReadiness({
      ...delivery({ deliveryMethod: "DIRECT_TO_USER" }),
      customerBpId: "bp-1",
      items: [item({})],
    });
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([
      {
        kind: "endUser",
        message: "ユーザー直送ですがエンドユーザーが未指定です",
      },
    ]);
  });

  it("ユーザー直送でもエンドユーザーが居れば ok", () => {
    const r = acceptanceReadiness({
      ...delivery({ deliveryMethod: "DIRECT_TO_USER", endUserBpId: "bp-9" }),
      customerBpId: "bp-1",
      items: [item({})],
    });
    expect(r.ok).toBe(true);
  });
});

describe("readinessSummary", () => {
  it("先頭 3 件までを並べ、残りは件数で示す", () => {
    const issues = acceptanceReadiness({
      ...delivery(),
      customerBpId: null,
      items: [item({ productId: null, unitPrice: null })],
    }).issues;
    expect(readinessSummary(issues)).toBe(
      "顧客が未特定です / 明細 1 行目: 製品が未特定です / 明細 1 行目: 単価が未入力です",
    );
    expect(readinessSummary(issues, 1)).toBe("顧客が未特定です ほか 2 件");
  });
});
