import { describe, expect, it } from "vitest";
import {
  currentPrograms,
  pickWorkOrderDesignVersion,
  programsForStep,
  programsShownForStep,
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
      machineModelIds: [10],
      processStepIds: [1, 2],
    },
    {
      id: "p2",
      name: "仕上げ",
      sortOrder: 1,
      machineModelIds: [20, 30],
      processStepIds: [2],
    },
    {
      id: "p3",
      name: "共通",
      sortOrder: 2,
      machineModelIds: [],
      processStepIds: [2],
    },
    {
      id: "p4",
      name: "別工程",
      sortOrder: 3,
      machineModelIds: [20],
      processStepIds: [3],
    },
  ];

  it("受け持ち工程に入っているものだけ", () => {
    expect(programsForStep(programs, 1, []).map((p) => p.id)).toEqual(["p1"]);
  });
  it("機械の機種が一致するものが先頭、残りは版の並び", () => {
    const got = programsForStep(programs, 2, [30, null]);
    expect(got.map((p) => p.id)).toEqual(["p2", "p1", "p3"]);
    expect(got.map((p) => p.modelMatch)).toEqual([true, false, false]);
  });
  it("複数機種のどれか 1 つが重なれば一致", () => {
    const got = programsForStep(programs, 2, [10, 20]);
    expect(got.filter((p) => p.modelMatch).map((p) => p.id)).toEqual([
      "p1",
      "p2",
    ]);
  });
  it("機種を問わないものは一致扱いにしない", () => {
    expect(programsForStep(programs, 2, []).every((p) => !p.modelMatch)).toBe(
      true,
    );
  });
});

const rev = (
  id: string,
  programKey: string,
  revision: number,
  opts: { superseded?: boolean; retired?: boolean; steps?: number[] } = {},
) => ({
  id,
  name: id,
  sortOrder: 0,
  machineModelIds: [] as number[],
  processStepIds: opts.steps ?? [1],
  programKey,
  revision,
  supersededAt: opts.superseded ? "2026-11-01T00:00:00Z" : null,
  retiredAt: opts.retired ? "2026-11-02T00:00:00Z" : null,
});

describe("currentPrograms", () => {
  it("プログラムごとの現行版だけ（古い版は出さない）", () => {
    const got = currentPrograms([
      rev("a1", "a", 1, { superseded: true }),
      rev("a2", "a", 2),
      rev("b1", "b", 1),
    ]);
    expect(got.map((p) => p.id).sort()).toEqual(["a2", "b1"]);
  });
  it("廃止したプログラムは出さない", () => {
    expect(currentPrograms([rev("a1", "a", 1, { retired: true })])).toEqual([]);
  });
  it("現行版の印が 2 行に立っていても版番号の大きいほう 1 本", () => {
    const got = currentPrograms([rev("a1", "a", 1), rev("a2", "a", 2)]);
    expect(got.map((p) => p.id)).toEqual(["a2"]);
  });
});

describe("programsShownForStep", () => {
  const candidates = [
    rev("a1", "a", 1, { superseded: true }),
    rev("a2", "a", 2),
  ];
  it("未開始は現行版から選ぶ", () => {
    const got = programsShownForStep(
      { started: false, recorded: [], candidates },
      1,
      [],
    );
    expect(got.fromRecord).toBe(false);
    expect(got.programs.map((p) => p.id)).toEqual(["a2"]);
  });
  it("開始済みは開始時に記録した版（古い版でも）", () => {
    const got = programsShownForStep(
      { started: true, recorded: [candidates[0]], candidates },
      1,
      [],
    );
    expect(got.fromRecord).toBe(true);
    expect(got.programs.map((p) => p.id)).toEqual(["a1"]);
  });
  it("開始済みでも記録が無ければ現行版から選ぶ（この仕組みより前の工程）", () => {
    const got = programsShownForStep(
      { started: true, recorded: [], candidates },
      1,
      [],
    );
    expect(got.fromRecord).toBe(false);
    expect(got.programs.map((p) => p.id)).toEqual(["a2"]);
  });
});
