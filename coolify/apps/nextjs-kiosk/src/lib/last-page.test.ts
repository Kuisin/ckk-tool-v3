import { describe, expect, it } from "vitest";
import { isTrackablePath } from "./last-page";

describe("isTrackablePath", () => {
  it("業務ページは追跡対象", () => {
    expect(isTrackablePath("/")).toBe(true);
    expect(isTrackablePath("/steps")).toBe(true);
    expect(isTrackablePath("/steps/abc-123")).toBe(true);
  });

  it("ログイン/セットアップ/端末系画面は対象外", () => {
    expect(isTrackablePath("/login")).toBe(false);
    expect(isTrackablePath("/setup")).toBe(false);
    expect(isTrackablePath("/device-error")).toBe(false);
    expect(isTrackablePath("/device-settings")).toBe(false);
    expect(isTrackablePath("/device-settings/reset")).toBe(false);
  });

  it("外部/不正な値は対象外（復元時の安全弁）", () => {
    expect(isTrackablePath("https://evil.example")).toBe(false);
    expect(isTrackablePath("//evil.example")).toBe(false);
    expect(isTrackablePath("")).toBe(false);
  });

  it("除外パスと同じ接頭辞を持つ別ページは対象", () => {
    expect(isTrackablePath("/login-history")).toBe(true);
  });
});
