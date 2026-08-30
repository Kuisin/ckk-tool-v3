import { describe, expect, it } from "vitest";
import {
  effectiveEndsAt,
  type GrantWindow,
  grantState,
  isGrantUsable,
  MAX_WINDOW_DAYS,
  remainingMs,
  validateRequestWindow,
} from "./privileged-access-core";

const NOW = new Date("2026-08-30T12:00:00Z");
const at = (iso: string) => new Date(iso);
const MIN = 60_000;

/** 既定: 承認済み・窓は 12:00〜18:00・1 回 30 分・未使用。 */
function grant(over: Partial<GrantWindow> = {}): GrantWindow {
  return {
    status: "APPROVED",
    windowStartsAt: "2026-08-30T12:00:00Z",
    windowEndsAt: "2026-08-30T18:00:00Z",
    durationMinutes: 30,
    activatedAt: null,
    ...over,
  };
}

describe("effectiveEndsAt — 短いほうが勝つ", () => {
  it("未使用なら窓の終わり（まだ 1 分も減っていない）", () => {
    expect(effectiveEndsAt(grant()).toISOString()).toBe(
      "2026-08-30T18:00:00.000Z",
    );
  });

  it("使用済みで duration が先に尽きるなら 初回使用+duration", () => {
    const g = grant({ activatedAt: "2026-08-30T13:00:00Z" });
    expect(effectiveEndsAt(g).toISOString()).toBe("2026-08-30T13:30:00.000Z");
  });

  it("**窓の終わりが duration を切り詰める** — 30 分承認でも窓が 5 分なら 5 分", () => {
    const g = grant({
      activatedAt: "2026-08-30T17:55:00Z",
      windowEndsAt: "2026-08-30T18:00:00Z",
      durationMinutes: 30,
    });
    expect(effectiveEndsAt(g).toISOString()).toBe("2026-08-30T18:00:00.000Z");
  });

  it("時刻が壊れている行は即座に終わっている扱い（fail-closed）", () => {
    const g = grant({ windowEndsAt: "not-a-date" });
    expect(effectiveEndsAt(g).getTime()).toBe(0);
  });
});

describe("isGrantUsable", () => {
  it("承認済み・窓の中・未使用なら使える", () => {
    expect(isGrantUsable(grant(), at("2026-08-30T15:00:00Z"))).toBe(true);
  });

  it("窓の開始ちょうどは使える（端は含む）", () => {
    expect(isGrantUsable(grant(), at("2026-08-30T12:00:00Z"))).toBe(true);
  });

  it("窓の終わりちょうども使える（端は含む）", () => {
    expect(isGrantUsable(grant(), at("2026-08-30T18:00:00Z"))).toBe(true);
  });

  it("窓の 1 ミリ秒前は使えない", () => {
    expect(isGrantUsable(grant(), at("2026-08-30T11:59:59.999Z"))).toBe(false);
  });

  it("窓の 1 ミリ秒後は使えない", () => {
    expect(isGrantUsable(grant(), at("2026-08-30T18:00:00.001Z"))).toBe(false);
  });

  it("使用開始から duration ちょうどは使える、1 ミリ秒後は使えない", () => {
    const g = grant({ activatedAt: "2026-08-30T13:00:00Z" });
    expect(isGrantUsable(g, at("2026-08-30T13:30:00Z"))).toBe(true);
    expect(isGrantUsable(g, at("2026-08-30T13:30:00.001Z"))).toBe(false);
  });

  it("窓がまだ残っていても duration が尽きていれば使えない", () => {
    const g = grant({ activatedAt: "2026-08-30T12:30:00Z" });
    // 窓は 18:00 まであるが、13:00 で 30 分を使い切っている
    expect(isGrantUsable(g, at("2026-08-30T14:00:00Z"))).toBe(false);
  });

  it("承認前・差し戻し・取り消し・取り下げは使えない", () => {
    for (const status of [
      "PENDING",
      "REJECTED",
      "REVOKED",
      "CANCELLED",
    ] as const) {
      expect(isGrantUsable(grant({ status }), at("2026-08-30T15:00:00Z"))).toBe(
        false,
      );
    }
  });

  it("status=EXPIRED でも時刻で生きていれば使える（打刻は判定の入力ではない）", () => {
    // pg_cron の打刻が先走った/遅れた場合に、判定が時刻だけで決まることの確認
    const g = grant({ status: "EXPIRED" });
    expect(isGrantUsable(g, at("2026-08-30T15:00:00Z"))).toBe(false);
    expect(
      isGrantUsable({ ...g, status: "APPROVED" }, at("2026-08-30T15:00:00Z")),
    ).toBe(true);
  });
});

