/**
 * 「何枚目か」の自動割り当て。
 *
 * Web Locks を偽物に差し替えて、**同じブラウザで窓を増やしたときの振る舞い**を
 * 確かめる。実際の窓を開かずに試せるのは、判断が錠の取得結果だけで決まるため。
 *
 * ここで守りたいのは 2 つ:
 *   - URL で明示された番号を**勝手に変えない**（Pi・固定運用の指定が優先）
 *   - Web Locks が無いブラウザでも**従来どおり動く**（1 枚目として振る舞う）
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 掴んだ錠はモジュールの中に持つ（ページが生きている間ずっと握るため）。
 * 試験ごとに**読み込み直す** — 1 回のページ読み込み = 1 つのモジュール、
 * という実物の関係に合わせる。使い回すと前の試験の錠が残る。
 */
async function freshModule() {
  vi.resetModules();
  return await import("./screen-slot");
}

/** 錠の名前（読み込み直しても変わらないので、ここで持っておく）。 */
const slotLockName = (i: number) => `ckk-display-screen-${i}`;

/** 取られている錠の名前。テストごとに作り直す。 */
let taken: Set<string>;

/** ページが生きている間ずっと握る、という実物の性質を真似た偽物。 */
function fakeLocks() {
  return {
    request: (
      name: string,
      _opts: { ifAvailable?: boolean },
      cb: (lock: unknown) => unknown,
    ) => {
      if (taken.has(name)) return Promise.resolve(cb(null));
      taken.add(name);
      // 実物は cb が返す Promise が解決するまで握り続ける。
      // ここでは解決しない Promise を渡された想定で、取得だけ通す。
      cb({ name });
      return new Promise(() => undefined); // 握りっぱなし
    },
    query: async () => ({
      held: [...taken].map((name) => ({ name })),
      pending: [],
    }),
  };
}

beforeEach(() => {
  taken = new Set();
  vi.stubGlobal("navigator", { locks: fakeLocks() });
});

describe("自動割り当て（URL に指定が無いとき）", () => {
  it("最初の窓は 1 枚目", async () => {
    const { claimScreenSlot } = await freshModule();
    const slot = await claimScreenSlot(null);
    expect(slot.index).toBe(1);
    expect(slot.auto).toBe(true);
  });

  it("1 枚目が空いていなければ 2 枚目を取る", async () => {
    taken.add(slotLockName(1)); // 既に別の窓が開いている
    const { claimScreenSlot } = await freshModule();
    const slot = await claimScreenSlot(null);
    expect(slot.index).toBe(2);
  });

  it("間が空いていればそこを埋める（閉じた窓の番号を再利用）", async () => {
    taken.add(slotLockName(1));
    taken.add(slotLockName(3));
    const { claimScreenSlot } = await freshModule();
    const slot = await claimScreenSlot(null);
    expect(slot.index).toBe(2);
  });

  it("総数は握られている錠の数（見出しの「1/2 枚目」に使う）", async () => {
    taken.add(slotLockName(1));
    const { claimScreenSlot } = await freshModule();
    const slot = await claimScreenSlot(null);
    expect(slot.total).toBe(2);
  });
});

describe("URL の指定が優先（勝手に変えない）", () => {
  it("指定された番号で振る舞う", async () => {
    const { claimScreenSlot } = await freshModule();
    const slot = await claimScreenSlot(2);
    expect(slot.index).toBe(2);
    expect(slot.auto).toBe(false);
  });

  // 明示を上書きすると、Pi の 2 枚目が勝手に 1 枚目の登録を拾ってしまう
  it("その番号が埋まっていても、指定を変えない", async () => {
    taken.add(slotLockName(2));
    const { claimScreenSlot } = await freshModule();
    const slot = await claimScreenSlot(2);
    expect(slot.index).toBe(2);
  });
});

describe("Web Locks が無いブラウザ", () => {
  it("従来どおり 1 枚目として動く（機能を止めない）", async () => {
    vi.stubGlobal("navigator", {});
    const { claimScreenSlot } = await freshModule();
    const slot = await claimScreenSlot(null);
    expect(slot).toEqual({ index: 1, total: 1, auto: false });
  });

  it("指定があればそれに従う", async () => {
    vi.stubGlobal("navigator", {});
    const { claimScreenSlot } = await freshModule();
    expect((await claimScreenSlot(3)).index).toBe(3);
  });
});
