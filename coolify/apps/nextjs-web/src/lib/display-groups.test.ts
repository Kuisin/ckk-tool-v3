import { describe, expect, it } from "vitest";
import {
  groupByMachine,
  type MachineScreen,
  screenLabel,
} from "./display-groups";

const s = (
  id: string,
  machineId: string | null,
  screenIndex: number | null,
): MachineScreen => ({ id, machineId, screenIndex });

describe("groupByMachine", () => {
  it("同じ機械の 2 枚を 1 行にまとめる", () => {
    const groups = groupByMachine([s("a", "pi-1", 1), s("b", "pi-1", 2)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].grouped).toBe(true);
    expect(groups[0].screens.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("何枚目かの昇順に並べる（登録順ではなく）", () => {
    const groups = groupByMachine([s("b", "pi-1", 2), s("a", "pi-1", 1)]);
    expect(groups[0].screens.map((x) => x.id)).toEqual(["a", "b"]);
  });

  // 1 枚運用は機械の手掛かりを持たない。同じ機械かどうか判断できない
  it("machineId が無い画面はまとめない", () => {
    const groups = groupByMachine([s("a", null, null), s("b", null, null)]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => !g.grouped)).toBe(true);
  });

  it("同じ機械が 1 枚だけならまとめない", () => {
    const groups = groupByMachine([s("a", "pi-1", 1)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].grouped).toBe(false);
  });

  it("別の機械は別の行", () => {
    const groups = groupByMachine([
      s("a", "pi-1", 1),
      s("b", "pi-2", 1),
      s("c", "pi-1", 2),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].screens.map((x) => x.id)).toEqual(["a", "c"]);
    expect(groups[1].screens.map((x) => x.id)).toEqual(["b"]);
  });

  // 呼び出し側が並べ替えた順序を、まとめが勝手に変えないこと
  it("元の並び順を保つ（まとめた行は最初の画面の位置に出る）", () => {
    const groups = groupByMachine([
      s("x", null, null),
      s("a", "pi-1", 1),
      s("y", null, null),
      s("b", "pi-1", 2),
    ]);
    expect(groups.map((g) => g.screens[0].id)).toEqual(["x", "a", "y"]);
  });

  it("番号の無い画面は末尾（並びが毎回変わらない）", () => {
    const groups = groupByMachine([
      s("a", "pi-1", null),
      s("b", "pi-1", 2),
      s("c", "pi-1", 1),
    ]);
    expect(groups[0].screens.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("空でも落ちない", () => {
    expect(groupByMachine([])).toEqual([]);
  });
});

describe("screenLabel", () => {
  it("番号があればそれを出す", () => {
    expect(screenLabel(s("a", "pi-1", 2), 0)).toBe("2 枚目");
  });

  it("番号が無ければ順番で埋める", () => {
    expect(screenLabel(s("a", "pi-1", null), 1)).toBe("2 枚目");
  });
});
