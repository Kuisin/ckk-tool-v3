import { describe, expect, it } from "vitest";
import {
  pickWorkOrderDesignVersion,
  programsForStep,
  workOrderDesignCustomer,
} from "./design-programs-core";

describe("workOrderDesignCustomer", () => {
  it("1 人に定まるときだけその顧客", () => {
    expect(workOrderDesignCustomer(["A", "A", null])).toBe("A");
  });
  it("混在・無しは null（汎用を見る）", () => {
    expect(workOrderDesignCustomer(["A", "B"])).toBeNull();
    expect(workOrderDesignCustomer([])).toBeNull();
  });
});

describe("pickWorkOrderDesignVersion", () => {
  const versions = [
    { id: "g1", customerBpId: null, version: 1, status: "CONFIRMED" },
    { id: "g2", customerBpId: null, version: 2, status: "CONFIRMED" },
    { id: "g3", customerBpId: null, version: 3, status: "DRAFT" },
    { id: "a1", customerBpId: "A", version: 1, status: "CONFIRMED" },
    { id: "b1", customerBpId: "B", version: 1, status: "CONFIRMED" },
  ];

  it("ピン留めが勝つ", () => {
    expect(
      pickWorkOrderDesignVersion(versions, {
        pinnedVersionId: "g1",
        customerBpId: "A",
      })?.id,
    ).toBe("g1");
  });
  it("顧客一致の系列の確定済み最新", () => {
    expect(
      pickWorkOrderDesignVersion(versions, { customerBpId: "A" })?.id,
    ).toBe("a1");
  });
  it("顧客の系列が無ければ汎用の確定済み最新（下書きは拾わない）", () => {
    expect(
      pickWorkOrderDesignVersion(versions, { customerBpId: "C" })?.id,
    ).toBe("g2");
  });
  it("他の顧客の系列へは落ちない", () => {
    const onlyB = versions.filter((v) => v.customerBpId === "B");
    expect(pickWorkOrderDesignVersion(onlyB, { customerBpId: "A" })).toBeNull();
    expect(pickWorkOrderDesignVersion(onlyB, {})).toBeNull();
  });
});

describe("programsForStep", () => {
  const programs = [
    {
      id: "p1",
      name: "荒",
      sortOrder: 0,
      workLocationId: 10,
      processStepIds: [1, 2],
    },
    {
      id: "p2",
      name: "仕上げ",
      sortOrder: 1,
      workLocationId: 20,
      processStepIds: [2],
    },
    {
      id: "p3",
      name: "共通",
      sortOrder: 2,
      workLocationId: null,
      processStepIds: [2],
    },
    {
      id: "p4",
      name: "別工程",
      sortOrder: 3,
      workLocationId: 20,
      processStepIds: [3],
    },
  ];

  it("受け持ち工程に入っているものだけ", () => {
    expect(programsForStep(programs, 1, []).map((p) => p.id)).toEqual(["p1"]);
  });
  it("作業場所（機械）が一致するものが先頭、残りは版の並び", () => {
    const got = programsForStep(programs, 2, [20, null]);
    expect(got.map((p) => p.id)).toEqual(["p2", "p1", "p3"]);
    expect(got.map((p) => p.machineMatch)).toEqual([true, false, false]);
  });
  it("機械を問わないものは一致扱いにしない", () => {
    expect(programsForStep(programs, 2, []).every((p) => !p.machineMatch)).toBe(
      true,
    );
  });
});
