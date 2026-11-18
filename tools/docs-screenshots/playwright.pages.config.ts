/**
 * playwright.pages.config.ts — 全画面の読み込み確認（page-load.spec.ts）の設定。
 *
 * 撮影（playwright.config.ts）とは別の設定にしてある: 撮影は決定性のため
 * workers 1・1440×900・demo_shot だが、こちらは読むだけなので並列にでき、
 * /settings/* も開くので管理者（demo1 = .auth/admin.json）で回る。
 * global-setup.ts は共通（両方の storageState を作る）。
 */

import { defineConfig } from "@playwright/test";

export const APP_URL = process.env.APP_URL ?? "http://localhost:3100";

export default defineConfig({
  testMatch: "page-load.spec.ts",
  workers: Number(process.env.PAGES_WORKERS ?? 3),
  retries: 0,
  timeout: 120_000,
  globalSetup: "./global-setup.ts",
  reporter: [["list"], ["json", { outputFile: process.env.PAGES_REPORT ?? "/tmp/page-load-report.json" }]],
  use: {
    baseURL: APP_URL,
    viewport: { width: 1280, height: 800 },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    storageState: ".auth/admin.json",
  },
});
