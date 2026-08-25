import { describe, expect, it } from "vitest";
import {
  collapseUnchanged,
  diffBodies,
  diffStats,
  lineCountOf,
  remapLineAnchors,
} from "./line-anchor";

const A = "line1\nline2\nline3";

describe("lineCountOf", () => {
  it("空文字は 0 行", () => {
    expect(lineCountOf("")).toBe(0);
  });
  it("末尾の改行の有無で行数が変わらない", () => {
    expect(lineCountOf(A)).toBe(3);
    expect(lineCountOf(`${A}\n`)).toBe(3);
    expect(lineCountOf("a")).toBe(1);
    expect(lineCountOf("a\n")).toBe(1);
  });

  it("CRLF も 1 行として数える", () => {
    expect(lineCountOf("a\r\nb")).toBe(2);
  });
});

describe("diffBodies", () => {
  it("同じ本文は全部 same", () => {
    const lines = diffBodies(A, A);
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.kind === "same")).toBe(true);
    expect(lines[1]).toMatchObject({ oldLine: 2, newLine: 2, text: "line2" });
  });

  it("行を挿入すると以降の新版行番号がずれる", () => {
    const lines = diffBodies(A, "line1\nNEW\nline2\nline3");
    const added = lines.filter((l) => l.kind === "add");
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ newLine: 2, text: "NEW" });
    const last = lines.find((l) => l.text === "line3");
    expect(last).toMatchObject({ oldLine: 3, newLine: 4 });
  });

  it("行を削除すると del が出る", () => {
    const lines = diffBodies(A, "line1\nline3");
    const del = lines.filter((l) => l.kind === "del");
    expect(del).toHaveLength(1);
    expect(del[0]).toMatchObject({ oldLine: 2, newLine: null, text: "line2" });
  });
});

describe("remapLineAnchors", () => {
  it("挿入で下にずれた行を追従する", () => {
    // 先頭に 1 行足すと、旧 2 行目は新 3 行目になる
    expect(remapLineAnchors(A, "NEW\nline1\nline2\nline3", [2])).toEqual([3]);
  });

  it("消えた行は null（コメントは outdated として残す）", () => {
    expect(remapLineAnchors(A, "line1\nline3", [2])).toEqual([null]);
  });

  it("変更のない本文では行番号がそのまま", () => {
    expect(remapLineAnchors(A, A, [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("複数の印をまとめて写せる", () => {
    expect(remapLineAnchors(A, "X\nline1\nline2\nY\nline3", [1, 2, 3])).toEqual(
      [2, 3, 5],
    );
  });

  it("行を書き換えると、その行は追従できない（別の行として扱う）", () => {
    // 内容が変わった行は same にならないので null
    expect(remapLineAnchors(A, "line1\nCHANGED\nline3", [2])).toEqual([null]);
  });

  it("空入力は空を返す", () => {
    expect(remapLineAnchors(A, A, [])).toEqual([]);
  });
});

describe("diffStats", () => {
  it("末尾に 1 行足したら +1 だけ（最終行を変更扱いにしない）", () => {
    // 末尾に改行が無い本文どうしだと jsdiff は最終行を書き直し扱いにする。
    // normalizeBody がそれを防いでいるので、ここは純粋な +1 になる。
    expect(diffStats(A, "line1\nline2\nline3\nline4")).toMatchObject({
      added: 1,
      removed: 0,
    });
    expect(diffStats(A, "line1")).toMatchObject({ added: 0, removed: 2 });
  });

  it("変更行は新版の行番号で返す（blame の更新対象）", () => {
    const stats = diffStats(A, "line1\nCHANGED\nline3");
    expect(stats.changedLines).toEqual([2]);
  });

  it("変更なしは 0", () => {
    expect(diffStats(A, A)).toEqual({ added: 0, removed: 0, changedLines: [] });
  });
});

describe("collapseUnchanged", () => {
  it("変更の周りだけ残して畳む", () => {
    const long = Array.from({ length: 30 }, (_, i) => `line${i + 1}`).join(
      "\n",
    );
    const changed = long.replace("line15", "CHANGED");
    const out = collapseUnchanged(diffBodies(long, changed), 2);
    const skipped = out.filter((x) => "skipped" in x) as { skipped: number }[];
    expect(skipped.length).toBeGreaterThan(0);
    // 畳んだ行数 + 残した行数 = 全行数
    const kept = out.filter((x) => !("skipped" in x)).length;
    const dropped = skipped.reduce((a, b) => a + b.skipped, 0);
    expect(kept + dropped).toBe(diffBodies(long, changed).length);
  });

  it("変更が無ければ全部畳む", () => {
    const out = collapseUnchanged(diffBodies(A, A), 2);
    expect(out).toEqual([{ skipped: 3 }]);
  });
});
