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
      "../../coolify/apps/nextjs-web/content/manual/assets/screenshots",
    ),
);

// external（Metabase 等、nextjs-web の外）は scripts/metabase-demo-shots.sh が
// 別スタックに対して個別に撮る — 通常のこのフローには含めない。
for (const shot of shots.filter((s) => !s.external)) {
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
    if (shot.highlight?.length) {
      // Playwright ロケータで解決した要素に data 属性を付け、CSS 1 ルールで
      // 赤枠を注入する。outline + box-shadow はレイアウトに関与しないので
      // 下地の描画は非強調時とピクセル同一（docs:verify の決定性を保つ）。
      for (const target of shot.highlight) {
        let loc;
        if (typeof target === "string") {
          loc = page.locator(target).first();
        } else if ("text" in target) {
          loc = page.getByText(target.text, { exact: target.exact }).first();
        } else {
          const scope = target.inDialog ? page.getByRole("dialog") : page;
          loc = scope
            .getByRole(target.role as never, {
              name: target.name,
              exact: target.exact,
            })
            .first();
        }
        await loc.waitFor(); // セレクタ腐りは即失敗させる
        await loc.evaluate((el) => el.setAttribute("data-shot-highlight", ""));
      }
      await page.addStyleTag({
        content: `[data-shot-highlight]{
          outline: 3px solid #e03131 !important;
          outline-offset: 2px;
          box-shadow: 0 0 0 6px rgba(224, 49, 49, 0.18) !important;
          border-radius: 4px;
        }`,
      });
    }
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
