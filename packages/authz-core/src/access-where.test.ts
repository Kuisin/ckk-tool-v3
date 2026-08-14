import { describe, expect, it } from "vitest";
import {
  NEVER,
  ownOrPlantWhere,
  ownWhere,
  plantIdSet,
  plantWhere,
  rowInScope,
} from "./access-where";
import type { Access } from "./types";

const ALL: Access = { kind: "ALL" };
const scoped = (ids: number[], own = false): Access => ({
  kind: "SCOPED",
  plantIds: new Set(ids),
  own,
});

describe("plantWhere / ownWhere", () => {
  it("ALL は無制約 {}", () => {
    expect(plantWhere(ALL)).toEqual({});
    expect(ownWhere(ALL, "u1")).toEqual({});
  });

  it("SCOPED は in 句（空集合は in: [] で 0 件 — fail-closed）", () => {
    expect(plantWhere(scoped([1, 2]))).toEqual({ plantId: { in: [1, 2] } });
    expect(plantWhere(scoped([]), "fromPlantId")).toEqual({
      fromPlantId: { in: [] },
    });
  });

  it("ownWhere — own 無しの SCOPED は NEVER", () => {
    expect(ownWhere(scoped([], true), "u1")).toEqual({ createdBy: "u1" });
    expect(ownWhere(scoped([1]), "u1")).toEqual(NEVER);
  });
});

describe("ownOrPlantWhere", () => {
  it("ALL は {}", () => {
    expect(ownOrPlantWhere(ALL, "u1")).toEqual({});
  });

  it("拠点のみ → 単独句、own 併用 → OR", () => {
    expect(ownOrPlantWhere(scoped([1]), "u1")).toEqual({
      plantId: { in: [1] },
    });
    expect(ownOrPlantWhere(scoped([1], true), "u1")).toEqual({
      OR: [{ plantId: { in: [1] } }, { createdBy: "u1" }],
    });
  });

  it("空集合 + own なし → NEVER", () => {
    expect(ownOrPlantWhere(scoped([]), "u1")).toEqual(NEVER);
  });

  it("plantClause でネスト形（指示書 = 工程経由）を組める", () => {
    const where = ownOrPlantWhere(scoped([1, 2], true), "u1", {
      plantClause: (ids) => ({ steps: { some: { plantId: { in: ids } } } }),
    });
    expect(where).toEqual({
      OR: [
        { steps: { some: { plantId: { in: [1, 2] } } } },
        { createdBy: "u1" },
      ],
    });
  });
});

describe("rowInScope", () => {
  it("ALL は常に true", () => {
    expect(rowInScope(ALL, {}, "u1")).toBe(true);
  });

  it("拠点一致 or (own かつ createdBy=自分)", () => {
    expect(rowInScope(scoped([1]), { plantIds: [1] }, "u1")).toBe(true);
    expect(rowInScope(scoped([1]), { plantIds: [2] }, "u1")).toBe(false);
    expect(rowInScope(scoped([], true), { createdBy: "u1" }, "u1")).toBe(true);
    expect(rowInScope(scoped([], true), { createdBy: "u2" }, "u1")).toBe(false);
  });

  it("null 拠点行 / null createdBy 行は SCOPED ユーザーに不可視（fail-closed）", () => {
    expect(rowInScope(scoped([1]), { plantIds: [null] }, "u1")).toBe(false);
    expect(rowInScope(scoped([], true), { createdBy: null }, "u1")).toBe(false);
  });

  it("複数拠点行（指示書）はいずれか一致で可視", () => {
    expect(rowInScope(scoped([2]), { plantIds: [null, 1, 2] }, "u1")).toBe(
      true,
    );
  });
});

describe("plantIdSet", () => {
  it("ALL は null（無制限）、SCOPED は集合", () => {
    expect(plantIdSet(ALL)).toBeNull();
    expect(plantIdSet(scoped([5]))).toEqual(new Set([5]));
  });
});
