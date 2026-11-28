import { describe, expect, it } from "vitest";
import { type OpenPoLine, openPoConflicts } from "./open-po-guard-core";

const line = (over: Partial<OpenPoLine> = {}): OpenPoLine => ({
  purchaseOrderId: "po-1",
  poNumber: "PO-2026-00001",
  supplierBpId: "sup-A",
  itemId: 10,
  remaining: 30,
  unit: "本",
  ...over,
});

describe("openPoConflicts", () => {
  it("同じ素材・同じ仕入先の未入荷分に当たる", () => {
    expect(
      openPoConflicts([line()], [{ itemId: 10, supplierBpId: "sup-A" }]),
    ).toEqual([line()]);
  });

  it("仕入先が違えば当たらない", () => {
    expect(
      openPoConflicts([line()], [{ itemId: 10, supplierBpId: "sup-B" }]),
    ).toEqual([]);
  });

  it("仕入先が未選択なら素材だけで見る", () => {
    expect(
      openPoConflicts([line()], [{ itemId: 10, supplierBpId: null }]),
    ).toHaveLength(1);
  });

  it("違う素材・入荷済み（残り 0）は当たらない", () => {
    expect(
      openPoConflicts(
        [line({ itemId: 11 }), line({ remaining: 0 })],
        [{ itemId: 10, supplierBpId: "sup-A" }],
      ),
    ).toEqual([]);
  });

  it("同じ発注書の同じ素材が複数行なら残りを合算して 1 件、発注番号順", () => {
    const r = openPoConflicts(
      [
        line({ purchaseOrderId: "po-2", poNumber: "PO-2026-00002" }),
        line({ remaining: 10 }),
        line({ remaining: 5 }),
      ],
      [{ itemId: 10, supplierBpId: "sup-A" }],
    );
    expect(r.map((x) => [x.poNumber, x.remaining])).toEqual([
      ["PO-2026-00001", 15],
      ["PO-2026-00002", 30],
    ]);
  });

  it("複数の候補（納品書の行）のどれかに当たれば出す", () => {
    expect(
      openPoConflicts(
        [line({ itemId: 20 })],
        [
          { itemId: 10, supplierBpId: "sup-A" },
          { itemId: 20, supplierBpId: "sup-A" },
        ],
      ),
    ).toHaveLength(1);
  });
});
