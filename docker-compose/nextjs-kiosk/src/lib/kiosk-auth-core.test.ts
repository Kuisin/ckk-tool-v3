import { describe, expect, it } from "vitest";
import { formatCode, generateCode, normalizeCode } from "./crockford";
import {
  IDLE_TIMEOUT_MS,
  idleRemainingMs,
  isPinLocked,
  isSessionAlive,
  isValidPin,
  needsPinVerify,
  nextPinFailureState,
  PIN_LOCK_MS,
  PIN_MAX_ATTEMPTS,
  PIN_REVERIFY_DEVICE_IDLE_MS,
  PIN_REVERIFY_MAX_MS,
} from "./kiosk-auth-core";

const T0 = new Date("2026-08-11T00:00:00Z");
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

describe("isSessionAlive", () => {
  const expires = at(8 * 60 * 60 * 1000);
  it("有効: 期限内・アイドル内・未失効", () => {
    expect(isSessionAlive(at(1000), expires, T0, null)).toBe(true);
  });
  it("失効済み revokedAt", () => {
    expect(isSessionAlive(at(1000), expires, T0, T0)).toBe(false);
  });
  it("ハード期限ちょうどで無効", () => {
    expect(isSessionAlive(expires, expires, expires, null)).toBe(false);
  });
  it("アイドル 5分ちょうどで無効・直前は有効", () => {
    expect(isSessionAlive(at(IDLE_TIMEOUT_MS), expires, T0, null)).toBe(false);
    expect(isSessionAlive(at(IDLE_TIMEOUT_MS - 1), expires, T0, null)).toBe(
      true,
    );
  });
});

describe("idleRemainingMs", () => {
  it("経過に応じて減り、負にならない", () => {
    expect(idleRemainingMs(T0, T0)).toBe(IDLE_TIMEOUT_MS);
    expect(idleRemainingMs(at(60_000), T0)).toBe(IDLE_TIMEOUT_MS - 60_000);
    expect(idleRemainingMs(at(IDLE_TIMEOUT_MS * 2), T0)).toBe(0);
  });
});

describe("needsPinVerify (端末別 48h + 2 週間キャップ)", () => {
  it("この端末で未使用（初めての端末）は要 PIN", () => {
    expect(needsPinVerify(T0, null, T0)).toBe(true);
  });
  it("端末使用 48h 以内 + PIN 検証 2 週間以内はスキャンのみ", () => {
    expect(needsPinVerify(at(PIN_REVERIFY_DEVICE_IDLE_MS - 1), T0, T0)).toBe(
      false,
    );
  });
  it("この端末でちょうど 48h 未使用で要 PIN", () => {
    expect(needsPinVerify(at(PIN_REVERIFY_DEVICE_IDLE_MS), T0, T0)).toBe(true);
  });
  it("活動が続いていても PIN 検証から 2 週間で要 PIN", () => {
    const now = at(PIN_REVERIFY_MAX_MS);
    const recentUse = at(PIN_REVERIFY_MAX_MS - 60_000); // 1 分前に使用
    expect(needsPinVerify(now, recentUse, T0)).toBe(true);
  });
  it("PIN 検証記録なしは要 PIN", () => {
    expect(needsPinVerify(at(60_000), T0, null)).toBe(true);
  });
});

describe("PIN ロック", () => {
  it("上限未満はカウントのみ", () => {
    const s = nextPinFailureState(T0, 0);
    expect(s).toEqual({ failedAttempts: 1, lockedUntil: null });
  });
  it("5回目でロック 15分", () => {
    const s = nextPinFailureState(T0, PIN_MAX_ATTEMPTS - 1);
    expect(s.lockedUntil?.getTime()).toBe(T0.getTime() + PIN_LOCK_MS);
    expect(s.failedAttempts).toBe(0);
  });
  it("isPinLocked はロック期限で切れる", () => {
    const until = at(PIN_LOCK_MS);
    expect(isPinLocked(at(PIN_LOCK_MS - 1), until)).toBe(true);
    expect(isPinLocked(until, until)).toBe(false);
    expect(isPinLocked(T0, null)).toBe(false);
  });
});

describe("isValidPin", () => {
  it("4〜6 桁の数字のみ", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
  });
});

describe("crockford codes", () => {
  it("生成コードはアルファベット内・指定長", () => {
    for (const len of [12, 16]) {
      const code = generateCode(len);
      expect(code).toHaveLength(len);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
    }
  });
  it("normalize は大文字化とダッシュ・空白除去", () => {
    expect(normalizeCode("abcd-efgh jklm")).toBe("ABCDEFGHJKLM");
  });
  it("format は 4 文字区切り", () => {
    expect(formatCode("ABCDEFGHJKLM")).toBe("ABCD-EFGH-JKLM");
    expect(formatCode("ABCDEFGHJKLMNPQR")).toBe("ABCD-EFGH-JKLM-NPQR");
  });
});
