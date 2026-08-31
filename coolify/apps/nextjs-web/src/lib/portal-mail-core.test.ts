import { describe, expect, it } from "vitest";
import { isMailAllowlisted, maskEmail } from "./portal-mail-core";

describe("isMailAllowlisted", () => {
  it("**未設定なら送らない**（開けっ放しの既定を作らない）", () => {
    expect(isMailAllowlisted("taro@example.co.jp", undefined)).toBe(false);
    expect(isMailAllowlisted("taro@example.co.jp", "")).toBe(false);
    expect(isMailAllowlisted("taro@example.co.jp", "   ")).toBe(false);
    expect(isMailAllowlisted("taro@example.co.jp", " , , ")).toBe(false);
  });

  it("アドレス完全一致", () => {
    const list = "taro@example.co.jp";
    expect(isMailAllowlisted("taro@example.co.jp", list)).toBe(true);
    expect(isMailAllowlisted("hanako@example.co.jp", list)).toBe(false);
  });

  it("大文字・前後の空白を吸収する", () => {
    expect(
      isMailAllowlisted("  Taro@Example.CO.JP ", "taro@example.co.jp"),
    ).toBe(true);
    expect(
      isMailAllowlisted("taro@example.co.jp", " TARO@EXAMPLE.CO.JP "),
    ).toBe(true);
  });

  it("ドメイン指定（@つき / なし どちらも）", () => {
    for (const list of ["@example.co.jp", "example.co.jp"]) {
      expect(isMailAllowlisted("anyone@example.co.jp", list), list).toBe(true);
      expect(isMailAllowlisted("anyone@other.co.jp", list), list).toBe(false);
    }
  });

  it("**部分一致では通さない**（サブドメイン・接尾辞を許さない）", () => {
    const list = "example.co.jp";
    expect(isMailAllowlisted("a@evil-example.co.jp", list)).toBe(false);
    expect(isMailAllowlisted("a@example.co.jp.evil.com", list)).toBe(false);
    expect(isMailAllowlisted("a@sub.example.co.jp", list)).toBe(false);
  });

  it("複数エントリはどれかに当たれば通る", () => {
    const list = "taro@example.co.jp, @partner.jp";
    expect(isMailAllowlisted("taro@example.co.jp", list)).toBe(true);
    expect(isMailAllowlisted("who@partner.jp", list)).toBe(true);
    expect(isMailAllowlisted("who@nope.jp", list)).toBe(false);
  });

  it("空の宛先は通さない", () => {
    expect(isMailAllowlisted("", "example.co.jp")).toBe(false);
    expect(isMailAllowlisted("   ", "example.co.jp")).toBe(false);
  });

  it("@ を含まない入力でドメイン規則に当たらない", () => {
    expect(isMailAllowlisted("example.co.jp", "example.co.jp")).toBe(false);
  });
});

describe("maskEmail", () => {
  it("ローカル部とドメインの頭だけ残す（TLD は残す）", () => {
    expect(maskEmail("taro@example.co.jp")).toBe("t***@e***.c***.jp");
  });

  it("単純なドメイン", () => {
    expect(maskEmail("bob@example.com")).toBe("b***@e***.com");
  });

  it("**完全なアドレスは出さない**", () => {
    for (const addr of ["taro@example.co.jp", "bob@example.com", "x@y.jp"]) {
      const masked = maskEmail(addr);
      const local = addr.slice(0, addr.indexOf("@"));
      if (local.length > 1) expect(masked).not.toContain(local);
      expect(masked).not.toBe(addr);
    }
  });

  it("壊れた入力でも例外にせず伏せる", () => {
    expect(maskEmail("")).toBe("***");
    expect(maskEmail("no-at-sign")).toBe("***");
    expect(maskEmail("@leading")).toBe("***");
  });
});
