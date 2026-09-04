/**
 * login-history-filter-core.test.ts — SY0D の URL クエリ許可リスト。
 *
 * 守るもの: 不正なクエリ値が Prisma の enum 条件へ届かないこと。届くと
 * PrismaClientValidationError で画面ごと 500 になる（実際に起きた壊れ方）。
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOGIN_HISTORY_DAYS,
  parseDeviceOwnership,
  parseLoginHistoryDays,
  parseLoginOutcome,
  parseLoginSurface,
} from "./login-history-filter-core";

describe("parseLoginOutcome", () => {
  it("許可した値はそのまま返す", () => {
    expect(parseLoginOutcome("SUCCESS")).toBe("SUCCESS");
    expect(parseLoginOutcome("FAILURE")).toBe("FAILURE");
  });
  it("外れた値・空・null は null（絞り込みなし）", () => {
    expect(parseLoginOutcome("success")).toBeNull();
    expect(parseLoginOutcome("'; DROP TABLE")).toBeNull();
    expect(parseLoginOutcome("")).toBeNull();
    expect(parseLoginOutcome(null)).toBeNull();
    expect(parseLoginOutcome(undefined)).toBeNull();
  });
});

describe("parseLoginSurface", () => {
  it("WEB / KIOSK / PORTAL の 3 択", () => {
    expect(parseLoginSurface("WEB")).toBe("WEB");
    expect(parseLoginSurface("KIOSK")).toBe("KIOSK");
    expect(parseLoginSurface("PORTAL")).toBe("PORTAL");
  });
  it("面に無い値は null", () => {
    expect(parseLoginSurface("MOBILE")).toBeNull();
    expect(parseLoginSurface("web")).toBeNull();
  });
});

describe("parseDeviceOwnership", () => {
  it("DEVICE_OWNERSHIP の 4 値", () => {
    for (const v of [
      "COMPANY_MANAGED",
      "COMPANY_NETWORK",
      "UNMANAGED",
      "UNKNOWN",
    ]) {
      expect(parseDeviceOwnership(v)).toBe(v);
    }
  });
  it("外れた値は null（以前は as never でそのまま Prisma に渡していた）", () => {
    expect(parseDeviceOwnership("PERSONAL")).toBeNull();
    expect(parseDeviceOwnership("")).toBeNull();
    expect(parseDeviceOwnership(null)).toBeNull();
  });
});

describe("parseLoginHistoryDays", () => {
  it("1〜400 の数はそのまま", () => {
    expect(parseLoginHistoryDays("1")).toBe(1);
    expect(parseLoginHistoryDays("30")).toBe(30);
    expect(parseLoginHistoryDays("400")).toBe(400);
  });
  it("範囲外・非数・未指定は既定 7 日", () => {
    expect(parseLoginHistoryDays(null)).toBe(DEFAULT_LOGIN_HISTORY_DAYS);
    expect(parseLoginHistoryDays("0")).toBe(DEFAULT_LOGIN_HISTORY_DAYS);
    expect(parseLoginHistoryDays("-3")).toBe(DEFAULT_LOGIN_HISTORY_DAYS);
    expect(parseLoginHistoryDays("401")).toBe(DEFAULT_LOGIN_HISTORY_DAYS);
    expect(parseLoginHistoryDays("abc")).toBe(DEFAULT_LOGIN_HISTORY_DAYS);
    expect(parseLoginHistoryDays("Infinity")).toBe(DEFAULT_LOGIN_HISTORY_DAYS);
  });
});
