import { describe, expect, it } from "vitest";
import { kioskOriginFrom } from "./kiosk-origin";

describe("kioskOriginFrom", () => {
  it("wss のプレゼンス URL から https の origin を作る", () => {
    expect(
      kioskOriginFrom("wss://ckk-kiosk-dev.kai-lab.net/api/kiosk/ws"),
    ).toBe("https://ckk-kiosk-dev.kai-lab.net");
  });

  it("ws は http に落とす（ローカル開発）", () => {
    expect(kioskOriginFrom("ws://localhost:3001/api/kiosk/ws")).toBe(
      "http://localhost:3001",
    );
  });

  it("ポート付きでもホストごと保つ", () => {
    expect(kioskOriginFrom("wss://example.test:8443/api/kiosk/ws")).toBe(
      "https://example.test:8443",
    );
  });

  it("http(s) がそのまま入っていても受ける", () => {
    expect(kioskOriginFrom("https://kiosk.example/api/kiosk/ws")).toBe(
      "https://kiosk.example",
    );
  });

  // 未設定は「見本が出ないだけ」に倒す — ここで throw すると設定画面ごと落ちる
  it("未設定・壊れた値は null", () => {
    expect(kioskOriginFrom(undefined)).toBeNull();
    expect(kioskOriginFrom("")).toBeNull();
    expect(kioskOriginFrom("not a url")).toBeNull();
    expect(kioskOriginFrom("ftp://example.test/x")).toBeNull();
  });
});
