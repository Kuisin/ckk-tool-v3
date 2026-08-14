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
// system 権限が必要な画面（/settings/*）用の管理者アカウント（demo-users-seed）。
const ADMIN_USERNAME = process.env.SHOT_ADMIN_USERNAME ?? "demo1";
const ADMIN_PASSWORD = process.env.SHOT_ADMIN_PASSWORD ?? "demo2026";

async function loginAndSave(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  username: string,
  password: string,
  statePath: string,
): Promise<void> {
  const page = await browser.newPage({ locale: "ja-JP" });
  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "開発用アカウントでログイン" }).click();
  await page.getByLabel("ユーザー名").fill(username);
  await page.getByLabel("パスワード", { exact: false }).first().fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL(`${APP_URL}/`, { timeout: 30_000 });
  await page.context().storageState({ path: statePath });
  await page.context().close();
  console.log(`[global-setup] logged in as ${username} → ${statePath}`);
}

export default async function globalSetup(): Promise<void> {
  mkdirSync(".auth", { recursive: true });
  const browser = await chromium.launch();
  await loginAndSave(browser, USERNAME, PASSWORD, ".auth/state.json");
  await loginAndSave(browser, ADMIN_USERNAME, ADMIN_PASSWORD, ".auth/admin.json");
  await browser.close();
}
