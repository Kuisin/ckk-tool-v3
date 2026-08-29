import { describe, expect, it } from "vitest";
import {
  AI_PROVIDER_PRESETS,
  AI_PROVIDERS,
  type AiProviderSettings,
  aiProviderSettingsSchema,
  DEFAULT_AI_PROVIDER_SETTINGS,
  encodeWireConfig,
  redactAiSettings,
  toWireConfig,
} from "./ai-provider-core";

const base = DEFAULT_AI_PROVIDER_SETTINGS;

describe("ai-provider-core", () => {
  it("既定はローカル ollama", () => {
    expect(base.provider).toBe("ollama");
  });

  it("プロバイダごとにプリセットが揃っている", () => {
    for (const p of AI_PROVIDERS) {
      expect(AI_PROVIDER_PRESETS[p]?.value).toBe(p);
      expect(AI_PROVIDER_PRESETS[p].baseUrlPlaceholder).toMatch(/^https?:\/\//);
    }
    expect(AI_PROVIDER_PRESETS.ollama.tokenRequired).toBe(false);
    for (const p of ["openai", "anthropic", "gemini"] as const) {
      expect(AI_PROVIDER_PRESETS[p].tokenRequired).toBe(true);
    }
  });

  // これが崩れると、設定していない環境の挙動が黙って変わる。
  it("既定のまま触っていなければヘッダを付けない", () => {
    expect(toWireConfig(base, null)).toBeNull();
    expect(toWireConfig(base, "")).toBeNull();
  });

  it("ollama でも何か指定していればヘッダを付ける", () => {
    expect(
      toWireConfig({ ...base, visionModel: "llava" }, null),
    ).not.toBeNull();
    expect(
      toWireConfig({ ...base, baseUrl: "http://gpu:11434" }, null),
    ).not.toBeNull();
    expect(toWireConfig(base, "token")).not.toBeNull();
  });

  it("structModel が空なら visionModel を使う", () => {
    const wire = toWireConfig(
      { ...base, provider: "openai", visionModel: "m" },
      "k",
    );
    expect(wire?.structModel).toBe("m");
  });

  it("ワイヤ形式は v=1 の base64url JSON", () => {
    const wire = toWireConfig(
      { ...base, provider: "openai", visionModel: "m" },
      "sk-1",
    );
    if (!wire) throw new Error("expected a wire config");
    const decoded = JSON.parse(
      Buffer.from(encodeWireConfig(wire), "base64url").toString("utf8"),
    );
    expect(decoded).toMatchObject({
      v: 1,
      provider: "openai",
      structModel: "m",
      apiKey: "sk-1",
    });
    // URL に載せても壊れない文字だけであること
    expect(encodeWireConfig(wire)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  describe("検証", () => {
    const ok = (s: Partial<AiProviderSettings>) =>
      aiProviderSettingsSchema.safeParse({ ...base, ...s }).success;

    it("ベース URL は空か http(s)", () => {
      expect(ok({ baseUrl: "" })).toBe(true);
      expect(ok({ baseUrl: "https://api.openai.com/v1" })).toBe(true);
      expect(ok({ baseUrl: "api.openai.com" })).toBe(false);
      expect(ok({ baseUrl: "ftp://x" })).toBe(false);
    });

    it("プロバイダは既知の 4 つだけ", () => {
      expect(ok({ provider: "openai" })).toBe(true);
      expect(
        aiProviderSettingsSchema.safeParse({ ...base, provider: "bogus" })
          .success,
      ).toBe(false);
    });

    it("maxOutputTokens に範囲がある", () => {
      expect(ok({ maxOutputTokens: 8192 })).toBe(true);
      expect(ok({ maxOutputTokens: 0 })).toBe(false);
      expect(ok({ maxOutputTokens: 10 ** 7 })).toBe(false);
    });
  });

  // 監査ログは追記専用で広く読まれる。トークンは平文も暗号文も残さない。
  it("監査用の射影がトークンを漏らさない", () => {
    const redacted = redactAiSettings(
      { ...base, provider: "openai", visionModel: "m" },
      { status: "set", last4: "ab3x" },
    );
    const json = JSON.stringify(redacted);
    expect(json).toContain("ab3x");
    expect(json).not.toMatch(/"(ct|iv|tag|apiKey)"/);
    expect(json).not.toContain("sk-");
    expect(redacted.apiToken).toContain("設定済み");
  });

  it("未設定は未設定と書く", () => {
    const redacted = redactAiSettings(base, { status: "absent", last4: null });
    expect(redacted.apiToken).toBe("未設定");
  });
});
