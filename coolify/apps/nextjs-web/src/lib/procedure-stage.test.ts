import { describe, expect, it } from "vitest";
import {
  activeStageIndex,
  type ProcedureStageDef,
  procedureStages,
} from "./procedure-stage";

const DEFS: ProcedureStageDef[] = [
  { key: "draft", label: "下書き" },
  { key: "issued", label: "発行" },
  { key: "delivered", label: "納品済" },
];

const states = (current: number, stopped = false) =>
  procedureStages(DEFS, current, { stopped }).map((s) => s.state);

describe("procedureStages", () => {
  it("先頭に居るときは 1 段目だけが current", () => {
    expect(states(0)).toEqual(["current", "pending", "pending"]);
  });

  it("済んだ段は done で、current は 1 つだけ", () => {
    expect(states(1)).toEqual(["done", "current", "pending"]);
    expect(states(2)).toEqual(["done", "done", "current"]);
  });

  // 納品書の「発行」— 発行済みなら発行は済んだ段。ここが done にならず
  // current（スピナー）になっていたのが元のバグ。
  it("全段が済んだら current は無い", () => {
    expect(states(DEFS.length)).toEqual(["done", "done", "done"]);
  });

  it("止まった書類の残りは pending ではなく skipped", () => {
    expect(states(1, true)).toEqual(["done", "skipped", "skipped"]);
  });

  it("最初から止まった書類は 1 段目から skipped", () => {
    expect(states(0, true)).toEqual(["skipped", "skipped", "skipped"]);
  });

  it("負数はまだどの段にも入っていない（承認依頼を出す前など）", () => {
    expect(states(-1)).toEqual(["pending", "pending", "pending"]);
  });

  it("段数を超えた current は全段完了に丸める", () => {
    expect(states(99)).toEqual(["done", "done", "done"]);
  });

  it("状態以外の中身はそのまま持ち回る", () => {
    const stages = procedureStages(
      [{ key: "a", label: "A", description: "説明", color: "red" }],
      0,
    );
    expect(stages[0]).toEqual({
      key: "a",
      label: "A",
      description: "説明",
      color: "red",
      state: "current",
    });
  });
});

describe("activeStageIndex", () => {
  it("current の段を指す", () => {
    expect(activeStageIndex(procedureStages(DEFS, 1))).toBe(1);
  });

  it("current が無ければ done の数（完了・中断・未着手のどれでも）", () => {
    expect(activeStageIndex(procedureStages(DEFS, DEFS.length))).toBe(3);
    expect(activeStageIndex(procedureStages(DEFS, 1, { stopped: true }))).toBe(
      1,
    );
    expect(activeStageIndex(procedureStages(DEFS, -1))).toBe(0);
  });
});
