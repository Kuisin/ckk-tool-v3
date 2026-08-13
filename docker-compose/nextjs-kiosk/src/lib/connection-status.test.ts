import { describe, expect, it } from "vitest";
import { resolveIndicator } from "./connection-status";

const base = {
  online: true,
  serverReachable: true,
  registered: true,
  hasBridge: true,
  unstable: false,
};

describe("resolveIndicator", () => {
  it("gray when the server is unreachable (LAN URL probe failed)", () => {
    expect(resolveIndicator({ ...base, serverReachable: false })).toMatchObject(
      { level: "gray", blinking: false },
    );
  });

  it("gray when the OS reports offline, regardless of other flags", () => {
    expect(
      resolveIndicator({ ...base, online: false, registered: false }),
    ).toMatchObject({ level: "gray" });
  });

  it("red when reachable but the device is not linked", () => {
    expect(resolveIndicator({ ...base, registered: false })).toMatchObject({
      level: "red",
      blinking: false,
    });
  });

  it("green in the dedicated app (hardware bridge present)", () => {
    expect(resolveIndicator(base)).toMatchObject({
      level: "green",
      blinking: false,
    });
  });

  it("orange when linked but running in a plain browser", () => {
    expect(resolveIndicator({ ...base, hasBridge: false })).toMatchObject({
      level: "orange",
      blinking: false,
    });
  });

  it("blinks (green/orange) when the connection is unstable", () => {
    expect(resolveIndicator({ ...base, unstable: true })).toMatchObject({
      level: "green",
      blinking: true,
    });
    expect(
      resolveIndicator({ ...base, hasBridge: false, unstable: true }),
    ).toMatchObject({ level: "orange", blinking: true });
  });

  it("does not blink while gray/red (unstable only applies when connected)", () => {
    expect(
      resolveIndicator({ ...base, serverReachable: false, unstable: true }),
    ).toMatchObject({ level: "gray", blinking: false });
    expect(
      resolveIndicator({ ...base, registered: false, unstable: true }),
    ).toMatchObject({ level: "red", blinking: false });
  });
});