describe("remainingMs", () => {
  it("未使用なら窓の終わりまで", () => {
    expect(remainingMs(grant(), at("2026-08-30T17:00:00Z"))).toBe(60 * MIN);
  });

  it("使用中は duration の残り", () => {
    const g = grant({ activatedAt: "2026-08-30T13:00:00Z" });
    expect(remainingMs(g, at("2026-08-30T13:10:00Z"))).toBe(20 * MIN);
  });

  it("使えないときは 0", () => {
    expect(remainingMs(grant({ status: "REVOKED" }), NOW)).toBe(0);
  });
});

describe("grantState", () => {
  it("窓の前は SCHEDULED", () => {
    expect(grantState(grant(), at("2026-08-30T11:00:00Z"))).toBe("SCHEDULED");
  });

  it("使えるが未使用なら ARMED", () => {
    expect(grantState(grant(), at("2026-08-30T15:00:00Z"))).toBe("ARMED");
  });

  it("使用中は ACTIVE", () => {
    const g = grant({ activatedAt: "2026-08-30T14:55:00Z" });
    expect(grantState(g, at("2026-08-30T15:00:00Z"))).toBe("ACTIVE");
  });

  it("一度も使わずに窓が終われば EXPIRED", () => {
    expect(grantState(grant(), at("2026-08-30T19:00:00Z"))).toBe("EXPIRED");
  });

  it("決裁の結果はそのまま出す", () => {
    expect(grantState(grant({ status: "PENDING" }), NOW)).toBe("PENDING");
    expect(grantState(grant({ status: "REJECTED" }), NOW)).toBe("REJECTED");
    expect(grantState(grant({ status: "REVOKED" }), NOW)).toBe("REVOKED");
    expect(grantState(grant({ status: "CANCELLED" }), NOW)).toBe("CANCELLED");
  });
});

describe("validateRequestWindow — DB の CHECK と同じ条件", () => {
  const ok = {
    windowStartsAt: "2026-08-30T12:00:00Z",
    windowEndsAt: "2026-09-02T12:00:00Z",
    durationMinutes: 30,
  };

  it("妥当な申請は null", () => {
    expect(validateRequestWindow(ok, NOW)).toBeNull();
  });

  it("終了が開始より前・同時は拒否", () => {
    expect(
      validateRequestWindow({ ...ok, windowEndsAt: ok.windowStartsAt }, NOW),
    ).toMatch(/後にしてください/);
  });

  it("開始を過去にはできない（1 分の緩みは許す）", () => {
    expect(
      validateRequestWindow(
        { ...ok, windowStartsAt: "2026-08-30T11:59:30Z" },
        NOW,
      ),
    ).toBeNull();
    expect(
      validateRequestWindow(
        { ...ok, windowStartsAt: "2026-08-30T11:00:00Z" },
        NOW,
      ),
    ).toMatch(/過去/);
  });

  it("**ちょうど 14 日は通り、14 日と 1 分は落ちる**", () => {
    const exactly = new Date(
      NOW.getTime() + MAX_WINDOW_DAYS * 86_400_000,
    ).toISOString();
    const overBy1Min = new Date(
      NOW.getTime() + MAX_WINDOW_DAYS * 86_400_000 + MIN,
    ).toISOString();
    expect(
      validateRequestWindow({ ...ok, windowEndsAt: exactly }, NOW),
    ).toBeNull();
    expect(
      validateRequestWindow({ ...ok, windowEndsAt: overBy1Min }, NOW),
    ).toMatch(/14 日以内/);
  });

  it("開始を先送りしても総延長は伸びない（上限は申請時点から数える）", () => {
    expect(
      validateRequestWindow(
        {
          windowStartsAt: new Date(
            NOW.getTime() + 10 * 86_400_000,
          ).toISOString(),
          windowEndsAt: new Date(NOW.getTime() + 20 * 86_400_000).toISOString(),
          durationMinutes: 30,
        },
        NOW,
      ),
    ).toMatch(/14 日以内/);
  });

  it("有効時間の範囲外・非整数は拒否", () => {
    expect(validateRequestWindow({ ...ok, durationMinutes: 0 }, NOW)).toMatch(
      /範囲/,
    );
    expect(
      validateRequestWindow({ ...ok, durationMinutes: 1441 }, NOW),
    ).toMatch(/範囲/);
    expect(validateRequestWindow({ ...ok, durationMinutes: 1.5 }, NOW)).toMatch(
      /整数/,
    );
    expect(
      validateRequestWindow({ ...ok, durationMinutes: 1440 }, NOW),
    ).toBeNull();
  });
});
