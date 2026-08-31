import { describe, expect, it } from "vitest";
import {
  isPortalLocked,
  nextPortalLimitState,
  PORTAL_LIMIT_BUCKETS,
  PORTAL_LIMITS,
  portalLockRemainingMs,
} from "./portal-rate-limit-core";

const NOW = new Date("2026-09-01T00:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);

describe("PORTAL_LIMITS", () => {
  it("全バケットに設定がある", () => {
    for (const b of PORTAL_LIMIT_BUCKETS) {
      expect(PORTAL_LIMITS[b], b).toBeDefined();
      expect(PORTAL_LIMITS[b].max).toBeGreaterThan(0);
      expect(PORTAL_LIMITS[b].windowMs).toBeGreaterThan(0);
      expect(PORTAL_LIMITS[b].lockMs).toBeGreaterThan(0);
    }
  });

  it("発行はアドレス単位のほうが IP 単位より厳しい", () => {
    // 1 人が繰り返し要求するのを止めるのが主目的で、共有回線を巻き込まない。
    expect(PORTAL_LIMITS.OTP_ISSUE_EMAIL.max).toBeLessThan(
      PORTAL_LIMITS.OTP_ISSUE_IP.max,
    );
  });
});

describe("isPortalLocked", () => {
  it("null はロックされていない", () => {
    expect(isPortalLocked(NOW, null)).toBe(false);
  });
  it("未来ならロック中", () => {
    expect(isPortalLocked(NOW, at(1))).toBe(true);
  });
  it("ちょうど満了は解除（境界は開ける側）", () => {
    expect(isPortalLocked(NOW, NOW)).toBe(false);
  });
});

describe("nextPortalLimitState", () => {
  const cfg = { max: 3, windowMs: 60_000, lockMs: 900_000 };

  it("初回の失敗は 1 から数え始める", () => {
    const s = nextPortalLimitState(NOW, cfg, null);
    expect(s.failures).toBe(1);
    expect(s.lockedUntil).toBeNull();
    expect(s.windowStartedAt).toEqual(NOW);
  });

  it("窓の中では積み上がる", () => {
    let s = nextPortalLimitState(NOW, cfg, null);
    s = nextPortalLimitState(at(1000), cfg, s);
    expect(s.failures).toBe(2);
    expect(s.lockedUntil).toBeNull();
    // 窓の開始は最初の失敗のまま（ずらすと窓が伸び続ける）
    expect(s.windowStartedAt).toEqual(NOW);
  });

  it("上限に達したらロックし、カウンタを 0 に戻す", () => {
    let s = nextPortalLimitState(NOW, cfg, null);
    s = nextPortalLimitState(at(1000), cfg, s);
    s = nextPortalLimitState(at(2000), cfg, s);
    expect(s.lockedUntil).toEqual(new Date(at(2000).getTime() + cfg.lockMs));
    expect(s.failures).toBe(0);
  });

  it("窓を過ぎたら数え直す", () => {
    let s = nextPortalLimitState(NOW, cfg, null);
    s = nextPortalLimitState(at(1000), cfg, s);
    expect(s.failures).toBe(2);
    // 窓の外
    s = nextPortalLimitState(at(cfg.windowMs + 1), cfg, s);
    expect(s.failures).toBe(1);
    expect(s.lockedUntil).toBeNull();
  });

  it("窓ちょうどは窓の外（境界）", () => {
    const s1 = nextPortalLimitState(NOW, cfg, null);
    const s2 = nextPortalLimitState(at(cfg.windowMs), cfg, s1);
    expect(s2.failures).toBe(1);
  });
});

describe("portalLockRemainingMs", () => {
  it("null は 0", () => {
    expect(portalLockRemainingMs(NOW, null)).toBe(0);
  });
  it("過去は 0（負にしない）", () => {
    expect(portalLockRemainingMs(NOW, at(-5000))).toBe(0);
  });
  it("残りを返す", () => {
    expect(portalLockRemainingMs(NOW, at(5000))).toBe(5000);
  });
});
