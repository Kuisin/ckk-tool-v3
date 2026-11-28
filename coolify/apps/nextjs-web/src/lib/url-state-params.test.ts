import { describe, expect, it } from "vitest";
import { pageParam, sizeParam, sortParam } from "./url-state-params";

describe("?page=", () => {
  it("正の数はそのまま", () => {
    expect(pageParam.parse("3")).toBe(3);
  });
  it("数でない・0 以下は 1 ページ目", () => {
    for (const raw of ["", "abc", "0", "-2"]) {
      expect(pageParam.parse(raw)).toBe(1);
    }
  });
  it("書き戻すと同じ文字列になる", () => {
    expect(pageParam.serialize(pageParam.parse("12"))).toBe("12");
  });
});

describe("?size=", () => {
  it("正の数だけ受ける", () => {
    expect(sizeParam.parse("50")).toBe(50);
  });
  it("それ以外は指定なし", () => {
    for (const raw of ["", "abc", "0", "-10", "Infinity"]) {
      expect(sizeParam.parse(raw)).toBeNull();
    }
  });
});

describe("?sort=", () => {
  it("列.向き を読む", () => {
    expect(sortParam.parse("updatedAt.desc")).toEqual({
      key: "updatedAt",
      dir: "desc",
    });
  });
  it("列名のドットは残し、最後のドットで割る", () => {
    expect(sortParam.parse("customer.name.asc")).toEqual({
      key: "customer.name",
      dir: "asc",
    });
  });
  it("向きが desc でなければ昇順", () => {
    expect(sortParam.parse("name.up")?.dir).toBe("asc");
  });
  it("ドットが無い古い形は列名として読む（昇順）", () => {
    expect(sortParam.parse("name")).toEqual({ key: "name", dir: "asc" });
  });
  it("書き戻すと同じ文字列になる（共有リンクの書式を変えない）", () => {
    for (const raw of ["updatedAt.desc", "customer.name.asc"]) {
      const parsed = sortParam.parse(raw);
      expect(parsed && sortParam.serialize(parsed)).toBe(raw);
    }
  });
});
