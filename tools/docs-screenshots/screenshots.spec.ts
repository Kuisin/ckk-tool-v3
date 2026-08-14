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
  test(shot.id, async ({ page }) => {
    if (shot.loggedOut) {
      // 各テストは独立コンテキスト（storageState 適用済み）— cookie を消せば
      // このテストだけ未ログイン状態になる。
      await page.context().clearCookies();
    }

    await page.goto(shot.path, { waitUntil: "networkidle" });
    if (shot.steps) await shot.steps(page);
    // フォント・画像の残り読み込みを確実に終わらせる
    await page.evaluate(() => document.fonts.ready);

    mkdirSync(OUT_DIR, { recursive: true });
    const path = join(OUT_DIR, `${shot.id}.png`);
    const mask = (shot.mask ?? []).map((sel) => page.locator(sel));

    if (shot.clip) {
      await page
        .locator(shot.clip)
        .screenshot({ path, animations: "disabled", caret: "hide", mask });
    } else {
      await page.screenshot({
        path,
        fullPage: shot.fullPage ?? false,
        animations: "disabled",
        caret: "hide",
        mask,
      });
    }
  });
}
