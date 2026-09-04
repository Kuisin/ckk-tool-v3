import { describe, expect, it } from "vitest";
import {
  isEmptyPortalGuideScope,
  isPlausibleEmail,
  portalLoginUrl,
  summarizePortalGuideScope,
} from "./portal-guide-core";

describe("isPlausibleEmail", () => {
  it("ふつうのアドレスを通す", () => {
    for (const v of [
      "tanaka@example.co.jp",
      "a.b+c@sub.example.com",
      "  spaced@example.jp  ",
    ]) {
      expect(isPlausibleEmail(v), v).toBe(true);
    }
  });

  it("アドレスに見えない値は弾く（入力欄に細工を出させない）", () => {
    for (const v of [
      "",
      "   ",
      "no-at-sign",
      "@example.com",
      "user@",
      "user@localhost", // ドットが無い＝社外の宛先にはならない
      "user@ex ample.com",
      "確認コードは 123456 です",
      `a@${"x".repeat(300)}.com`, // 254 文字超
    ]) {
      expect(isPlausibleEmail(v), JSON.stringify(v)).toBe(false);
    }
  });
});

describe("portalLoginUrl", () => {
  it("末尾のスラッシュがあってもなくても同じ URL になる", () => {
    expect(portalLoginUrl("https://app.example.jp")).toBe(
      "https://app.example.jp/portal/login",
    );
    expect(portalLoginUrl("https://app.example.jp///")).toBe(
      "https://app.example.jp/portal/login",
    );
  });

  it("アドレスを前埋めする（URL エンコードする）", () => {
    expect(portalLoginUrl("https://app.example.jp", "a+b@example.co.jp")).toBe(
      "https://app.example.jp/portal/login?e=a%2Bb%40example.co.jp",
    );
  });

  it("アドレスが無い・形が違うときは素のログイン URL", () => {
    const plain = "https://app.example.jp/portal/login";
    expect(portalLoginUrl("https://app.example.jp", null)).toBe(plain);
    expect(portalLoginUrl("https://app.example.jp", "")).toBe(plain);
    expect(portalLoginUrl("https://app.example.jp", "not-an-email")).toBe(
      plain,
    );
  });

  it("QR に載せる長さに収まる（自前エンコーダは型番 10 まで）", () => {
    const url = portalLoginUrl(
      "https://app-dev.ckk-tool.co.jp",
      "purchasing.department@very-long-customer-name.co.jp",
    );
    // 型番 10 / 誤り訂正 M のバイトモード容量は 271 バイト。
    expect(new TextEncoder().encode(url).length).toBeLessThan(200);
  });
});

describe("summarizePortalGuideScope", () => {
  it("BP_SCOPE があれば書類と進捗が見える", () => {
    const scope = summarizePortalGuideScope([
      { kind: "BP_SCOPE", includeBranches: true, includeAsEndUser: false },
    ]);
    expect(scope.documents).toBe(true);
    expect(scope.branches).toBe(true);
    expect(scope.asEndUser).toBe(false);
  });

  it("広いほうが勝つ（付与の和集合）", () => {
    const scope = summarizePortalGuideScope([
      { kind: "BP_SCOPE", includeBranches: false, includeAsEndUser: false },
      { kind: "BP_SCOPE", includeBranches: true, includeAsEndUser: true },
    ]);
    expect(scope.branches).toBe(true);
    expect(scope.asEndUser).toBe(true);
  });

  it("個別の書類は数え、フォームは名前を重複なく並べる", () => {
    const scope = summarizePortalGuideScope([
      { kind: "DOCUMENT" },
      { kind: "DOCUMENT" },
      { kind: "FORM", formTitle: "検査報告" },
      { kind: "FORM", formTitle: "検査報告" },
      { kind: "FORM", formTitle: "クレーム記録" },
    ]);
    expect(scope.singleDocuments).toBe(2);
    expect(scope.forms).toEqual(["検査報告", "クレーム記録"]);
  });

  it("名前を引けなかったフォームは載せない（無い名前を紙に書かない）", () => {
    const scope = summarizePortalGuideScope([
      { kind: "FORM", formTitle: null },
      { kind: "FORM", formTitle: "  " },
    ]);
    expect(scope.forms).toEqual([]);
  });

  it("未知の kind は数えない（紙に嘘を書かない）", () => {
    const scope = summarizePortalGuideScope([{ kind: "SOMETHING_NEW" }]);
    expect(isEmptyPortalGuideScope(scope)).toBe(true);
  });

  it("何も無い付与は「案内するものが無い」と判る", () => {
    expect(isEmptyPortalGuideScope(summarizePortalGuideScope([]))).toBe(true);
    expect(
      isEmptyPortalGuideScope(
        summarizePortalGuideScope([{ kind: "DOCUMENT" }]),
      ),
    ).toBe(false);
  });
});
