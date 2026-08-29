import { describe, expect, it } from "vitest";
import {
  canDeleteDesignFile,
  canEditDesignFile,
  type DesignFileLike,
  type DesignFileRole,
  describeLock,
  designFileSource,
  groupBySeries,
  nextDesignVersion,
  pickThumbFile,
  resolveLatestFile,
  resolveSeriesCustomer,
  sameSeries,
} from "./design-files-core";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";

function f(over: Partial<DesignFileLike> & { id: string }): DesignFileLike {
  return {
    version: 1,
    isLatest: true,
    role: "BLUEPRINT" as DesignFileRole,
    customerBpId: null,
    designRequestId: null,
    ...over,
  };
}

describe("designFileSource", () => {
  it("依頼 id があれば依頼、無ければ手動", () => {
    expect(designFileSource({ designRequestId: null })).toBe("MANUAL");
    expect(designFileSource({ designRequestId: "x" })).toBe("REQUEST");
  });
});

describe("sameSeries", () => {
  it("null 同士は同じ系列（汎用）", () => {
    expect(sameSeries(null, null)).toBe(true);
    expect(sameSeries(undefined, null)).toBe(true);
    expect(sameSeries(A, A)).toBe(true);
    expect(sameSeries(A, null)).toBe(false);
    expect(sameSeries(A, B)).toBe(false);
  });
});

describe("nextDesignVersion", () => {
  it("空の系列は 1 から", () => {
    expect(nextDesignVersion([], null)).toBe(1);
    expect(nextDesignVersion([], A)).toBe(1);
  });

  it("系列ごとに独立して数える", () => {
    const files = [
      f({ id: "1", version: 1, customerBpId: null }),
      f({ id: "2", version: 2, customerBpId: null }),
      f({ id: "3", version: 1, customerBpId: A }),
    ];
    expect(nextDesignVersion(files, null)).toBe(3);
    expect(nextDesignVersion(files, A)).toBe(2);
    // 他の系列に版があっても、新しい顧客は 1 から始まる
    expect(nextDesignVersion(files, B)).toBe(1);
  });

  it("同じ版を共有する複数ファイルでも番号は進まない", () => {
    const files = [
      f({ id: "1", version: 1, role: "PREVIEW" }),
      f({ id: "2", version: 1, role: "BLUEPRINT" }),
      f({ id: "3", version: 1, role: "REFERENCE" }),
    ];
    expect(nextDesignVersion(files, null)).toBe(2);
  });
});

describe("resolveSeriesCustomer", () => {
  const files = [
    f({ id: "g", customerBpId: null }),
    f({ id: "a", customerBpId: A }),
  ];

  it("顧客一致を優先する", () => {
    expect(resolveSeriesCustomer(files, A)).toBe(A);
  });

  it("一致が無ければ汎用へ落ちる", () => {
    expect(resolveSeriesCustomer(files, B)).toBe(null);
  });

  it("**他の顧客の系列へは決して落ちない**", () => {
    // 汎用が無く、別顧客の系列しかない → 「該当なし」でなければならない。
    // ここで A の図面を返すと、B の指示書に他社の図面が黙って出る。
    const onlyA = [f({ id: "a", customerBpId: A })];
    expect(resolveSeriesCustomer(onlyA, B)).toBeUndefined();
  });

  it("顧客指定なしなら汎用", () => {
    expect(resolveSeriesCustomer(files, null)).toBe(null);
  });

  it("何も無ければ該当なし", () => {
    expect(resolveSeriesCustomer([], A)).toBeUndefined();
  });
});

describe("resolveLatestFile", () => {
  const files = [
    f({ id: "g1", version: 1, isLatest: false, customerBpId: null }),
    f({ id: "g2", version: 2, isLatest: true, customerBpId: null }),
    f({
      id: "gp",
      version: 2,
      isLatest: true,
      role: "PREVIEW",
      customerBpId: null,
    }),
    f({ id: "a1", version: 1, isLatest: true, customerBpId: A }),
  ];

  it("顧客の最新図面を返す", () => {
    expect(resolveLatestFile(files, A, "BLUEPRINT")?.id).toBe("a1");
  });

  it("汎用へ落ちたときも最新版だけを返す", () => {
    expect(resolveLatestFile(files, B, "BLUEPRINT")?.id).toBe("g2");
  });

  it("役割ごとに引ける", () => {
    expect(resolveLatestFile(files, B, "PREVIEW")?.id).toBe("gp");
  });

  it("その役割が無ければ null（別の役割で代用しない）", () => {
    expect(resolveLatestFile(files, A, "PREVIEW")).toBeNull();
  });
});

