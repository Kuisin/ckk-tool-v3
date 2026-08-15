/**
 * screenshots.spec.ts — manifest の各エントリを 1 テスト = 1 PNG として撮影。
 *
 * 出力先は既定で content/manual/assets/screenshots（コミット対象）。
 * docs:verify は PW_OUT_DIR を一時ディレクトリに向けて撮り直し、コミット済み
 * PNG と pixelmatch で比較する。--only <id> は orchestrate が -g に変換。
 */

import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import { shots } from "./manifest";

const OUT_DIR = resolve(
  process.env.PW_OUT_DIR ??
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../docker-compose/nextjs-web/content/manual/assets/screenshots",
    ),
);

for (const shot of shots) {
  test(shot.id, async ({ page, browser }) => {
    if (shot.loggedOut) {
      // 各テストは独立コンテキスト（storageState 適用済み）— cookie を消せば
      // このテストだけ未ログイン状態になる。
      await page.context().clearCookies();
    }
    if (shot.user === "admin") {
      // system 権限が必要な画面は管理者（demo1）の storageState に差し替える。
      // 既定コンテキストの描画設定（viewport/locale/TZ/reducedMotion）を引き継ぐ。
      const admin = await browser.newContext({
        storageState: ".auth/admin.json",
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        locale: "ja-JP",
        timezoneId: "Asia/Tokyo",
        colorScheme: "light",
        reducedMotion: "reduce",
        baseURL: process.env.APP_URL ?? "http://localhost:3100",
      });
      page = await admin.newPage();
    }
    if (shot.app === "kiosk") {
      // 現場タブレット（別アプリ・別ポート）。端末 cookie に撮影用シードの
      // 既知トークンを載せることで「管理者にリンク済みの端末」として扱われる。
      // タブレット実機に近い縦長ビューポートで撮る。
      const kioskUrl = process.env.KIOSK_URL ?? "http://localhost:3101";
      const ctx = await browser.newContext({
        viewport: { width: 1200, height: 1600 },
        deviceScaleFactor: 2,
        locale: "ja-JP",
        timezoneId: "Asia/Tokyo",
        colorScheme: "light",
        reducedMotion: "reduce",
        baseURL: kioskUrl,
      });
      await ctx.addCookies([
        {
          name: "kiosk_device",
          value: "ckk-shot-device-token-fixed-0001",
          url: kioskUrl,
        },
      ]);
      page = await ctx.newPage();
    }

    await page.goto(shot.path, { waitUntil: "networkidle" });
    if (shot.steps) await shot.steps(page);
    // フォント・画像の残り読み込みを確実に終わらせる
    await page.evaluate(() => document.fonts.ready);

    mkdirSync(OUT_DIR, { recursive: true });
    const path = join(OUT_DIR, `${shot.id}.png`);
    const mask = (shot.mask ?? []).map((sel) => page.locator(sel));
    // 既定のマスク色（マゼンタ）はマニュアルに載せると目を引きすぎるので、
    // 画面の地の色に近いグレーで塗る（キオスクはダークテーマ）。
    const maskColor = shot.app === "kiosk" ? "#2a2f45" : "#e9ecef";

    if (shot.clip) {
      await page.locator(shot.clip).screenshot({
        path,
        animations: "disabled",
        caret: "hide",
        mask,
        maskColor,
      });
    } else {
      await page.screenshot({
        path,
        fullPage: shot.fullPage ?? false,
        animations: "disabled",
        caret: "hide",
        mask,
        maskColor,
      });
    }
  });
}
