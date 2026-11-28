import { describe, expect, it } from "vitest";
import {
  type DesignExtract,
  enforceExtract,
  extractCounts,
  extractFromSxf,
  isExtractKey,
  isLocked,
  replaceExtract,
  setOverride,
  toDesignExtract,
} from "./design-extract-core";
import type { SxfDrawingReading } from "./sxf-core";

const src = {
  fileName: "No.1639.sfc",
  sheetNumber: "No.1639",
  software: "図脳RAPID14",
  readAt: "2026-09-26T00:00:00.000Z",
};
const ex = (over: Partial<DesignExtract> = {}): DesignExtract => ({
  source: src,
  values: {
    diameterMm: "10",
    lengthMm: "120",
    "titleBlock.productName": "超硬段付ドリル",
    "spec.drawingNo": "072851-01",
  },
  overridden: [],
  ...over,
});

describe("キーの形", () => {
  it("欄の場所として正しいものだけ通す", () => {
    expect(isExtractKey("diameterMm")).toBe(true);
    expect(isExtractKey("titleBlock.material")).toBe(true);
    expect(isExtractKey("titleBlock.unknown")).toBe(false);
    expect(isExtractKey("spec.drawingNo")).toBe(true);
    expect(isExtractKey("materialTypeId")).toBe(false);
    expect(isExtractKey("spec.a b")).toBe(false);
  });
});

describe("toDesignExtract", () => {
  it("壊れた値・空の値は null", () => {
    expect(toDesignExtract(null)).toBeNull();
    expect(toDesignExtract({ values: {} })).toBeNull();
    expect(toDesignExtract([1])).toBeNull();
  });

  it("知らないキーと、読み取っていないキーの上書き印は落とす", () => {
    const e = toDesignExtract({
      source: src,
      values: { diameterMm: "10", bogus: "x" },
      overridden: ["diameterMm", "lengthMm", "diameterMm"],
    });
    expect(e?.values).toEqual({ diameterMm: "10" });
    expect(e?.overridden).toEqual(["diameterMm"]);
  });
});

describe("読み取り専用と手入力", () => {
  it("読み取った欄は既定で読み取り専用", () => {
    expect(isLocked(ex(), "diameterMm")).toBe(true);
    expect(isLocked(ex(), "titleBlock.material")).toBe(false); // 読み取っていない
    expect(isLocked(null, "diameterMm")).toBe(false);
  });

  it("手入力に切り替えると外れ、戻すと元に戻る", () => {
    const on = setOverride(ex(), "diameterMm", true);
    expect(isLocked(on, "diameterMm")).toBe(false);
    expect(on.values.diameterMm).toBe("10"); // 参照は残る
    expect(isLocked(setOverride(on, "diameterMm", false), "diameterMm")).toBe(
      true,
    );
  });

  it("読み取っていない欄は切り替えられない", () => {
    expect(setOverride(ex(), "titleBlock.material", true).overridden).toEqual(
      [],
    );
  });
});

describe("enforceExtract — 読み取り専用の欄は図面の値に揃う", () => {
  const target = {
    diameterMm: 12,
    lengthMm: 95,
    spec: { other: "x" },
    titleBlock: { productName: "手で変えた" },
  };

  it("手入力にしていない欄を図面の値へ戻す", () => {
    const out = enforceExtract(target, ex());
    expect(out.diameterMm).toBe(10);
    expect(out.lengthMm).toBe(120);
    expect(out.titleBlock.productName).toBe("超硬段付ドリル");
    expect(out.spec).toEqual({ other: "x", drawingNo: "072851-01" });
  });

  it("**手入力にした欄は触らない**", () => {
    const out = enforceExtract(
      target,
      ex({ overridden: ["diameterMm", "titleBlock.productName"] }),
    );
    expect(out.diameterMm).toBe(12);
    expect(out.titleBlock.productName).toBe("手で変えた");
    expect(out.lengthMm).toBe(120);
  });

  it("読み取りが無ければそのまま", () => {
    expect(enforceExtract(target, null)).toBe(target);
  });
});

describe("replaceExtract — 図面を読み直したとき", () => {
  it("手入力の印は、新しい図面にもある欄だけ残す", () => {
    const prev = ex({ overridden: ["diameterMm", "spec.drawingNo"] });
    const next = replaceExtract(prev, {
      source: src,
      values: { diameterMm: "8", lengthMm: "60" },
    });
    expect(next.overridden).toEqual(["diameterMm"]);
  });
});

describe("extractFromSxf", () => {
  it("寸法・図面情報・型に合う製品項目を欄の場所で持つ", () => {
    const reading: SxfDrawingReading = {
      sheetNumber: "No.1639",
      title: {
        productName: "超硬段付ドリル",
        drawingNumber: "072851-01",
        customerName: "テスト工業",
        flutes: "2",
      },
      diameterMm: 10,
      lengthMm: 120,
      dimensionTexts: [],
      labels: [],
      software: "図脳RAPID14 Ver14",
    };
    const e = extractFromSxf(
      reading,
      [{ key: "drawingNo", label: { ja: "図番" }, type: "string" }],
      "No.1639.sfc",
      new Date(0),
    );
    expect(e.values).toEqual({
      diameterMm: "10",
      lengthMm: "120",
      "titleBlock.productName": "超硬段付ドリル",
      "titleBlock.drawingNumber": "072851-01",
      "titleBlock.flutes": "2",
      "spec.drawingNo": "072851-01",
    });
    expect(e.source.fileName).toBe("No.1639.sfc");
  });
});

describe("extractCounts", () => {
  it("読み取った数と手入力の数", () => {
    expect(extractCounts(ex({ overridden: ["lengthMm"] }))).toEqual({
      read: 4,
      overridden: 1,
    });
    expect(extractCounts(null)).toEqual({ read: 0, overridden: 0 });
  });
});
