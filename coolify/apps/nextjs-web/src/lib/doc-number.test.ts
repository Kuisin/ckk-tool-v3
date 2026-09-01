import { describe, expect, it } from "vitest";
import { splitDocNumber } from "./doc-number";

describe("splitDocNumber", () => {
  it("よくある書類番号を接頭辞と番号に分ける", () => {
    expect(splitDocNumber("ORD-202609-00042")).toEqual({
      prefix: "ORD-",
      rest: "202609-00042",
    });
    expect(splitDocNumber("QOT-202609-00001")).toEqual({
      prefix: "QOT-",
      rest: "202609-00001",
    });
    expect(splitDocNumber("PO-202609-00007")).toEqual({
      prefix: "PO-",
      rest: "202609-00007",
    });
  });

  it("枝番付き（注文明細）も接頭辞だけを切る", () => {
    expect(splitDocNumber("ORD-202609-00042-01")).toEqual({
      prefix: "ORD-",
      rest: "202609-00042-01",
    });
  });

  // ロット番号のような接頭辞なしの番号もこの部品に来る。
  // 無理に切ると数字の頭が薄くなって読み違える
  it("接頭辞を持たない番号はそのまま", () => {
    expect(splitDocNumber("10842")).toEqual({ prefix: "", rest: "10842" });
    expect(splitDocNumber("")).toEqual({ prefix: "", rest: "" });
  });

  it("小文字・長すぎる語は接頭辞と見なさない", () => {
    expect(splitDocNumber("ord-202609-1").prefix).toBe("");
    expect(splitDocNumber("PREFIX-202609-1").prefix).toBe("");
  });

  it("ハイフンの後ろが空なら切らない", () => {
    expect(splitDocNumber("ORD-")).toEqual({ prefix: "", rest: "ORD-" });
  });
});
