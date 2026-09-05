import { describe, expect, it } from "vitest";
import {
  decodeKioskEvent,
  encodeKioskEvent,
  KIOSK_CHANNEL,
} from "./kiosk-events";

describe("kiosk-events（nextjs-web 側 lib/kiosk-events.ts と形を揃える）", () => {
  it("チャネル名は ckk_kiosk", () => {
    expect(KIOSK_CHANNEL).toBe("ckk_kiosk");
  });

  it("encode→decode roundtrip", () => {
    const event = { deviceId: "dev-1", kind: "revoked" as const };
    expect(decodeKioskEvent(encodeKioskEvent(event))).toEqual(event);
  });

  it("nextjs-web が送る素の JSON を読める", () => {
    expect(
      decodeKioskEvent(JSON.stringify({ deviceId: "dev-1", kind: "revoked" })),
    ).toEqual({ deviceId: "dev-1", kind: "revoked" });
  });

  it("壊れた payload は null（例外にしない）", () => {
    expect(decodeKioskEvent("not json")).toBeNull();
    expect(decodeKioskEvent("{}")).toBeNull();
    expect(decodeKioskEvent(JSON.stringify({ deviceId: "" }))).toBeNull();
    expect(
      decodeKioskEvent(JSON.stringify({ deviceId: "dev-1", kind: "other" })),
    ).toBeNull();
    expect(
      decodeKioskEvent(JSON.stringify({ deviceId: 1, kind: "revoked" })),
    ).toBeNull();
  });
});
