import { describe, expect, it } from "vitest";
import {
  allowedProgramActions,
  parseProgramContent,
  programChangePremise,
  resolveContentFile,
} from "./design-program-changes-core";

const state = (s: Partial<Parameters<typeof allowedProgramActions>[0]>) => ({
  current: true,
  retired: false,
  used: false,
  keyUsed: false,
  ...s,
});

describe("allowedProgramActions", () => {
  it("未使用の現行版: その場で直す・消す", () => {
    expect(allowedProgramActions(state({}), { pending: false })).toEqual({
      edit: true,
      revise: false,
      delete: true,
      retire: false,
    });
  });
  it("使用済みの現行版: 新しい版を作る・廃止する（直さない・消さない）", () => {
    expect(
      allowedProgramActions(state({ used: true, keyUsed: true }), {
        pending: false,
      }),
    ).toEqual({ edit: false, revise: true, delete: false, retire: true });
  });
  it("前の版だけ使用済み: 現行版は直せるが消せない（廃止）", () => {
    expect(
      allowedProgramActions(state({ keyUsed: true }), { pending: false }),
    ).toEqual({ edit: true, revise: false, delete: false, retire: true });
  });
  it("保留中・古い版・廃止済みは何も出さない", () => {
    const none = { edit: false, revise: false, delete: false, retire: false };
    expect(allowedProgramActions(state({}), { pending: true })).toEqual(none);
    expect(
      allowedProgramActions(state({ current: false }), { pending: false }),
    ).toEqual(none);
    expect(
      allowedProgramActions(state({ retired: true }), { pending: false }),
    ).toEqual(none);
  });
});

describe("programChangePremise", () => {
  it("追加は前提なし", () => {
    expect(programChangePremise("ADD", null)).toBeNull();
  });
  it("承認待ちのあいだに使用済みになった版は直さない", () => {
    expect(
      programChangePremise("EDIT", state({ used: true, keyUsed: true })),
    ).toBe("used");
    // 新しい版なら当たる
    expect(
      programChangePremise("REVISE", state({ used: true, keyUsed: true })),
    ).toBeNull();
  });
  it("どれかの版が使用済みなら消さない", () => {
    expect(programChangePremise("DELETE", state({ keyUsed: true }))).toBe(
      "keyUsed",
    );
  });
  it("基にした版がもう現行版でない・廃止済み・消えた", () => {
    expect(programChangePremise("REVISE", state({ current: false }))).toBe(
      "notCurrent",
    );
    expect(programChangePremise("RETIRE", state({ retired: true }))).toBe(
      "retired",
    );
    expect(programChangePremise("EDIT", null)).toBe("notFound");
  });
});

describe("parseProgramContent / resolveContentFile", () => {
  it("工程が無い中身は読まない", () => {
    expect(parseProgramContent({ name: "x", processStepIds: [] })).toBeNull();
  });
  it("機種とファイルの扱いは既定で空・引き継ぎ", () => {
    expect(parseProgramContent({ name: "x", processStepIds: [1] })).toEqual({
      name: "x",
      processStepIds: [1],
      machineModelIds: [],
      file: "keep",
    });
  });
  it("ファイル: keep は元、remove は無し、new は上げたもの", () => {
    expect(resolveContentFile({ file: "keep" }, "a", "b")).toBe("a");
    expect(resolveContentFile({ file: "remove" }, "a", "b")).toBeNull();
    expect(resolveContentFile({ file: "new" }, "a", "b")).toBe("b");
  });
});
