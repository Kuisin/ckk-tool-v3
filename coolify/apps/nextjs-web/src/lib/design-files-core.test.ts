import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ja from "../../messages/ja.json";
import {
  canDeleteVersion,
  canSubmitVersion,
  type DesignFileLike,
  type DesignFileRole,
  type DesignVersionStatus,
  describeVersionLock,
  designFileSource,
  groupBySeries,
  groupVersionsBySeries,
  isVersionEditable,
  nextDesignVersion,
  pickSpecVersion,
  pickThumbFile,
  resolveLatestFile,
  resolveSeriesCustomer,
  sameSeries,
  titleBlockJson,
  toTitleBlock,
} from "./design-files-core";
import type { Tr } from "./i18n";

// biome-ignore lint/suspicious/noExplicitAny: same rationale as product-types.test.ts
const tr = createTranslator({ locale: "ja", messages: ja as any }) as Tr;

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

describe("版の編集・確定・削除の可否（状態で決まる）", () => {
  const cases: [DesignVersionStatus, boolean][] = [
    ["DRAFT", true],
    ["REJECTED", true],
    ["REQUESTED", false],
    ["CONFIRMED", false],
  ];
  it.each(cases)("%s → 編集できる: %s", (status, editable) => {
    expect(isVersionEditable(status)).toBe(editable);
    expect(canSubmitVersion(status)).toBe(editable);
    expect(canDeleteVersion(status)).toBe(editable);
  });

  it("触れない理由を言う（確定 / 承認依頼中）", () => {
    expect(describeVersionLock("CONFIRMED", tr)).toBeTruthy();
    expect(describeVersionLock("REQUESTED", tr)).toBeTruthy();
    expect(describeVersionLock("CONFIRMED", tr)).not.toBe(
      describeVersionLock("REQUESTED", tr),
    );
    expect(describeVersionLock("DRAFT", tr)).toBeNull();
    expect(describeVersionLock("REJECTED", tr)).toBeNull();
  });
});

describe("pickSpecVersion — 製品 1 つにつき使う仕様の版", () => {
  const v = (
    customerBpId: string | null,
    version: number,
    status: DesignVersionStatus = "CONFIRMED",
    confirmedAt: string | null = "2026-09-01T00:00:00Z",
  ) => ({ customerBpId, version, status, confirmedAt });

  it("受注元が一致する系列の最新版を優先する", () => {
    const hit = pickSpecVersion([v(null, 3), v(A, 1), v(A, 2)], A);
    expect(hit).toMatchObject({ customerBpId: A, version: 2 });
  });

  it("一致が無ければ汎用の最新版", () => {
    const hit = pickSpecVersion([v(null, 1), v(null, 2), v(B, 5)], A);
    expect(hit).toMatchObject({ customerBpId: null, version: 2 });
  });

  it("汎用も無ければ最後に確定した版（受注元を問わない）", () => {
    const hit = pickSpecVersion(
      [
        v(A, 1, "CONFIRMED", "2026-09-01T00:00:00Z"),
        v(B, 1, "CONFIRMED", "2026-09-10T00:00:00Z"),
      ],
      null,
    );
    expect(hit).toMatchObject({ customerBpId: B });
  });

  it("**確定していない版は読まない**（下書きの仕様が製品の値にならない）", () => {
    const hit = pickSpecVersion([v(null, 1), v(null, 2, "DRAFT", null)], null);
    expect(hit).toMatchObject({ version: 1 });
    expect(pickSpecVersion([v(null, 1, "REQUESTED", null)])).toBeNull();
  });

  it("何も無ければ null", () => {
    expect(pickSpecVersion([], A)).toBeNull();
  });
});

describe("groupVersionsBySeries", () => {
  it("汎用を先頭に、系列内は版の降順", () => {
    const g = groupVersionsBySeries([
      { customerBpId: A, version: 1 },
      { customerBpId: null, version: 1 },
      { customerBpId: null, version: 2 },
      { customerBpId: B, version: 3 },
    ]);
    expect(g.map((s) => s.customerBpId)).toEqual([null, B, A]);
    expect(g[0].versions.map((x) => x.version)).toEqual([2, 1]);
    expect(g[0].latestVersion).toBe(2);
  });
});

describe("nextDesignVersion — 版の行でも数えられる", () => {
  it("ファイルの無い版（仕様だけ）も番号を使う", () => {
    expect(
      nextDesignVersion(
        [
          { customerBpId: null, version: 1 },
          { customerBpId: A, version: 4 },
        ],
        null,
      ),
    ).toBe(2);
  });
});

describe("表題欄（title_block）", () => {
  it("知らないキー・空の値・文字列でない値は落とす", () => {
    expect(
      toTitleBlock({
        productName: " 超硬ドリル ",
        flutes: "",
        x: "y",
        helix: 30,
      }),
    ).toEqual({ productName: "超硬ドリル" });
    expect(toTitleBlock(null)).toEqual({});
    expect(toTitleBlock(["a"])).toEqual({});
  });

  it("空なら null で持つ", () => {
    expect(titleBlockJson({})).toBeNull();
    expect(titleBlockJson({ material: "  " })).toBeNull();
    expect(titleBlockJson({ material: "超微粒子超硬" })).toEqual({
      material: "超微粒子超硬",
    });
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
