/**
 * **止められた機器に新しいリンクコードを出さない**という決まり。
 *
 * 出してしまうと 2 つ壊れる:
 *   1. 停止・失効が迂回できる。管理者が止めた端末が、自分で登録し直して
 *      別のプロファイルとして復活する。
 *   2. 同じ実機のプロファイルが二重にできる。元の行は残るので、一覧に同じ
 *      タブレットが 2 つ並び、どちらが本物か分からなくなる。
 *
 * 端末（タブレット）と画面（ディスプレイ）で**同じ判断**でなければならない。
 * 片方だけ緩いと、緩いほうから同じことが起きる。
 */

import { describe, expect, it } from "vitest";
import { displayRegistrationBlocked } from "./display-core";
import { registrationBlocked } from "./kiosk-auth-core";

describe("registrationBlocked（端末・画面で同じ判断）", () => {
  const both = [
    ["DISABLED", true, "一時停止 — 止めた端末を自分で復活させない"],
    ["REVOKED", true, "失効 — 同上"],
    ["NO_COOKIE", false, "素の新品。登録できないと何も始まらない"],
    ["NOT_FOUND", false, "行ごと消された端末。登録し直してよい"],
    ["EXPIRED", false, "行は生きている。再有効化 or 登録し直しの道を残す"],
  ] as const;

  for (const [reason, blocked, why] of both) {
    it(`${reason} → ${blocked ? "出さない" : "出してよい"}（${why}）`, () => {
      expect(registrationBlocked(reason)).toBe(blocked);
      expect(displayRegistrationBlocked(reason)).toBe(blocked);
    });
  }

  it("端末だけにある理由も同じ扱い（アテスト要求は登録の妨げにしない）", () => {
    expect(registrationBlocked("ATTEST_REQUIRED")).toBe(false);
  });

  // 知らない理由を「止める」に倒すと、新品が登録できなくなって現場が止まる。
  // 「出してよい」に倒すのは、新しい理由を足した人が明示的に決める前提。
  it("知らない理由は塞がない（新品を止めない）", () => {
    expect(registrationBlocked("SOMETHING_NEW")).toBe(false);
    expect(displayRegistrationBlocked("SOMETHING_NEW")).toBe(false);
  });
});
