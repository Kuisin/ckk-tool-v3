import { describe, expect, it } from "vitest";
import { formatCode, generateCode, normalizeCode } from "./crockford";
import {
  extractCardId,
  IDLE_TIMEOUT_MS,
  idleRemainingMs,
  isCardWithinValidPeriod,
  isPinLocked,
  isSessionAlive,
  isValidPin,
  needsPinVerify,
  newPinVerdict,
  nextPinFailureState,
  PIN_LOCK_MS,
  PIN_MAX_ATTEMPTS,
  PIN_REVERIFY_DEVICE_IDLE_MS,
  PIN_REVERIFY_MAX_MS,
  PIN_TICKET_MAX_PER_WINDOW,
  PIN_TICKET_WINDOW_MS,
  pinFailureStateAfter,
  pinVerifyReason,
  withinPinTicketLimit,
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

describe("pinVerifyReason（説明文の出し分け）", () => {
  it("初めての端末・48h 未使用は DEVICE_IDLE", () => {
    expect(pinVerifyReason(T0, null, T0)).toBe("DEVICE_IDLE");
    expect(pinVerifyReason(at(PIN_REVERIFY_DEVICE_IDLE_MS), T0, T0)).toBe(
      "DEVICE_IDLE",
    );
  });
  it("端末は使っているが 2 週間たったら PERIODIC", () => {
    const now = at(PIN_REVERIFY_MAX_MS);
    expect(pinVerifyReason(now, at(PIN_REVERIFY_MAX_MS - 60_000), T0)).toBe(
      "PERIODIC",
    );
  });
  it("両方成り立つときは DEVICE_IDLE、どちらも無ければ null", () => {
    expect(pinVerifyReason(at(PIN_REVERIFY_MAX_MS), T0, T0)).toBe(
      "DEVICE_IDLE",
    );
    expect(pinVerifyReason(at(60_000), T0, T0)).toBeNull();
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

describe("pinFailureStateAfter (加算後カウントからロック判定)", () => {
  it("上限未満はそのカウントを保ちロックしない", () => {
    expect(pinFailureStateAfter(T0, 1)).toEqual({
      failedAttempts: 1,
      lockedUntil: null,
    });
    expect(pinFailureStateAfter(T0, PIN_MAX_ATTEMPTS - 1)).toEqual({
      failedAttempts: PIN_MAX_ATTEMPTS - 1,
      lockedUntil: null,
    });
  });
  it("上限到達でロック・カウントは 0 に戻す", () => {
    const s = pinFailureStateAfter(T0, PIN_MAX_ATTEMPTS);
    expect(s.failedAttempts).toBe(0);
    expect(s.lockedUntil?.getTime()).toBe(T0.getTime() + PIN_LOCK_MS);
  });
  it("上限超過（同時撃ちで複数が到達値を読んでも）同じくロック", () => {
    const s = pinFailureStateAfter(T0, PIN_MAX_ATTEMPTS + 3);
    expect(s.failedAttempts).toBe(0);
    expect(s.lockedUntil?.getTime()).toBe(T0.getTime() + PIN_LOCK_MS);
  });
  it("nextPinFailureState（加算前）と 1 ずれて一致する", () => {
    expect(nextPinFailureState(T0, PIN_MAX_ATTEMPTS - 1)).toEqual(
      pinFailureStateAfter(T0, PIN_MAX_ATTEMPTS),
    );
    expect(nextPinFailureState(T0, 0)).toEqual(pinFailureStateAfter(T0, 1));
  });
});

describe("withinPinTicketLimit (PIN_VERIFY チケット発行レート)", () => {
  it("窓内の発行が上限未満なら true", () => {
    const recent = Array.from({ length: PIN_TICKET_MAX_PER_WINDOW - 1 }, () =>
      T0.getTime(),
    );
    expect(withinPinTicketLimit(T0, recent)).toBe(true);
  });
  it("窓内の発行が上限に達したら false", () => {
    const recent = Array.from({ length: PIN_TICKET_MAX_PER_WINDOW }, () =>
      T0.getTime(),
    );
    expect(withinPinTicketLimit(T0, recent)).toBe(false);
  });
  it("窓の外（それ以前）の発行は数えない", () => {
    // すべて 1 窓より前 → 0 件扱い
    const old = Array.from({ length: PIN_TICKET_MAX_PER_WINDOW + 5 }, () =>
      T0.getTime(),
    );
    const now = at(PIN_TICKET_WINDOW_MS + 1);
    expect(withinPinTicketLimit(now, old)).toBe(true);
  });
  it("窓の境界ちょうどは窓外（> 判定）", () => {
    // cutoff = now - WINDOW。発行時刻 == cutoff は含めない
    const now = at(PIN_TICKET_WINDOW_MS);
    const atCutoff = Array.from({ length: PIN_TICKET_MAX_PER_WINDOW }, () =>
      T0.getTime(),
    );
    expect(withinPinTicketLimit(now, atCutoff)).toBe(true);
  });
  it("空配列は常に true", () => {
    expect(withinPinTicketLimit(T0, [])).toBe(true);
  });
});

describe("isCardWithinValidPeriod (テンポラリカード有効期間)", () => {
  const from = at(0);
  const until = at(24 * 60 * 60 * 1000);
  it("無期限（両方 null）は常に有効", () => {
    expect(isCardWithinValidPeriod(at(1), null, null)).toBe(true);
  });
  it("期間内は有効（境界ちょうども有効）", () => {
    expect(isCardWithinValidPeriod(at(1000), from, until)).toBe(true);
    expect(isCardWithinValidPeriod(from, from, until)).toBe(true);
    expect(isCardWithinValidPeriod(until, from, until)).toBe(true);
  });
  it("開始前は無効", () => {
    expect(isCardWithinValidPeriod(at(-1), from, until)).toBe(false);
    expect(isCardWithinValidPeriod(at(-1), from, null)).toBe(false);
  });
  it("終了後は無効", () => {
    expect(
      isCardWithinValidPeriod(at(24 * 60 * 60 * 1000 + 1), from, until),
    ).toBe(false);
    expect(
      isCardWithinValidPeriod(at(24 * 60 * 60 * 1000 + 1), null, until),
    ).toBe(false);
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

describe("extractCardId — QR ペイロードからカード ID", () => {
  it("統一形式 CKK:CARD:… を読む（ダッシュは正規化で落ちる）", () => {
    expect(extractCardId("CKK:CARD:ABCD-EFGH-JKLM-NPQR")).toBe(
      "ABCDEFGHJKLMNPQR",
    );
  });

  it("配布済みの素のカード ID も従来どおり読む（後方互換）", () => {
    expect(extractCardId("ABCD-EFGH-JKLM-NPQR")).toBe("ABCDEFGHJKLMNPQR");
    expect(extractCardId("abcdefghjklmnpqr")).toBe("ABCDEFGHJKLMNPQR");
  });

  it("カード以外の統一 QR（指示書ストリップ等）は空 = ログインに使えない", () => {
    expect(extractCardId("CKK:WO:1234")).toBe("");
    expect(extractCardId("CKK:INV:INV-202608-00001")).toBe("");
  });

  it("URL 形式（旧実装の名残）も読む", () => {
    expect(extractCardId("https://example.test/login?secret=ABCD-EFGH")).toBe(
      "ABCDEFGH",
    );
    expect(extractCardId("https://example.test/c/ABCDEFGH")).toBe("ABCDEFGH");
  });

  it("空・空白は空文字", () => {
    expect(extractCardId("   ")).toBe("");
  });
});

describe("newPinVerdict — 初回設定の PIN 規則", () => {
  it("6 桁で並びの無いものは OK", () => {
    expect(newPinVerdict("284917")).toBe("OK");
    expect(newPinVerdict("907135")).toBe("OK");
  });

  it("桁数が 6 でなければ LENGTH（既存の 4〜5 桁は照合側でだけ通る）", () => {
    expect(newPinVerdict("1234")).toBe("LENGTH");
    expect(newPinVerdict("12345")).toBe("LENGTH");
    expect(newPinVerdict("1234567")).toBe("LENGTH");
    expect(newPinVerdict("12a456")).toBe("LENGTH");
  });

  it("同じ数字の連続・昇順/降順の並び・繰り返しは WEAK", () => {
    expect(newPinVerdict("000000")).toBe("WEAK");
    expect(newPinVerdict("123456")).toBe("WEAK");
    expect(newPinVerdict("654321")).toBe("WEAK");
    expect(newPinVerdict("890123")).toBe("WEAK"); // 9→0 をまたぐ昇順
    expect(newPinVerdict("121212")).toBe("WEAK");
    expect(newPinVerdict("123123")).toBe("WEAK");
  });
});
