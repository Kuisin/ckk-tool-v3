import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "./safe-redirect";

describe("safeCallbackPath", () => {
  it("アプリ内のパスはそのまま返す", () => {
    expect(safeCallbackPath("/f/SALESRPT")).toBe("/f/SALESRPT");
    expect(safeCallbackPath("/general/forms/ABC?tab=share")).toBe(
      "/general/forms/ABC?tab=share",
    );
    expect(safeCallbackPath("/f/A/FRM-1/edit#memo")).toBe(
      "/f/A/FRM-1/edit#memo",
    );
  });

  it("値が無ければ / に倒す", () => {
    expect(safeCallbackPath(null)).toBe("/");
    expect(safeCallbackPath(undefined)).toBe("/");
    expect(safeCallbackPath("")).toBe("/");
    expect(safeCallbackPath("   ")).toBe("/");
    expect(safeCallbackPath(42 as unknown as string)).toBe("/");
  });

  // ここが本題 — 外部サイトへ飛ばせないこと。
  it("絶対 URL は外へ出さず、パスだけを採る", () => {
    expect(safeCallbackPath("https://evil.example/phish")).toBe("/phish");
    expect(safeCallbackPath("http://evil.example")).toBe("/");
  });

  it("プロトコル相対 URL も外へ出さない", () => {
    expect(safeCallbackPath("//evil.example/phish")).toBe("/phish");
    expect(safeCallbackPath("//evil.example")).toBe("/");
  });

  it("バックスラッシュで // を作る細工を弾く", () => {
    // ブラウザは /\evil.example を //evil.example と解釈する
    expect(safeCallbackPath("/\\evil.example/phish")).toBe("/");
    expect(safeCallbackPath("\\\\evil.example/phish")).toBe("/");
  });

  it("javascript: などのスキームを弾く", () => {
    expect(safeCallbackPath("javascript:alert(1)")).toBe("/");
    expect(safeCallbackPath("data:text/html,<script>")).toBe("/");
  });

  it("ログイン画面へは戻さない（輪を作らない）", () => {
    expect(safeCallbackPath("/login")).toBe("/");
    expect(safeCallbackPath("/login?callbackUrl=%2F")).toBe("/");
    expect(safeCallbackPath("/login/sso")).toBe("/");
    // 前方一致だけで弾かない — 別アプリの正当なパスは通す
    expect(safeCallbackPath("/settings/login-history")).toBe(
      "/settings/login-history",
    );
  });

  it("fallback を指定できる", () => {
    expect(safeCallbackPath(null, "/general/forms")).toBe("/general/forms");
  });
});
