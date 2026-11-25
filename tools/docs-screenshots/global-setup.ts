/**
 * global-setup.ts — 撮影・検査用のユーザーで 1 回ずつログインし storageState を保存。
 *
 * ログインフォームは「開発用アカウントでログイン」トグルの中
 * （credentials プロバイダ）。失敗リトライはしない — アプリ側に
 * 5 回失敗 / 15 分のレートリミットがあるため（src/auth.ts）。
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
const USERNAME = process.env.SHOT_USERNAME ?? "demo_shot";
const PASSWORD = process.env.SHOT_PASSWORD ?? "shot2026";
// system 権限が必要な画面（/settings/*）用の管理者アカウント（demo-users-seed）。
const ADMIN_USERNAME = process.env.SHOT_ADMIN_USERNAME ?? "demo1";
const ADMIN_PASSWORD = process.env.SHOT_ADMIN_PASSWORD ?? "demo2026";
// 業務の通し操作（walkthroughs.spec.ts）で「依頼する側」になる担当者（demo-users-seed）。
// demo_shot は全承認グループのメンバーなので、同じ人が依頼して承認すると
// 「誰が承認するのか」が動画から読み取れない。承認グループに居ない人を別に使う。
const STAFF_USERNAME = process.env.SHOT_STAFF_USERNAME ?? "demo2";
const STAFF_PASSWORD = process.env.SHOT_STAFF_PASSWORD ?? "demo2026";
// storageState の置き場。既定 .auth。**並列に走らせるときは 1 本ごとに分ける**
// （scripts/scenarios.ts）— セッションは DB にあるので、別の DB に向いたアプリの
// ログインを使い回せず、同じファイルへ書くと互いのログインを上書きする。
export const AUTH_DIR = process.env.SHOT_AUTH_DIR ?? ".auth";

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
  mkdirSync(AUTH_DIR, { recursive: true });
  const browser = await chromium.launch();
  await loginAndSave(browser, USERNAME, PASSWORD, join(AUTH_DIR, "state.json"));
  await loginAndSave(browser, ADMIN_USERNAME, ADMIN_PASSWORD, join(AUTH_DIR, "admin.json"));
  await loginAndSave(browser, STAFF_USERNAME, STAFF_PASSWORD, join(AUTH_DIR, "staff.json"));
  await browser.close();
}
