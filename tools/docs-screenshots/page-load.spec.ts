/**
 * page-load.spec.ts — 「全部の画面が、エラー無しに開く」を合否で言う。
 *
 * audit-crawl.ts（診断用・報告だけ）と同じ巡り方を、Playwright の 1 画面 = 1 テストに
 * 落としたもの。単体試験（vitest）は純ロジックしか見ず、`pnpm build` は型と
 * バンドルしか見ないので、「ページを開いたら RSC が throw する / クライアントで
 * hydration が割れる / 翻訳鍵が無い」は実際に開くまで分からない — 2026-09 の
 * 在庫カテゴリ移設と品目統合（#891–#897）はまさにこの種の壊れ方をし得る。
 *
 * 巡る対象:
 *   1. `src/app/(dashboard)/**\/page.tsx` の静的ルート全部（動的セグメント無し）
 *   2. manifest.ts の撮影パス（固定シードの実データを指す詳細・編集・タブ付き URL
 *      — 撮れている画面は「開ける」ことが確かめられている URL の一覧でもある）
 *   3. 各一覧の先頭行をクリックして着く詳細と、その `/edit`（存在するときだけ）
 *
 * 1 画面ごとに見るもの（audit-crawl.ts の PAGE_CHECKS と同じ判定）:
 *   - HTTP 4xx/5xx でない、/login へ弾かれない
 *   - pageerror（未捕捉例外）が無い
 *   - console.error が無い（写真の無いデモユーザーの avatar 404 など既知の
 *     データ由来は IGNORE_CONSOLE で除く）
 *   - 本文に MISSING_MESSAGE / [object Object] / Invalid Date / NaN / undefined
 *     が語として出ていない
 *
 * 使い方: README「全画面の読み込み確認（e2e:pages）」。ログインは global-setup.ts が
 * demo1（system 権限）で 1 回だけ行い、storageState を使い回す。
 */

import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { shots } from "./manifest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_URL ?? "http://localhost:3100";
const DASHBOARD = resolve(HERE, "../../coolify/apps/nextjs-web/src/app/(dashboard)");

/** データ由来で常に出る既知のノイズ。コードの欠陥ではないものだけを並べる。 */
const IGNORE_CONSOLE = [
  "/api/avatars/", // デモユーザーの写真ファイルが無い（データ）
  "favicon",
  "Download the React DevTools",
  "Geolocation",
  // 外部サービス由来 — この試験の環境には無い。詳細画面が iframe で先読みする
  // PDF（Gotenberg → 502）と、オブジェクトストレージの実体（SeaweedFS → 404:
  // 取込元 PDF・設計図データ）。画面自体は描けていて、無いのはレンダラと
  // ストレージ。
  "/api/pdf/",
  "/api/intake/source/",
  "/api/design-files/",
];

const BAD_TEXT = ["MISSING_MESSAGE", "[object Object]", "Invalid Date", "NaN", "undefined"];

function listStaticRoutes(appDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, url: string) => {
    for (const ent of readdirSync(dir)) {
      const p = join(dir, ent);
      if (statSync(p).isDirectory()) {
        if (ent.startsWith("[")) continue;
        const seg = ent.startsWith("(") ? "" : `/${ent}`;
        walk(p, url + seg);
      } else if (ent === "page.tsx") out.push(url || "/");
    }
  };
  walk(appDir, "");
  return Array.from(new Set(out)).sort();
}

/** manifest の web 画面のパス（キオスク・ログアウト撮影は除く）。 */
function manifestRoutes(): string[] {
  const seen = new Set<string>();
  for (const s of shots) {
    if (s.app || s.loggedOut) continue;
    if (!s.path.startsWith("/")) continue;
    seen.add(s.path);
  }
  return Array.from(seen).sort();
}

type Issue = { kind: string; detail: string };

