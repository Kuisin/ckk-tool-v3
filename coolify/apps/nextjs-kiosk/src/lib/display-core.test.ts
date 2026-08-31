import { describe, expect, it } from "vitest";
import {
  DISPLAY_ONLINE_WINDOW_MS,
  DISPLAY_TOKEN_TTL_MS,
  extractPairingCode,
  isDisplayOnline,
  isDisplayTokenAlive,
  isPairingAlive,
  PAIRING_CODE_LENGTH,
  pairingRemainingMs,
} from "./display-core";

const NOW = new Date("2026-08-31T09:00:00.000Z");

describe("isDisplayTokenAlive", () => {
  it("期限が未来なら生きている", () => {
    expect(isDisplayTokenAlive(NOW, new Date(NOW.getTime() + 1000))).toBe(true);
  });

  it("期限ちょうどは切れている（境界は失効側）", () => {
    expect(isDisplayTokenAlive(NOW, new Date(NOW.getTime()))).toBe(false);
  });

  it("null は切れている扱い（トークン未発行）", () => {
    expect(isDisplayTokenAlive(NOW, null)).toBe(false);
  });

  it("365 日先まで生きる", () => {
    const issued = new Date(NOW.getTime() + DISPLAY_TOKEN_TTL_MS);
    expect(isDisplayTokenAlive(NOW, issued)).toBe(true);
    // 1 日前でもまだ生きている = キオスクの 30 日より確実に長い
    const almost = new Date(NOW.getTime() + DISPLAY_TOKEN_TTL_MS - 86_400_000);
    expect(isDisplayTokenAlive(NOW, almost)).toBe(true);
  });
});

describe("isPairingAlive", () => {
  it("期限内なら有効", () => {
    expect(isPairingAlive(NOW, new Date(NOW.getTime() + 60_000))).toBe(true);
  });

  it("期限切れ・null は無効", () => {
    expect(isPairingAlive(NOW, new Date(NOW.getTime() - 1))).toBe(false);
    expect(isPairingAlive(NOW, null)).toBe(false);
  });
});

describe("isDisplayOnline", () => {
  it("窓の内側ならオンライン", () => {
    const seen = new Date(NOW.getTime() - DISPLAY_ONLINE_WINDOW_MS + 1);
    expect(isDisplayOnline(NOW, seen)).toBe(true);
  });

  it("窓ちょうどはオフライン", () => {
    const seen = new Date(NOW.getTime() - DISPLAY_ONLINE_WINDOW_MS);
    expect(isDisplayOnline(NOW, seen)).toBe(false);
  });

  it("一度も見ていなければオフライン", () => {
    expect(isDisplayOnline(NOW, null)).toBe(false);
  });
});

describe("pairingRemainingMs", () => {
  it("残り時間を返す", () => {
    expect(pairingRemainingMs(NOW, new Date(NOW.getTime() + 90_000))).toBe(
      90_000,
    );
  });

  it("過ぎていても負値にしない", () => {
    expect(pairingRemainingMs(NOW, new Date(NOW.getTime() - 90_000))).toBe(0);
  });
});

describe("extractPairingCode", () => {
  const CODE = "ABCDEFGHJKLM"; // 12 桁・Crockford 内の文字だけ

  it("ペアリング URL から取り出す", () => {
    expect(
      extractPairingCode(
        `https://app.example.jp/settings/displays/pair?code=${CODE}`,
      ),
    ).toBe(CODE);
  });

  it("URL のダッシュ区切りコードも正規化する", () => {
    expect(
      extractPairingCode(
        "https://app.example.jp/settings/displays/pair?code=ABCD-EFGH-JKLM",
      ),
    ).toBe(CODE);
  });

  it("素のコード（手入力）を受け付ける", () => {
    expect(extractPairingCode(CODE)).toBe(CODE);
    expect(extractPairingCode("abcd-efgh-jklm")).toBe(CODE);
    expect(extractPairingCode("  ABCD EFGH JKLM  ")).toBe(CODE);
  });

  it("桁数が違えば空（部分入力を通さない）", () => {
    expect(extractPairingCode("ABCD-EFGH")).toBe("");
    expect(extractPairingCode(`${CODE}X`)).toBe("");
  });

  it("code の無い URL は空", () => {
    expect(extractPairingCode("https://app.example.jp/settings/displays")).toBe(
      "",
    );
  });

  it("空・空白・null 相当は空", () => {
    expect(extractPairingCode("")).toBe("");
    expect(extractPairingCode("   ")).toBe("");
    expect(extractPairingCode(undefined as unknown as string)).toBe("");
  });

  it("紛らわしい文字（I/O/0/1）はここでは落とさず、照合で外す", () => {
    // 生成側のアルファベットに 0 は無いので、この値に一致する行は存在しない。
    // ここで弾かずに通すのは、「読み取れません」ではなく「そのコードは
    // 見つかりません」と言えるようにするため（打ち間違いの手掛かりになる）。
    const misread = extractPairingCode("ABCD-EFGH-JKL0");
    expect(misread).toBe("ABCDEFGHJKL0");
    expect(misread).toHaveLength(PAIRING_CODE_LENGTH);
  });
});
