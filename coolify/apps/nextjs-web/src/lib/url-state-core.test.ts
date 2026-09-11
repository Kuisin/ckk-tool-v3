import { describe, expect, it } from "vitest";
import {
  type MirroredState,
  NOT_PENDING,
  reconcileMirrored,
  writeMirrored,
} from "./url-state-core";

/** 初期状態（URL から起こした、待ちの無い状態）。 */
const init = <T>(source: T): MirroredState<T> => ({
  value: source,
  pending: NOT_PENDING,
});

describe("打鍵と URL の追いつき", () => {
  it("自分が書いた値は即座に反映される", () => {
    expect(writeMirrored("あ")).toEqual({ value: "あ", pending: "あ" });
  });

  it("URL が追いつくまでの古い値では上書きされない", () => {
    // これが壊れていた本体 — useSearchParams() は startTransition 越しに
    // 遅れて届くので、打鍵直後の source は「打つ前の値」になる。
    const typed = writeMirrored("あ");
    expect(reconcileMirrored(typed, "")).toBe(typed); // "" で戻さない
  });

  it("続けて打っても、途中の古い URL 値を拾わない", () => {
    let s = writeMirrored("あ");
    s = reconcileMirrored(s, ""); // まだ古い
    s = writeMirrored("あさ"); // 2 打目
    s = reconcileMirrored(s, "あ"); // 1 打目ぶんがようやく届く
    expect(s.value).toBe("あさ");
  });

  it("URL が追いついたら印を下ろす", () => {
    const s = reconcileMirrored(writeMirrored("あ"), "あ");
    expect(s).toEqual({ value: "あ", pending: NOT_PENDING });
  });
});

describe("外からの変更", () => {
  it("待っていないときの URL 変化は取り込む（戻る/進む・リンク）", () => {
    expect(reconcileMirrored(init("あ"), "い")).toEqual({
      value: "い",
      pending: NOT_PENDING,
    });
  });

  it("変化が無ければ同じ参照を返す（余分な再レンダーを起こさない）", () => {
    const s = init("あ");
    expect(reconcileMirrored(s, "あ")).toBe(s);
  });
});

describe("クリア", () => {
  it("空文字へのリセットも「自分の更新」として通る", () => {
    let s = writeMirrored("あ");
    s = reconcileMirrored(s, "あ");
    s = writeMirrored(""); // リセットボタン
    expect(s.value).toBe("");
    s = reconcileMirrored(s, ""); // URL からパラメータが消えた
    expect(s).toEqual({ value: "", pending: NOT_PENDING });
  });

  it("null（Select のクリア）は「待ちなし」と区別される", () => {
    const s = writeMirrored<string | null>(null);
    expect(s.pending).toBe(null);
    expect(s.pending).not.toBe(NOT_PENDING);
    expect(reconcileMirrored(s, null)).toEqual({
      value: null,
      pending: NOT_PENDING,
    });
  });
});