/** 1 画面を開いて欠陥を集める。空配列 = 問題なし。 */
async function visit(page: Page, url: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  const onErr = (e: Error) => issues.push({ kind: "pageerror", detail: e.message.slice(0, 300) });
  const onConsole = (m: { type(): string; text(): string; location(): { url: string } }) => {
    if (m.type() !== "error") return;
    const t = m.text();
    const where = m.location()?.url ?? "";
    if (IGNORE_CONSOLE.some((s) => t.includes(s) || where.includes(s))) return;
    issues.push({ kind: "console-error", detail: `${t.slice(0, 300)} @ ${where}` });
  };
  page.on("pageerror", onErr);
  page.on("console", onConsole);
  try {
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    const status = res?.status() ?? 0;
    if (status >= 400) issues.push({ kind: `http-${status}`, detail: url });
    await page.waitForTimeout(400);
    // `/settings/login-history` が "/login" を含むので、パスの完全一致で見る。
    if (new URL(page.url()).pathname === "/login") {
      issues.push({ kind: "redirected-to-login", detail: page.url() });
      return issues;
    }
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    for (const bad of BAD_TEXT) {
      const re = new RegExp(`(^|[^A-Za-z_])${bad.replace(/[.*+?^$()[\]{}|\\]/g, "\\$&")}([^A-Za-z_]|$)`);
      if (re.test(text)) issues.push({ kind: "bad-text", detail: bad });
    }
  } catch (e) {
    issues.push({ kind: "navigation-failed", detail: String(e).slice(0, 300) });
  } finally {
    page.off("pageerror", onErr);
    page.off("console", onConsole);
  }
  return issues;
}

const statics = listStaticRoutes(DASHBOARD);
const fromManifest = manifestRoutes().filter((p) => !statics.includes(p.split("?")[0]));

test.describe("静的ルート", () => {
  for (const route of statics) {
    test(`${route} が開く`, async ({ page }) => {
      const issues = await visit(page, `${APP}${route}`);
      expect(issues, `${route}\n${issues.map((i) => `${i.kind}: ${i.detail}`).join("\n")}`).toEqual([]);
    });
  }
});

test.describe("撮影パス（固定シードの詳細・編集・タブ）", () => {
  for (const route of fromManifest) {
    test(`${route} が開く`, async ({ page }) => {
      const issues = await visit(page, `${APP}${route}`);
      expect(issues, `${route}\n${issues.map((i) => `${i.kind}: ${i.detail}`).join("\n")}`).toEqual([]);
    });
  }
});

test.describe("一覧の先頭行から詳細・編集へ", () => {
  const lists = statics.filter((r) => r !== "/" && !r.endsWith("/new") && !r.includes("/print"));
  for (const route of lists) {
    test(`${route} の先頭行`, async ({ page }) => {
      await page.goto(`${APP}${route}`, { waitUntil: "networkidle", timeout: 60_000 });
      const rows = page.locator("table tbody tr");
      if ((await rows.count()) === 0) test.skip(true, "一覧に行が無い（表ではない画面か、データ無し）");
      const before = page.url();
      try {
        await rows.first().click({ timeout: 3_000 });
        await page.waitForTimeout(800);
      } catch {
        test.skip(true, "行がクリックできない（選択列など）");
      }
      // 行の行き先は同じアプリの詳細とは限らない（未処理指示書 → 注文明細、
      // 外注依頼 → 指示書）。遷移した先なら何でも開いて確かめる。
      const detail = new URL(page.url()).pathname;
      if (page.url() === before) {
        test.skip(true, `行クリックで遷移しない: ${page.url()}`);
      }
      const issues = await visit(page, `${APP}${detail}`);
      const editRes = await page.request.get(`${APP}${detail}/edit`, { maxRedirects: 0 }).catch(() => null);
      if (editRes && editRes.status() === 200) issues.push(...(await visit(page, `${APP}${detail}/edit`)).map((i) => ({ ...i, detail: `[edit] ${i.detail}` })));
      expect(issues, `${detail}\n${issues.map((i) => `${i.kind}: ${i.detail}`).join("\n")}`).toEqual([]);
    });
  }
});
