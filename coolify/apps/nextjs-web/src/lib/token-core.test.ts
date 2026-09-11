import { describe, expect, it } from "vitest";
import {
  mintToken,
  OPAQUE_TOKEN_LENGTH,
  parseBearerToken,
  sha256hex,
  tokenLast4,
} from "./token-core";

const TOKEN = "A".repeat(OPAQUE_TOKEN_LENGTH);

describe("sha256hex", () => {
  it("既知のベクタと一致する", () => {
    expect(sha256hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("64 桁の小文字 16 進を返す", () => {
    expect(sha256hex("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("mintToken", () => {
  it("base64url の 43 文字と、その sha256 を返す", () => {
    const { raw, hash } = mintToken();
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(sha256hex(raw));
  });

  it("衝突しない（1000 回引いて全部違う）", () => {
    const seen = new Set(Array.from({ length: 1000 }, () => mintToken().raw));
    expect(seen.size).toBe(1000);
  });
});

describe("tokenLast4", () => {
  it("下 4 桁を返す", () => {
    expect(tokenLast4("abcdefgh")).toBe("efgh");
  });

  it("4 文字以下でも例外にしない", () => {
    expect(tokenLast4("ab")).toBe("ab");
    expect(tokenLast4("")).toBe("");
  });
});

describe("parseBearerToken", () => {
  it("正しい提示を受ける", () => {
    expect(parseBearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
  });

  it("スキームの大文字小文字は区別しない（RFC 9110 §11.1）", () => {
    expect(parseBearerToken(`bearer ${TOKEN}`)).toBe(TOKEN);
    expect(parseBearerToken(`BEARER ${TOKEN}`)).toBe(TOKEN);
  });

  it("前後の空白は許す", () => {
    expect(parseBearerToken(`  Bearer ${TOKEN}  `)).toBe(TOKEN);
  });

  it.each([
    ["null", null],
    ["空", ""],
    ["スキーム無し", TOKEN],
    ["別スキーム", `Basic ${TOKEN}`],
    ["区切りが空白 2 つ", `Bearer  ${TOKEN}`],
    ["短い", `Bearer ${"A".repeat(42)}`],
    ["長い", `Bearer ${"A".repeat(44)}`],
    ["base64（base64url ではない）", `Bearer ${"A".repeat(41)}+/=`],
    ["トークンに空白", "Bearer a b"],
    ["スキームだけ", "Bearer"],
  ])("弾く: %s", (_label, header) => {
    expect(parseBearerToken(header)).toBeNull();
  });
});
