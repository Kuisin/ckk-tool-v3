/**
 * walkthroughs.spec.ts — 業務の通し操作を 1 本 = 1 テストで走らせる。
 *
 * page-load.spec.ts は「全部の画面がエラー無しに開く」を見るが、開けることと
 * **業務が最後まで通ること**は別である — 保存ボタンが効かない、承認しても次へ
 * 進めない、といった壊れ方はページを開くだけでは分からない。ここではマニュアルの
 * プロセス編と同じ順に、実際に書類を作って先へ進める。
 *
 * 同じテストが 2 役を兼ねる（walkthroughs/types.ts）:
 *   WALK_MODE=check  … 本番へ上げる前の検査（CI の walkthroughs ジョブ）
 *   WALK_MODE=record … マニュアルに載せる動画の録画（scripts/walkthroughs.ts --record）
 *
 * 落とす条件: 手順の失敗 / 未捕捉例外（pageerror）/ console.error
 * （試験環境に無い外部サービス由来のものは console-ignore.ts で除く）。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { isIgnoredConsole } from "./console-ignore";
import { WALK_MODE } from "./playwright.walkthroughs.config";
import { walkthroughs } from "./walkthroughs";
import type { RecordedVideo } from "./walkthroughs/types";
import { AUTH_STATE, CURSOR_INIT_SCRIPT, Walk } from "./walkthroughs/walk";

/** 録画の書き出し先（scripts/walkthroughs.ts が一時ディレクトリを渡す）。 */
const OUT_DIR = process.env.WALK_OUT_DIR;

function vttTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

/** 手順の区切りから字幕（WebVTT）を作る。1 手順 = 1 キュー、次の手順が始まるまで出す。 */
function toVtt(chapters: { title: string; startMs: number }[], endMs: number): string {
  const cues = chapters.map((c, i) => {
    const end = chapters[i + 1]?.startMs ?? endMs;
    return `${i + 1}\n${vttTime(c.startMs)} --> ${vttTime(Math.max(end, c.startMs + 1))}\n${i + 1}. ${c.title}`;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

for (const wt of walkthroughs) {
  test.describe(wt.id, () => {
    test.use({ storageState: AUTH_STATE[wt.user ?? "staff"] });

    test(wt.title, async ({ page }, testInfo) => {
      const problems: string[] = [];
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const where = m.location()?.url ?? "";
        if (isIgnoredConsole(m.text(), where)) return;
        problems.push(`console.error: ${m.text().slice(0, 300)} @ ${where}`);
      });
      await page.addInitScript(CURSOR_INIT_SCRIPT);

      const walk = new Walk(page, WALK_MODE);
      let poster: Buffer | undefined;

      for (const [i, step] of wt.steps.entries()) {
        walk.beginStep(step.caption);
        try {
          await test.step(`${i + 1}. ${step.caption}`, () => step.run(walk));
        } catch (e) {
          // どの画面で止まったかを残す。CI ではブラウザを開けないので、失敗時の
          // 画面の構造（aria スナップショット）がそのまま調査の入口になる。
          const where = (await page.getByRole("dialog").count())
            ? page.getByRole("dialog").last()
            : page.locator("main");
          const snapshot = await where.ariaSnapshot({ timeout: 5_000 }).catch(() => "(取得できず)");
          const body = `URL: ${page.url()}\n\n${snapshot}`;
          await testInfo.attach("画面の構造（失敗時）", { body, contentType: "text/plain" });
          // 手元で直すときは WALK_DEBUG=1 でそのまま端末に出す。
          if (process.env.WALK_DEBUG) console.log(body);
          throw e;
        }
        // サムネイルは最初の手順が終わった画面（ログイン直後の空白ではなく中身のある画面）。
        if (i === 0 && WALK_MODE === "record") {
          poster = await page.screenshot({ type: "jpeg", quality: 80 });
        }
        await walk.pace(1000);
      }

      expect(problems, `「${wt.title}」の途中でエラーが出た`).toEqual([]);

      if (WALK_MODE !== "record" || !OUT_DIR) return;

      // 動画はコンテキストを閉じたときに確定する。閉じてから保存する。
      const endMs = walk.elapsedMs();
      const video = page.video();
      await page.context().close();
      if (!video) throw new Error("録画が有効になっていない（playwright.walkthroughs.config.ts の video）");
      mkdirSync(OUT_DIR, { recursive: true });
      await video.saveAs(join(OUT_DIR, `${wt.id}.webm`));
      writeFileSync(join(OUT_DIR, `${wt.id}.vtt`), toVtt(walk.chapters, endMs));
      if (poster) writeFileSync(join(OUT_DIR, `${wt.id}.jpg`), poster);
      const meta: RecordedVideo = {
        id: wt.id,
        docPage: wt.docPage,
        title: wt.title,
        durationSec: Math.round(endMs / 100) / 10,
        chapters: walk.chapters.map((c) => ({ title: c.title, startSec: Math.round(c.startMs / 100) / 10 })),
      };
      writeFileSync(join(OUT_DIR, `${wt.id}.json`), JSON.stringify(meta, null, 2));
    });
  });
}
