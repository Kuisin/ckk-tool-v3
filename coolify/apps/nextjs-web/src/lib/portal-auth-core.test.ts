import { describe, expect, it } from "vitest";
import {
  isPortalChallengeUsable,
  isPortalLinkExpiryAllowed,
  isPortalSessionAlive,
  PORTAL_IDLE_TIMEOUT_MS,
  PORTAL_LINK_MAX_TTL_MS,
  PORTAL_OTP_MAX_ATTEMPTS,
  PORTAL_SESSION_TTL_MS,
  portalIdleRemainingMs,
  portalLinkDenyReason,
} from "./portal-auth-core";

const NOW = new Date("2026-09-01T00:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);

describe("isPortalSessionAlive", () => {
  const fresh = {
    expiresAt: at(PORTAL_SESSION_TTL_MS),
    lastActivityAt: NOW,
  };

  it("期限内・活動直後なら有効", () => {
    expect(
      isPortalSessionAlive(NOW, fresh.expiresAt, fresh.lastActivityAt, null),
    ).toBe(true);
  });

  it("失効印があれば無効（期限が残っていても）", () => {
    expect(
      isPortalSessionAlive(NOW, fresh.expiresAt, fresh.lastActivityAt, NOW),
    ).toBe(false);
  });

  it("ハード期限を過ぎたら無効", () => {
    const now = at(PORTAL_SESSION_TTL_MS);
    expect(isPortalSessionAlive(now, fresh.expiresAt, now, null)).toBe(false);
  });

  it("アイドル窓を過ぎたら無効（ハード期限が残っていても）", () => {
    const now = at(PORTAL_IDLE_TIMEOUT_MS);
    expect(
      isPortalSessionAlive(now, at(PORTAL_SESSION_TTL_MS), NOW, null),
    ).toBe(false);
  });

  it("アイドル窓ぎりぎり手前は有効", () => {
    const now = at(PORTAL_IDLE_TIMEOUT_MS - 1);
    expect(
      isPortalSessionAlive(now, at(PORTAL_SESSION_TTL_MS), NOW, null),
    ).toBe(true);
  });
});

describe("portalIdleRemainingMs", () => {
  it("負にならない", () => {
    expect(portalIdleRemainingMs(at(PORTAL_IDLE_TIMEOUT_MS * 2), NOW)).toBe(0);
  });
  it("経過ぶん減る", () => {
    expect(portalIdleRemainingMs(at(1000), NOW)).toBe(
      PORTAL_IDLE_TIMEOUT_MS - 1000,
    );
  });
});

describe("isPortalChallengeUsable", () => {
  const base = { expiresAt: at(10 * 60_000), consumedAt: null, attempts: 0 };

  it("新しいチャレンジは使える", () => {
    expect(isPortalChallengeUsable(NOW, base)).toBe(true);
  });

  it("使用済みは使えない", () => {
    expect(isPortalChallengeUsable(NOW, { ...base, consumedAt: NOW })).toBe(
      false,
    );
  });

  it("期限切れは使えない", () => {
    expect(isPortalChallengeUsable(at(10 * 60_000), base)).toBe(false);
  });

  it("試行上限に達したら使えない", () => {
    expect(
      isPortalChallengeUsable(NOW, {
        ...base,
        attempts: PORTAL_OTP_MAX_ATTEMPTS,
      }),
    ).toBe(false);
  });
});

describe("portalLinkDenyReason", () => {
  const live = {
    expiresAt: at(60_000),
    revokedAt: null,
    maxUses: null,
    useCount: 0,
  };

  it("有効なら null", () => {
    expect(portalLinkDenyReason(NOW, live)).toBeNull();
  });

  it("失効が最優先（期限も回数も残っていても）", () => {
    expect(portalLinkDenyReason(NOW, { ...live, revokedAt: NOW })).toBe(
      "REVOKED",
    );
  });

  it("期限切れ", () => {
    expect(portalLinkDenyReason(at(60_000), live)).toBe("EXPIRED");
  });

  it("使用回数を使い切った", () => {
    expect(
      portalLinkDenyReason(NOW, { ...live, maxUses: 1, useCount: 1 }),
    ).toBe("EXHAUSTED");
  });

  it("maxUses が null なら回数では切れない", () => {
    expect(
      portalLinkDenyReason(NOW, { ...live, maxUses: null, useCount: 9999 }),
    ).toBeNull();
  });
});

describe("isPortalLinkExpiryAllowed", () => {
  it("過去は不可", () => {
    expect(isPortalLinkExpiryAllowed(NOW, at(-1))).toBe(false);
  });
  it("現在ちょうども不可（0 秒のリンクを作らない）", () => {
    expect(isPortalLinkExpiryAllowed(NOW, NOW)).toBe(false);
  });
  it("上限ちょうどは可", () => {
    expect(isPortalLinkExpiryAllowed(NOW, at(PORTAL_LINK_MAX_TTL_MS))).toBe(
      true,
    );
  });
  it("上限超えは不可", () => {
    expect(isPortalLinkExpiryAllowed(NOW, at(PORTAL_LINK_MAX_TTL_MS + 1))).toBe(
      false,
    );
  });
});