describe("groupBySeries", () => {
  it("汎用を先頭に、版数の多い系列を先に出す", () => {
    const files = [
      f({ id: "a1", version: 1, customerBpId: A }),
      f({ id: "b1", version: 1, customerBpId: B }),
      f({ id: "b2", version: 2, customerBpId: B }),
      f({ id: "g1", version: 1, customerBpId: null }),
    ];
    const groups = groupBySeries(files);
    expect(groups.map((g) => g.customerBpId)).toEqual([null, B, A]);
    expect(groups[1].latestVersion).toBe(2);
  });

  it("系列内は版の降順、同じ版は プレビュー → 図面データ → 参考資料", () => {
    const files = [
      f({ id: "v1", version: 1 }),
      f({ id: "v2ref", version: 2, role: "REFERENCE" }),
      f({ id: "v2bp", version: 2, role: "BLUEPRINT" }),
      f({ id: "v2pv", version: 2, role: "PREVIEW" }),
    ];
    expect(groupBySeries(files)[0].files.map((x) => x.id)).toEqual([
      "v2pv",
      "v2bp",
      "v2ref",
      "v1",
    ]);
  });

  it("空なら空", () => {
    expect(groupBySeries([])).toEqual([]);
  });
});

describe("編集・削除の可否", () => {
  it("指示書で使われている版は編集も削除もできない", () => {
    const used = { usedByWorkOrder: true, designRequestId: null };
    expect(canEditDesignFile(used)).toBe(false);
    expect(canDeleteDesignFile(used)).toBe(false);
    expect(describeLock(used)).toBe("指示書で使用中のため変更できません");
  });

  it("使われていない手動の版は編集も削除もできる", () => {
    const free = { usedByWorkOrder: false, designRequestId: null };
    expect(canEditDesignFile(free)).toBe(true);
    expect(canDeleteDesignFile(free)).toBe(true);
    expect(describeLock(free)).toBeNull();
  });

  it("依頼の成果物は編集できるが削除はできない", () => {
    const fromReq = { usedByWorkOrder: false, designRequestId: "r" };
    expect(canEditDesignFile(fromReq)).toBe(true);
    expect(canDeleteDesignFile(fromReq)).toBe(false);
    expect(describeLock(fromReq)).toContain("削除できません");
  });

  it("使用中は依頼由来かどうかに関わらず止まる（理由は使用中が優先）", () => {
    expect(describeLock({ usedByWorkOrder: true, designRequestId: "r" })).toBe(
      "指示書で使用中のため変更できません",
    );
  });
});

describe("pickThumbFile", () => {
  it("最新版のプレビューを優先する", () => {
    const files = [
      f({ id: "bp", isLatest: true, role: "BLUEPRINT" }),
      f({ id: "pv", isLatest: true, role: "PREVIEW" }),
    ];
    expect(pickThumbFile(files)?.id).toBe("pv");
  });

  it("プレビューが無ければ図面データ", () => {
    expect(
      pickThumbFile([f({ id: "bp", isLatest: true, role: "BLUEPRINT" })])?.id,
    ).toBe("bp");
  });

  it("**参考資料は選ばない**（主図面の代わりに出ると形を誤解させる）", () => {
    expect(
      pickThumbFile([f({ id: "ref", isLatest: true, role: "REFERENCE" })]),
    ).toBeNull();
  });

  it("古い版は選ばない", () => {
    expect(
      pickThumbFile([f({ id: "old", isLatest: false, role: "PREVIEW" })]),
    ).toBeNull();
  });

  it("空なら null", () => {
    expect(pickThumbFile([])).toBeNull();
  });
});
