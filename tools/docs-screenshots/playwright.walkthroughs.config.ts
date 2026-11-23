/**
 * playwright.walkthroughs.config.ts — 業務の通し操作（walkthroughs.spec.ts）の設定。
 *
 * 撮影（playwright.config.ts）・全画面の読み込み確認（playwright.pages.config.ts）とは
 * 別の設定にしてある。通し操作は DB の状態を進める（書類を作り、承認し、出荷する）ので
 * **並列にできない** — workers は 1 固定で、ウォークスルーは登録順に走る。
 * 同じ理由で retries も 0（途中まで進んだ DB に対してやり直しても同じ結果にならない）。
 *
 * モード（env WALK_MODE）:
 *   check（既定） … 待たずに走らせる。落ちたときだけ動画とトレースを残す
 *   record        … 人が追える速さで走らせ、毎回動画を残す（マニュアル用）
 *
 * 動画は 1280×720 の等倍。スクリーンショット（1440×900 @2x）より小さいのは、
 * 動画は細部より「どこを押すか」が伝われば足り、サイズがそのまま配信量になるため。
 */

import { defineConfig } from "@playwright/test";

export const APP_URL = process.env.APP_URL ?? "http://localhost:3130";
export const WALK_MODE = process.env.WALK_MODE === "record" ? "record" : "check";
export const VIDEO_SIZE = { width: 1280, height: 720 };

export default defineConfig({
  testMatch: "walkthroughs.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // 録画は 1 本あたり数分かかる（間を取りながら 10 画面前後を回る）。
  timeout: WALK_MODE === "record" ? 600_000 : 240_000,
  globalSetup: "./global-setup.ts",
  outputDir: process.env.WALK_RESULTS_DIR ?? "test-results/walkthroughs",
  reporter: [["list"]],
  use: {
    baseURL: APP_URL,
    viewport: VIDEO_SIZE,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "light",
    // record でも reducedMotion は外さない: モーダルやメニューの出入りの動きは
    // 動画では「いま何が開いたか」を読みにくくするだけで、検査との挙動差にもなる。
    contextOptions: { reducedMotion: "reduce" },
    video: { mode: WALK_MODE === "record" ? "on" : "retain-on-failure", size: VIDEO_SIZE },
    trace: WALK_MODE === "record" ? "off" : "retain-on-failure",
    screenshot: { mode: "only-on-failure", fullPage: true },
  },
});
