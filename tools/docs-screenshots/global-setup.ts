/**
 * global-setup.ts — demo_shot で 1 回だけログインし storageState を保存。
 *
 * ログインフォームは「開発用アカウントでログイン」トグルの中
 * （credentials プロバイダ）。失敗リトライはしない — アプリ側に
 * 5 回失敗 / 15 分のレートリミットがあるため（src/auth.ts）。
 */

import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
const USERNAME = process.env.SHOT_USERNAME ?? "demo_shot";
const PASSWORD = process.env.SHOT_PASSWORD ?? "shot2026";

export default async function globalSetup(): Promise<void> {
  mkdirSync(".auth", { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: "ja-JP" });

  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "開発用アカウントでログイン" }).click();
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード", { exact: false }).first().fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL(`${APP_URL}/`, { timeout: 30_000 });

  await page.context().storageState({ path: ".auth/state.json" });
  await browser.close();
  console.log(`[global-setup] logged in as ${USERNAME}, storageState saved`);
}
