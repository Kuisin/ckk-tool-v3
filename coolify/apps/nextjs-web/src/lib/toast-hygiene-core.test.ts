import { describe, expect, it } from "vitest";
import { supersededErrorIds } from "./toast-hygiene-core";

const red = (id: string) => ({ id, color: "red" });
const green = (id: string) => ({ id, color: "green" });

describe("supersededErrorIds（成功が出たら前のエラーを消す）", () => {
  it("エラー 2 枚のあとに成功が出たら、2 枚とも消す", () => {
    const prev = [red("a"), red("b")];
    expect(supersededErrorIds(prev, [...prev, green("c")])).toEqual(["a", "b"]);
  });

  it("成功が出ていなければ何も消さない（エラーが増えただけ）", () => {
    expect(supersededErrorIds([red("a")], [red("a"), red("b")])).toEqual([]);
  });

  it("成功と同時に出たエラーは消さない（今回の結果の一部）", () => {
    expect(supersededErrorIds([], [red("a"), green("b")])).toEqual([]);
  });

  it("注意（黄）・案内（青）は消さない", () => {
    const prev = [
      { id: "w", color: "yellow" },
      { id: "i", color: "blue" },
      red("e"),
    ];
    expect(supersededErrorIds(prev, [...prev, green("s")])).toEqual(["e"]);
  });

  it("前からあった成功が残っているだけでは何も消さない", () => {
    const prev = [green("s"), red("e")];
    expect(supersededErrorIds(prev, prev)).toEqual([]);
  });

  it("待ち行列のエラーも消す", () => {
    const prev = [red("q")];
    expect(supersededErrorIds(prev, [green("s"), red("q")])).toEqual(["q"]);
  });
});
