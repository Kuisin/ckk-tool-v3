/**
 * 作業場所別の工程一覧の純ロジック。
 *
 * 中心は stepOperability — **担当者なしの計画行は誰も縛らない**という規則で、
 * これは step-execution.ts canOperateStep の写し。この画面が権限を広げずに
 * 成立しているのは、その規則が既にあるからなので、ここが緩むと
 * 「一覧では押せるのに開くと 404」になる。
 */

import { describe, expect, it } from "vitest";
import {
  boardHref,
  boardQuery,
  parseScope,
  parseWorkLocationQr,
  stepOperability,
} from "./location-board-core";

describe("parseWorkLocationQr", () => {
  it("作業場所 QR からコードを取り出す", () => {
    expect(parseWorkLocationQr("CKK:LOC:M-03")).toBe("M-03");
  });

  it("大文字小文字は問わない（読み取り機のブレを吸収）", () => {
    expect(parseWorkLocationQr("ckk:loc:M-03")).toBe("M-03");
  });

  it("前後の空白は落とす", () => {
    expect(parseWorkLocationQr("  CKK:LOC:M-03  ")).toBe("M-03");
  });

  // これが本体 — 別の種類の QR を黙って通さない
  it("指示書 QR は受け付けない", () => {
    expect(parseWorkLocationQr("CKK:WO:1234")).toBeNull();
  });

  it("素のカードコード（16 桁）は受け付けない", () => {
    expect(parseWorkLocationQr("1234567890123456")).toBeNull();
  });

  it("空・形式違いは null", () => {
    expect(parseWorkLocationQr("")).toBeNull();
    expect(parseWorkLocationQr("M-03")).toBeNull();
    expect(parseWorkLocationQr("CKK:LOC:")).toBeNull();
  });

  // API 側の zod（max 100）と合わせる — 画面で通して API で弾かれる形にしない
  it("長すぎるコードは null", () => {
    expect(parseWorkLocationQr(`CKK:LOC:${"A".repeat(101)}`)).toBeNull();
    expect(parseWorkLocationQr(`CKK:LOC:${"A".repeat(100)}`)).toBe(
      "A".repeat(100),
    );
  });
});

describe("parseScope", () => {
  it("group のときだけ広げる", () => {
    expect(parseScope("group")).toBe("group");
  });

  // URL は誰でも書ける入力なので、広がる側を既定にしない
  it("不明値・空・null は狭いほうへ倒す", () => {
    expect(parseScope("location")).toBe("location");
    expect(parseScope("GROUP")).toBe("location");
    expect(parseScope("")).toBe("location");
    expect(parseScope(null)).toBe("location");
    expect(parseScope(undefined)).toBe("location");
    expect(parseScope("../etc")).toBe("location");
  });
});

describe("boardHref", () => {
  it("端末の既定を見ているときは loc を付けない", () => {
    expect(boardHref({ code: "M-03", deviceDefaultCode: "M-03" })).toBe(
      "/work-location",
    );
  });

  it("別の作業場所を見ているときは loc を付ける", () => {
    expect(boardHref({ code: "M-04", deviceDefaultCode: "M-03" })).toBe(
      "/work-location?loc=M-04",
    );
  });

  it("グループ全体は scope が付く", () => {
    expect(
      boardHref({ code: "M-03", deviceDefaultCode: "M-03", scope: "group" }),
    ).toBe("/work-location?scope=group");
    expect(
      boardHref({ code: "M-04", deviceDefaultCode: "M-03", scope: "group" }),
    ).toBe("/work-location?loc=M-04&scope=group");
  });

  it("既定が無く場所も無ければ素の道", () => {
    expect(boardHref({})).toBe("/work-location");
  });

  it("コードは URL エンコードされる", () => {
    expect(boardHref({ code: "A B&C" })).toBe("/work-location?loc=A+B%26C");
  });
});

describe("stepOperability", () => {
  const me = "user-me";

  it("計画が 1 行も無ければ操作できる（未計画は開放）", () => {
    expect(stepOperability([], me, false)).toEqual({
      canOperate: true,
      assigneeNames: [],
    });
  });

  // ★ この画面が成立している理由。担当者を決めていない計画は誰も縛らない
  it("担当者なしの計画だけなら操作できる", () => {
    expect(stepOperability([{ userId: null }], me, false)).toEqual({
      canOperate: true,
      assigneeNames: [],
    });
  });

  it("自分の計画なら操作できる", () => {
    expect(
      stepOperability([{ userId: me, displayName: "自分" }], me, false)
        .canOperate,
    ).toBe(true);
  });

  it("他人の計画は操作できず、担当者名を出す", () => {
    expect(
      stepOperability([{ userId: "u-y", displayName: "山田" }], me, false),
    ).toEqual({ canOperate: false, assigneeNames: ["山田"] });
  });

  it("分割計画に自分が入っていれば操作できる（担当者名は全員出す）", () => {
    expect(
      stepOperability(
        [
          { userId: "u-y", displayName: "山田" },
          { userId: me, displayName: "自分" },
        ],
        me,
        false,
      ),
    ).toEqual({ canOperate: true, assigneeNames: ["山田", "自分"] });
  });

  // 担当者が 1 人でも居れば負ける — canOperateStep の userId: { not: null } と同じ
  it("担当者なしの行が混ざっていても、名指しが 1 人居れば操作できない", () => {
    expect(
      stepOperability(
        [{ userId: null }, { userId: "u-y", displayName: "山田" }],
        me,
        false,
      ),
    ).toEqual({ canOperate: false, assigneeNames: ["山田"] });
  });

  // 条件 (b) — 自分が掴んでいる工程は、誰の計画であろうと続けられる
  it("自分がロックを保持していれば操作できる", () => {
    expect(
      stepOperability([{ userId: "u-y", displayName: "山田" }], me, true),
    ).toEqual({ canOperate: true, assigneeNames: ["山田"] });
  });

  it("担当者名は重複を除き、計画順に並ぶ", () => {
    expect(
      stepOperability(
        [
          { userId: "u-y", displayName: "山田" },
          { userId: "u-y", displayName: "山田" },
          { userId: "u-t", displayName: "田中" },
        ],
        me,
        false,
      ).assigneeNames,
    ).toEqual(["山田", "田中"]);
  });
});

describe("boardQuery", () => {
  it("クエリ部分だけを返す（実行画面の戻り先の組み立て用）", () => {
    expect(boardQuery({})).toBe("");
    expect(boardQuery({ code: "M-04" })).toBe("?loc=M-04");
    expect(boardQuery({ code: "M-04", scope: "group" })).toBe(
      "?loc=M-04&scope=group",
    );
    expect(boardQuery({ scope: "group" })).toBe("?scope=group");
  });

  it("端末の既定と同じ場所なら loc を省く", () => {
    expect(boardQuery({ code: "M-03", deviceDefaultCode: "M-03" })).toBe("");
  });
});
