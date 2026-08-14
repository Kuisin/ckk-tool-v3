/**
 * playwright.config.ts — スクリーンショット撮影の共通設定。
 *
 * 決定性最優先: Chromium のみ / workers 1 / retries 0 / ロケール・TZ・
 * ビューポート固定 / reducedMotion で Mantine トランジション停止
 * （theme.respectReducedMotion: true と対応）。
 */

import { defineConfig } from "@playwright/test";

export const APP_URL = process.env.APP_URL ?? "http://localhost:3100";

export default defineConfig({
  testMatch: "screenshots.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: APP_URL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    storageState: ".auth/state.json",
  },
});
