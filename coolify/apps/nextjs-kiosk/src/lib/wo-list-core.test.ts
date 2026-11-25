import { describe, expect, it } from "vitest";
import { filterWoList, normalizeQuery, type WoListItem } from "./wo-list-core";

const item = (over: Partial<WoListItem>): WoListItem => ({
  workOrderNumber: 1201,
  docNumber: "WOR-202611-00012",
  status: "APPROVED",
  plannedQuantity: 10,
  productCode: "PRD-202610-0003",
  productName: "超硬ドリル φ8.3",
  doneSteps: 0,
  totalSteps: 4,
  ...over,
});

const items = [
  item({}),
  item({
    workOrderNumber: 1305,
    docNumber: "WOR-202611-00020",
    productCode: "PRD-202611-0009",
    productName: "エンドミル 4枚刃",
  }),
];

describe("normalizeQuery", () => {
  it("全角英数字を半角・小文字にする", () => {
    expect(normalizeQuery("ＷＯＲ－１２")).toBe("wor-12");
  });
});

describe("filterWoList", () => {
  it("空なら全件", () => {
    expect(filterWoList(items, "  ")).toHaveLength(2);
  });
  it("指示書番号で引ける（# 付きでも）", () => {
    expect(filterWoList(items, "1305").map((i) => i.workOrderNumber)).toEqual([
      1305,
    ]);
    expect(filterWoList(items, "#1201").map((i) => i.workOrderNumber)).toEqual([
      1201,
    ]);
  });
  it("書類番号・製品コード・製品名で引ける", () => {
    expect(filterWoList(items, "wor-202611-00020")).toHaveLength(1);
    expect(filterWoList(items, "prd-202610")).toHaveLength(1);
    expect(filterWoList(items, "エンドミル")).toHaveLength(1);
  });
  it("空白区切りは AND", () => {
    expect(filterWoList(items, "ドリル 1305")).toHaveLength(0);
    expect(filterWoList(items, "ドリル 1201")).toHaveLength(1);
  });
  it("全角で打っても引ける", () => {
    expect(filterWoList(items, "１３０５")).toHaveLength(1);
  });
});
