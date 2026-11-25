/**
 * playwright.scenarios.config.ts — 機能ごとの通し確認（scenarios.spec.ts）の設定。
 *
 * **1 回の起動 = 1 本**（env SCN_ID）。並列にするのは scripts/scenarios.ts の役目で、
 * 1 本ごとに DB の複製とアプリを立ててからこの設定で playwright を起動する。
 * だからここは workers 1・retries 0 でよい（やり直しは DB を作り直してから）。
 *
 * 画面は 1440×900 の等倍。手順ごとの画像を人が見比べるためのものなので、
 * 動画（1280×720）より広く、マニュアル用の撮影（@2x）より軽くしてある。
 */

import { defineConfig } from "@playwright/test";

export const APP_URL = process.env.APP_URL ?? "http://localhost:3140";

export default defineConfig({
  testMatch: "scenarios.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: Number(process.env.SCN_TIMEOUT_MS ?? 420_000),
  globalSetup: "./global-setup.ts",
  outputDir: process.env.SCN_RESULTS_DIR ?? "test-results/scenarios",
  reporter: [["list"]],
  use: {
    baseURL: APP_URL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    video: "off",
    trace: process.env.SCN_TRACE ? "retain-on-failure" : "off",
    screenshot: "off",
  },
});
