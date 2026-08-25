/**
 * device-ownership-core.test.ts — 所有区分の自動判定。
 *
 * ここが守るもの:
 *  - 根拠の強さ（PROVEN / CIRCUMSTANTIAL / NONE）が判定と必ず一緒に出ること。
 *    「社内 NW にいる」を「社給端末である」と言い切らないための仕組み。
 *  - 強い証拠が弱い証拠より先に効くこと（規則の順序）。
 *  - CIDR 未設定・IP 不明で **UNMANAGED ではなく UNKNOWN** に倒れること。
 *    設定漏れで全社員が「私用端末」と表示されるのを防ぐ。
 *  - source が列長（40）に収まること。
 */

import { describe, expect, it } from "vitest";
import {
  classifyDeviceOwnership,
  type VerifiedWrapperProfile,
  wrapperRiskFlags,
} from "./device-ownership-core";

const wrapper = (
  over: Partial<VerifiedWrapperProfile> = {},
): VerifiedWrapperProfile => ({
  signatureVerified: true,
  isDeviceOwner: false,
  isProfileOwner: false,
  isManagedProfile: false,
  enrollmentId: null,
  buildTags: "release-keys",
  adbEnabled: false,
  isEmulator: false,
  ...over,
});

const CIDRS = ["192.168.50.0/24", "10.0.0.0/8"];

describe("classifyDeviceOwnership", () => {
  it("device owner のラッパー署名は PROVEN の社用端末", () => {
    const v = classifyDeviceOwnership({
      wrapper: wrapper({ isDeviceOwner: true }),
      kioskDeviceLinked: true,
      attested: true,
      ip: "203.0.113.9",
      corporateCidrs: CIDRS,
    });
    expect(v).toEqual({
      ownership: "COMPANY_MANAGED",
      source: "wrapper:device-owner",
      confidence: "PROVEN",
    });
  });

  it("管理プロファイル（profile owner / managed profile）も PROVEN", () => {
    expect(
      classifyDeviceOwnership({
        wrapper: wrapper({ isProfileOwner: true }),
        kioskDeviceLinked: false,
      }).source,
    ).toBe("wrapper:managed");
    expect(
      classifyDeviceOwnership({
        wrapper: wrapper({ isManagedProfile: true }),
        kioskDeviceLinked: false,
      }).confidence,
    ).toBe("PROVEN");
  });

  it("管理下でなくても、登録済み端末の鍵署名なら PROVEN", () => {
    const v = classifyDeviceOwnership({
      wrapper: wrapper(),
      kioskDeviceLinked: true,
    });
    expect(v.source).toBe("wrapper:enrolled");
    expect(v.confidence).toBe("PROVEN");
  });

  it("旧 APK（プロファイル無し）でも鍵署名を通っていれば PROVEN", () => {
    const v = classifyDeviceOwnership({
      wrapper: null,
      kioskDeviceLinked: true,
      attested: true,
    });
    expect(v).toEqual({
      ownership: "COMPANY_MANAGED",
      source: "kiosk:attested",
      confidence: "PROVEN",
    });
  });

  it("デバイストークンだけは CIRCUMSTANTIAL（盗難端末でも成立するため）", () => {
    const v = classifyDeviceOwnership({
      wrapper: null,
      kioskDeviceLinked: true,
      attested: false,
    });
    expect(v.ownership).toBe("COMPANY_MANAGED");
    expect(v.confidence).toBe("CIRCUMSTANTIAL");
  });

  it("社内 CIDR は COMPANY_NETWORK かつ CIRCUMSTANTIAL どまり", () => {
    const v = classifyDeviceOwnership({
      ip: "192.168.50.7",
      corporateCidrs: CIDRS,
    });
    expect(v.ownership).toBe("COMPANY_NETWORK");
    expect(v.confidence).toBe("CIRCUMSTANTIAL");
    // 「社内 NW にいる」を「社給端末である」と言い切らない
    expect(v.ownership).not.toBe("COMPANY_MANAGED");
  });

  it("IPv4-mapped IPv6 でも社内判定される", () => {
    expect(
      classifyDeviceOwnership({
        ip: "::ffff:192.168.50.7",
        corporateCidrs: CIDRS,
      }).ownership,
    ).toBe("COMPANY_NETWORK");
  });

  it("社外 IP は UNMANAGED、ただし確度は NONE", () => {
    const v = classifyDeviceOwnership({
      ip: "203.0.113.9",
      corporateCidrs: CIDRS,
    });
    expect(v).toEqual({
      ownership: "UNMANAGED",
      source: "cidr:outside",
      confidence: "NONE",
    });
  });

  it("CIDR 未設定・IP 不明は UNKNOWN（設定漏れで私用扱いしない）", () => {
    expect(
      classifyDeviceOwnership({ ip: "203.0.113.9", corporateCidrs: [] })
        .ownership,
    ).toBe("UNKNOWN");
    expect(
      classifyDeviceOwnership({ ip: null, corporateCidrs: CIDRS }).ownership,
    ).toBe("UNKNOWN");
    expect(classifyDeviceOwnership({}).ownership).toBe("UNKNOWN");
    expect(classifyDeviceOwnership(null).ownership).toBe("UNKNOWN");
    expect(classifyDeviceOwnership(undefined).source).toBe("no-evidence");
  });

  it("強い証拠が弱い証拠より先に効く", () => {
    // 社外 IP でも、鍵署名があれば社用と判定される
    const v = classifyDeviceOwnership({
      wrapper: wrapper({ isDeviceOwner: true }),
      ip: "203.0.113.9",
      corporateCidrs: CIDRS,
    });
    expect(v.ownership).toBe("COMPANY_MANAGED");
  });

  it("source は列長 40 に収まる", () => {
    const sources = [
      classifyDeviceOwnership({ wrapper: wrapper({ isDeviceOwner: true }) }),
      classifyDeviceOwnership({ wrapper: wrapper({ isProfileOwner: true }) }),
      classifyDeviceOwnership({ wrapper: wrapper(), kioskDeviceLinked: true }),
      classifyDeviceOwnership({ kioskDeviceLinked: true, attested: true }),
      classifyDeviceOwnership({ kioskDeviceLinked: true }),
      classifyDeviceOwnership({ ip: "10.0.0.1", corporateCidrs: CIDRS }),
      classifyDeviceOwnership({ ip: "203.0.113.9", corporateCidrs: CIDRS }),
      classifyDeviceOwnership({}),
    ].map((v) => v.source);
    for (const source of sources) {
      expect(source.length).toBeLessThanOrEqual(40);
      expect(source.length).toBeGreaterThan(0);
    }
  });
});

describe("wrapperRiskFlags", () => {
  it("危険サインを列挙する", () => {
    expect(
      wrapperRiskFlags(
        wrapper({ isDeviceOwner: true, buildTags: "test-keys" }),
      ),
    ).toEqual(["TEST_KEYS"]);
    expect(wrapperRiskFlags(wrapper({ adbEnabled: true }))).toEqual([
      "ADB_ENABLED",
      "NOT_MANAGED",
    ]);
    expect(
      wrapperRiskFlags(wrapper({ isEmulator: true, isDeviceOwner: true })),
    ).toEqual(["EMULATOR"]);
    expect(wrapperRiskFlags(wrapper({ isDeviceOwner: true }))).toEqual([]);
    expect(wrapperRiskFlags(null)).toEqual([]);
  });
});
