import { describe, expect, it } from "vitest";
import { parseWorkOrderNumber, parseWorkOrderQr } from "./wo-scan-core";

describe("parseWorkOrderQr", () => {
  it("統一フォーマットの指示書 QR から番号を取り出す", () => {
    expect(parseWorkOrderQr("CKK:WO:1234")).toBe(1234);
    expect(parseWorkOrderQr("  ckk:wo:7  ")).toBe(7);
  });

  it("指示書以外の QR は null", () => {
    expect(parseWorkOrderQr("CKK:CARD:ABCD-EFGH-JKLM-NPQR")).toBeNull();
    expect(parseWorkOrderQr("CKK:INV:INV-202608-00001")).toBeNull();
    expect(parseWorkOrderQr("https://example.com/wo/1234")).toBeNull();
  });

  it("プレフィクス無しの素の数字は受け付けない（カード QR との誤読防止）", () => {
    expect(parseWorkOrderQr("1234")).toBeNull();
  });

  it("番号として不正な KEY は null", () => {
    expect(parseWorkOrderQr("CKK:WO:12a4")).toBeNull();
    expect(parseWorkOrderQr("CKK:WO:0")).toBeNull();
    expect(parseWorkOrderQr("CKK:WO:-5")).toBeNull();
  });
});

describe("parseWorkOrderNumber", () => {
  it("正の整数のみ受け付ける", () => {
    expect(parseWorkOrderNumber("42")).toBe(42);
    expect(parseWorkOrderNumber(" 42 ")).toBe(42);
    expect(parseWorkOrderNumber("0")).toBeNull();
    expect(parseWorkOrderNumber("")).toBeNull();
    expect(parseWorkOrderNumber("4.2")).toBeNull();
    expect(parseWorkOrderNumber("1e3")).toBeNull();
  });

  it("int4 上限を超える番号は null", () => {
    expect(parseWorkOrderNumber("2147483647")).toBe(2_147_483_647);
    expect(parseWorkOrderNumber("2147483648")).toBeNull();
  });
});
