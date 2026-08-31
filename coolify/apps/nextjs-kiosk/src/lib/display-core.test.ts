import { describe, expect, it } from "vitest";
import {
  DISPLAY_ONLINE_WINDOW_MS,
  DISPLAY_SCALE_DEFAULT,
  DISPLAY_SCALE_MAX,
  DISPLAY_SCALE_MIN,
  DISPLAY_TOKEN_TTL_MS,
  extractLinkCode,
  fitRowsToHeight,
  isDisplayOnline,
  isDisplayTokenAlive,
  isLinkRequestAlive,
  LINK_CODE_LENGTH,
  linkRemainingMs,
  normalizeScalePercent,
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

describe("isLinkRequestAlive", () => {
  it("期限内なら有効", () => {
    expect(isLinkRequestAlive(NOW, new Date(NOW.getTime() + 60_000))).toBe(
      true,
    );
  });

  it("期限切れ・null は無効", () => {
    expect(isLinkRequestAlive(NOW, new Date(NOW.getTime() - 1))).toBe(false);
    expect(isLinkRequestAlive(NOW, null)).toBe(false);
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

describe("linkRemainingMs", () => {
  it("残り時間を返す", () => {
    expect(linkRemainingMs(NOW, new Date(NOW.getTime() + 90_000))).toBe(90_000);
  });

  it("過ぎていても負値にしない", () => {
    expect(linkRemainingMs(NOW, new Date(NOW.getTime() - 90_000))).toBe(0);
  });
});

describe("extractLinkCode", () => {
  const CODE = "ABCDEFGHJKLM"; // 12 桁・Crockford 内の文字だけ

  it("URL 形式（?code=）からも取り出せる", () => {
    expect(
      extractLinkCode(
        `https://app.example.jp/settings/kiosk-devices/displays?code=${CODE}`,
      ),
    ).toBe(CODE);
  });

  it("URL のダッシュ区切りコードも正規化する", () => {
    expect(
      extractLinkCode(
        "https://app.example.jp/settings/kiosk-devices/displays?code=ABCD-EFGH-JKLM",
      ),
    ).toBe(CODE);
  });

  it("素のコード（手入力）を受け付ける", () => {
    expect(extractLinkCode(CODE)).toBe(CODE);
    expect(extractLinkCode("abcd-efgh-jklm")).toBe(CODE);
    expect(extractLinkCode("  ABCD EFGH JKLM  ")).toBe(CODE);
  });

  it("桁数が違えば空（部分入力を通さない）", () => {
    expect(extractLinkCode("ABCD-EFGH")).toBe("");
    expect(extractLinkCode(`${CODE}X`)).toBe("");
  });

  it("code の無い URL は空", () => {
    expect(extractLinkCode("https://app.example.jp/settings/displays")).toBe(
      "",
    );
  });

  it("空・空白・null 相当は空", () => {
    expect(extractLinkCode("")).toBe("");
    expect(extractLinkCode("   ")).toBe("");
    expect(extractLinkCode(undefined as unknown as string)).toBe("");
  });

  it("紛らわしい文字（I/O/0/1）はここでは落とさず、照合で外す", () => {
    // 生成側のアルファベットに 0 は無いので、この値に一致する行は存在しない。
    // ここで弾かずに通すのは、「読み取れません」ではなく「そのコードは
    // 見つかりません」と言えるようにするため（打ち間違いの手掛かりになる）。
    const misread = extractLinkCode("ABCD-EFGH-JKL0");
    expect(misread).toBe("ABCDEFGHJKL0");
    expect(misread).toHaveLength(LINK_CODE_LENGTH);
  });
});

describe("normalizeScalePercent", () => {
  it("そのまま置ける値は変えない", () => {
    expect(normalizeScalePercent(100)).toBe(100);
    expect(normalizeScalePercent(125)).toBe(125);
  });

  it("5 刻みに丸める（1% ずつは目で分からない）", () => {
    expect(normalizeScalePercent(103)).toBe(105);
    expect(normalizeScalePercent(102)).toBe(100);
    expect(normalizeScalePercent(97)).toBe(95);
  });

  it("範囲外は端に寄せる（DB の CHECK と同じ範囲）", () => {
    expect(normalizeScalePercent(10)).toBe(DISPLAY_SCALE_MIN);
    expect(normalizeScalePercent(500)).toBe(DISPLAY_SCALE_MAX);
    expect(normalizeScalePercent(-100)).toBe(DISPLAY_SCALE_MIN);
  });

  it("数値でないものは既定倍率（画面を壊さない）", () => {
    expect(normalizeScalePercent("大きく")).toBe(DISPLAY_SCALE_DEFAULT);
    expect(normalizeScalePercent(null)).toBe(DISPLAY_SCALE_DEFAULT);
    expect(normalizeScalePercent(undefined)).toBe(DISPLAY_SCALE_DEFAULT);
    expect(normalizeScalePercent(Number.NaN)).toBe(DISPLAY_SCALE_DEFAULT);
    expect(normalizeScalePercent(Number.POSITIVE_INFINITY)).toBe(
      DISPLAY_SCALE_DEFAULT,
    );
  });

  it("数字の文字列は受ける（フォームから来る形）", () => {
    expect(normalizeScalePercent("120")).toBe(120);
  });
});

describe("fitRowsToHeight", () => {
  it("入るなら設定どおりの件数", () => {
    // 行 100px + 間隔 10px → 8 行で 870px。900px あるので全部入る
    expect(fitRowsToHeight(900, 100, 10, 8)).toBe(8);
  });

  it("入らない分は減らす（黙って切り落とさない）", () => {
    // 500px なら (500+10)/110 = 4.63 → 4 行
    expect(fitRowsToHeight(500, 100, 10, 8)).toBe(4);
  });

  it("設定より多くは出さない（増やす方向には効かない）", () => {
    expect(fitRowsToHeight(5000, 100, 10, 6)).toBe(6);
  });

  it("最低 1 行は出す（空の画面にしない）", () => {
    expect(fitRowsToHeight(30, 100, 10, 8)).toBe(1);
  });

  it("測れないうちは設定値のまま（ちらつかせない）", () => {
    expect(fitRowsToHeight(0, 100, 10, 8)).toBe(8);
    expect(fitRowsToHeight(900, 0, 10, 8)).toBe(8);
    expect(fitRowsToHeight(Number.NaN, 100, 10, 8)).toBe(8);
  });

  it("間隔が負でも壊れない", () => {
    expect(fitRowsToHeight(900, 100, -5, 8)).toBe(8);
  });

  it("ちょうど収まる境界を切り捨てない", () => {
    // 行 100 + 間隔 10 が 5 行 = 540px（最後の行の下に隙間は要らない）
    expect(fitRowsToHeight(540, 100, 10, 5)).toBe(5);
    expect(fitRowsToHeight(539, 100, 10, 5)).toBe(4);
  });
});
