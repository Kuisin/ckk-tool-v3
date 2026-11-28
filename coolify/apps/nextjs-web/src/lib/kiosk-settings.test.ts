/**
 * kiosk-settings.test.ts — SY0A のアプリ一覧が共有端末アプリのランチャーと
 * 食い違わないこと。
 *
 * 2 つのアプリは別ビルドで import できないので、kiosk 側の app-list.ts を
 * テキストとして読んで `key: "…"` を拾う。一覧に無いアプリは SY0A から
 * 隠せない（指示書一覧 wo-list で実際に起きた）。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("./app-config", () => ({
  readConfigNamespace: vi.fn(),
  writeConfigValues: vi.fn(),
}));

import { kioskAppCatalog } from "./kiosk-settings";

function kioskLauncherKeys(): string[] {
  const src = readFileSync(
    path.resolve(__dirname, "../../../nextjs-kiosk/src/lib/app-list.ts"),
    "utf8",
  );
  const body = src.slice(src.indexOf("export const KIOSK_APPS"));
  return [...body.matchAll(/\bkey:\s*"([^"]+)"/g)].map((m) => m[1] as string);
}

describe("kioskAppCatalog", () => {
  it("共有端末アプリのランチャーと同じアプリを同じ順で持つ", () => {
    const keys = kioskAppCatalog((k) => k).map((a) => a.key);
    expect(keys).toEqual(kioskLauncherKeys());
  });

  it("どのアプリにも表示名の鍵がある", () => {
    for (const app of kioskAppCatalog((k) => k)) {
      expect(app.label).toMatch(/^settings\.kioskSettings\./);
    }
  });
});
