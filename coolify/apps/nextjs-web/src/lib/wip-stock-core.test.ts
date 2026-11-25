import { describe, expect, it } from "vitest";
import { matchWip, type WipBucket } from "./wip-state-core";
import {
  groupWipStock,
  isUnclassifiedWip,
  trimNumber,
  usableWipSummary,
  validateWipReclassify,
  type WipGroupable,
  type WipReclassifyInput,
  wipAgeDays,
  wipSizeLabel,
} from "./wip-stock-core";

function row(over: Partial<WipGroupable> & { id: string }): WipGroupable {
  return {
    materialTypeId: 1,
    diameterMm: 6,
    lengthMm: 60,
    wipStateId: 1,
    stepIds: [],
    isLegacy: false,
    quantity: 1,
    reservedQuantity: 0,
    receivedAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

describe("groupWipStock", () => {
  it("材種 / 径 / 長 → 加工状態 にまとめ、数量を足す", () => {
    const groups = groupWipStock([
      row({ id: "a", quantity: 2 }),
      row({ id: "b", wipStateId: 2, stepIds: [10, 20], quantity: 3 }),
      row({ id: "c", diameterMm: 8, quantity: 5, reservedQuantity: 1 }),
      row({ id: "d", quantity: 4, reservedQuantity: 2 }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["1|6|60", "1|8|60"]);
    expect(groups[0].quantity).toBe(9);
    expect(groups[0].reservedQuantity).toBe(2);
    expect(groups[0].states.map((s) => s.wipStateId)).toEqual([1, 2]);
    expect(groups[0].states[0].rows.map((r) => r.id)).toEqual(["a", "d"]);
    expect(groups[1].quantity).toBe(5);
  });

  it("未分類は 1 つにまとめて先頭に出す", () => {
    const groups = groupWipStock([
      row({ id: "a" }),
      row({ id: "x", isLegacy: true, wipStateId: 9, materialTypeId: null }),
      row({ id: "y", isLegacy: true, wipStateId: 9, diameterMm: null }),
    ]);
    expect(groups[0].unclassified).toBe(true);
    expect(groups[0].key).toBe("u");
    expect(groups[0].states[0].rows).toHaveLength(2);
    expect(groups[0].materialTypeId).toBeNull();
    expect(groups[1].unclassified).toBe(false);
  });

  it("加工状態は浅い順、状態の中は古い順（時刻が無い行は後ろ）", () => {
    const groups = groupWipStock([
      row({ id: "deep", wipStateId: 5, stepIds: [1, 2, 3] }),
      row({ id: "new", receivedAt: "2026-08-01T00:00:00.000Z" }),
      row({ id: "none", receivedAt: null }),
      row({ id: "old", receivedAt: "2026-06-01T00:00:00.000Z" }),
    ]);
    expect(groups[0].states.map((s) => s.wipStateId)).toEqual([1, 5]);
    expect(groups[0].states[0].rows.map((r) => r.id)).toEqual([
      "old",
      "new",
      "none",
    ]);
  });
});

describe("isUnclassifiedWip", () => {
  it("未分類の状態か、ブランクの寸法が欠けていれば未分類", () => {
    expect(isUnclassifiedWip(row({ id: "a" }))).toBe(false);
    expect(isUnclassifiedWip(row({ id: "a", isLegacy: true }))).toBe(true);
    expect(isUnclassifiedWip(row({ id: "a", lengthMm: null }))).toBe(true);
  });
});

describe("usableWipSummary", () => {
  const bucket = (over: Partial<WipBucket> & { inventoryId: string }) => ({
    materialTypeId: 1,
    diameterMm: 6,
    lengthMm: 60,
    stepIds: [] as number[],
    available: 1,
    ...over,
  });

  it("ちょうど + 長い + 太い を数え、加工状態が合わないものは数えない", () => {
    const match = matchWip(
      { itemId: 100, materialTypeId: 1, diameterMm: 6, lengthMm: 60 },
      [10, 20],
      [
        bucket({ inventoryId: "exact", available: 2, stepIds: [10] }),
        bucket({ inventoryId: "longer", lengthMm: 80, available: 3 }),
        bucket({ inventoryId: "thick", diameterMm: 8, available: 4 }),
        // 製品の工程に無い加工が済んでいる → other
        bucket({ inventoryId: "other", available: 50, stepIds: [99] }),
        // 細い → 候補にならない
        bucket({ inventoryId: "thin", diameterMm: 4, available: 60 }),
        // 別の材種 → 候補にならない
        bucket({ inventoryId: "mt", materialTypeId: 2, available: 70 }),
        // 引当済みで残りが無い → 候補にならない
        bucket({ inventoryId: "zero", available: 0 }),
      ],
    );
    const s = usableWipSummary(match);
    expect(s.quantity).toBe(9);
    expect([...s.inventoryIds].sort()).toEqual(["exact", "longer", "thick"]);
  });

  it("使えるものが無ければ 0 本", () => {
    const match = matchWip(
      { itemId: 100, materialTypeId: null, diameterMm: 6, lengthMm: 60 },
      [],
      [bucket({ inventoryId: "a" })],
    );
    expect(usableWipSummary(match)).toEqual({ quantity: 0, inventoryIds: [] });
  });
});

describe("wipAgeDays", () => {
  const now = Date.parse("2026-07-11T12:00:00.000Z");
  it("満の日数で数える", () => {
    expect(wipAgeDays("2026-07-01T12:00:00.000Z", now)).toBe(10);
    expect(wipAgeDays("2026-07-01T13:00:00.000Z", now)).toBe(9);
    expect(wipAgeDays(new Date(now), now)).toBe(0);
  });
  it("未来の時刻は 0、読めない値は null", () => {
    expect(wipAgeDays("2026-08-01T00:00:00.000Z", now)).toBe(0);
    expect(wipAgeDays(null, now)).toBeNull();
    expect(wipAgeDays("not a date", now)).toBeNull();
  });
});

describe("wipSizeLabel / trimNumber", () => {
  it("末尾の 0 を落として φ径 × 長 で出す", () => {
    expect(wipSizeLabel(6, 60)).toBe("φ6 × 60");
    expect(wipSizeLabel(8.3, 330.5)).toBe("φ8.3 × 330.5");
    expect(wipSizeLabel(null, 60)).toBeNull();
    expect(trimNumber(6.0)).toBe("6");
    expect(trimNumber(5.98)).toBe("5.98");
  });
});

describe("validateWipReclassify", () => {
  const base: WipReclassifyInput = {
    quantity: 3,
    materialTypeId: 1,
    diameterMm: 6,
    lengthMm: 60,
    stepIds: [],
    finishedDiameterMm: null,
    finishedLengthMm: null,
    aimedItemId: null,
  };

  it("未加工なら仕上がり寸法は仕掛ブランクの寸法が既定", () => {
    const r = validateWipReclassify(base, 3);
    expect(r.issues).toEqual([]);
    expect(r.value).toMatchObject({
      quantity: 3,
      finishedDiameterMm: 6,
      finishedLengthMm: 60,
      stepIds: [],
    });
  });

  it("未加工でも入力した仕上がり寸法を優先する", () => {
    const r = validateWipReclassify(
      { ...base, finishedDiameterMm: 5.9, finishedLengthMm: 59 },
      3,
    );
    expect(r.value).toMatchObject({
      finishedDiameterMm: 5.9,
      finishedLengthMm: 59,
    });
  });

  it("形を変える工程が済んでいれば仕上がり寸法が必須", () => {
    const r = validateWipReclassify({ ...base, stepIds: [10] }, 3);
    expect(r.issues).toEqual([
      "finishedDiameterRequired",
      "finishedLengthRequired",
    ]);
    expect(r.value).toBeNull();
    const ok = validateWipReclassify(
      {
        ...base,
        stepIds: [10, 20],
        finishedDiameterMm: 5.5,
        finishedLengthMm: 58,
        aimedItemId: 7,
      },
      3,
    );
    expect(ok.issues).toEqual([]);
    expect(ok.value).toMatchObject({ stepIds: [10, 20], aimedItemId: 7 });
  });

  it("数量は 1 以上の整数で、使える数まで", () => {
    expect(validateWipReclassify({ ...base, quantity: 0 }, 3).issues).toEqual([
      "quantityRequired",
    ]);
    expect(validateWipReclassify({ ...base, quantity: 1.5 }, 3).issues).toEqual(
      ["quantityRequired"],
    );
    expect(
      validateWipReclassify({ ...base, quantity: null }, 3).issues,
    ).toEqual(["quantityRequired"]);
    expect(validateWipReclassify({ ...base, quantity: 4 }, 3).issues).toEqual([
      "quantityExceedsAvailable",
    ]);
  });

  it("材種・径・長が欠けていれば通さない", () => {
    const r = validateWipReclassify(
      { ...base, materialTypeId: null, diameterMm: 0, lengthMm: null },
      3,
    );
    expect(r.issues).toEqual([
      "materialTypeRequired",
      "diameterInvalid",
      "lengthInvalid",
    ]);
  });

  it("仕上がり寸法の桁あふれを止める", () => {
    const r = validateWipReclassify(
      { ...base, finishedDiameterMm: 10000, finishedLengthMm: -1 },
      3,
    );
    expect(r.issues).toEqual([
      "finishedDiameterInvalid",
      "finishedLengthInvalid",
    ]);
  });
});
