import { describe, expect, it } from "vitest";
import {
  isTableSettingKey,
  normalizeTablePath,
  sanitizeHiddenColumns,
  tableSettingKey,
} from "./table-settings-core";

describe("normalizeTablePath", () => {
  it("レコードを指す区切り（数字を含む）は * に潰す", () => {
    expect(normalizeTablePath("/sales/quotes/QOT-202608-00001")).toBe(
      "sales/quotes/*",
    );
    expect(normalizeTablePath("/production/work-orders/1234/steps/ab12")).toBe(
      "production/work-orders/*/steps/*",
    );
  });

  it("同じ画面なら別レコードでも同じキーになる", () => {
    expect(normalizeTablePath("/sales/quotes/QOT-202608-00001")).toBe(
      normalizeTablePath("/sales/quotes/QOT-202609-00042"),
    );
  });

  it("静的なパスはそのまま", () => {
    expect(normalizeTablePath("/master/business-partners")).toBe(
      "master/business-partners",
    );
    expect(normalizeTablePath("/")).toBe("home");
  });
});

describe("tableSettingKey", () => {
  it("1 画面 1 表なら画面のパスだけで決まる", () => {
    expect(tableSettingKey("/sales/quotes")).toBe("table.sales/quotes");
  });

  it("同じ画面の 2 つ目の表は settingsKey で分ける", () => {
    const a = tableSettingKey("/production/pending-work-orders", "unplanned");
    const b = tableSettingKey("/production/pending-work-orders", "in-progress");
    expect(a).not.toBe(b);
    expect(isTableSettingKey(a)).toBe(true);
  });
});

describe("isTableSettingKey", () => {
  it("接頭辞と使える文字だけを通す", () => {
    expect(isTableSettingKey("table.sales/quotes#a")).toBe(true);
    expect(isTableSettingKey("general.tasks.tabs")).toBe(false);
    expect(isTableSettingKey("table.<script>")).toBe(false);
    expect(isTableSettingKey(`table.${"x".repeat(200)}`)).toBe(false);
  });
});

describe("sanitizeHiddenColumns", () => {
  it("{ hidden: [...] } でも配列でも読む", () => {
    expect(sanitizeHiddenColumns({ hidden: ["notes"] })).toEqual(["notes"]);
    expect(sanitizeHiddenColumns(["notes"])).toEqual(["notes"]);
  });

  it("重複・空・文字列でない値・長すぎる値は捨てる", () => {
    expect(
      sanitizeHiddenColumns({
        hidden: ["notes", "notes", "", 3, null, "x".repeat(65)],
      }),
    ).toEqual(["notes"]);
  });

  it("知らない列 id は捨てない（表示時に突き合わせる）", () => {
    expect(sanitizeHiddenColumns({ hidden: ["gone"] })).toEqual(["gone"]);
  });

  it("壊れた値は空", () => {
    expect(sanitizeHiddenColumns(null)).toEqual([]);
    expect(sanitizeHiddenColumns("notes")).toEqual([]);
  });
});
