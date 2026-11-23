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
import { VIDEO_SIZE, WALK_MODE } from "./playwright.walkthroughs.config";
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

/** 字幕（WebVTT）を作る。1 枚 = 1 キュー、次の字幕が始まるまで出す。 */
function toVtt(captions: { text: string; startMs: number; targetY?: number }[], endMs: number): string {
  const cues = captions.map((c, i) => {
    const end = captions[i + 1]?.startMs ?? endMs;
    // 案内している欄が画面の下半分にあるときは、字幕を上へ出す（`line:6%`）。
    // 既定（下）のままだと、説明している当の欄を字幕が覆う。
    const position = c.targetY !== undefined && c.targetY > 0.5 ? " line:6%" : "";
    return `${i + 1}\n${vttTime(c.startMs)} --> ${vttTime(Math.max(end, c.startMs + 1))}${position}\n${c.text}`;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

/** HTML に入れる文字のエスケープ（題と手順は自分たちの文だが、記号を含む）。 */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * プレビュー（再生する前に出る画像）= 題と手順の一覧を書いた 1 枚。
 *
 * 以前は録画の途中の画面をそのまま使っていたが、それだと「何の動画か」が
 * 分からない（保存直後の詳細画面が写っているだけ）。押す前に、何が見られるかを
 * 文字で言う。手順は「—」の前（何をするか）だけを並べる。
 */
function titleCardHtml(title: string, chapters: { title: string }[]): string {
  const [head, sub] = title.split(" — ");
  const items = chapters
    .map((c, i) => `<li><span class="n">${i + 1}</span>${esc(c.title.split(" — ")[0] ?? c.title)}</li>`)
    .join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: ${VIDEO_SIZE.width}px; height: ${VIDEO_SIZE.height}px; padding: 64px 72px;
      font-family: "Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans", system-ui, sans-serif;
      background: #f8f9fa; color: #212529; display: flex; flex-direction: column; }
    .bar { width: 72px; height: 8px; border-radius: 4px; background: #228be6; margin-bottom: 28px; }
    h1 { font-size: 56px; font-weight: 700; line-height: 1.25; }
    .sub { font-size: 30px; color: #495057; margin-top: 12px; }
    ol { list-style: none; padding: 0; margin-top: 44px; display: grid; gap: 14px 48px;
      grid-template-columns: ${chapters.length > 5 ? "1fr 1fr" : "1fr"}; grid-auto-flow: ${chapters.length > 5 ? "column" : "row"};
      grid-template-rows: repeat(${chapters.length > 5 ? Math.ceil(chapters.length / 2) : chapters.length}, auto); }
    li { font-size: 28px; display: flex; align-items: center; gap: 16px; }
    .n { flex: none; width: 40px; height: 40px; border-radius: 50%; background: #e7f5ff; color: #1971c2;
      font-size: 22px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  </style></head><body><div class="bar"></div><h1>${esc(head ?? title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}<ol>${items}</ol></body></html>`;
}

for (const wt of walkthroughs) {
  test.describe(wt.id, () => {
    test.use({ storageState: AUTH_STATE[wt.user ?? "staff"] });

    test(wt.title, async ({ page, browser }, testInfo) => {
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
      for (const [i, step] of wt.steps.entries()) {
        walk.beginStep(step.caption);
        // 手順の見出しを読む間。すぐ案内（say）が続く手順では、これが無いと
        // 見出しが 1〜2 秒で次の字幕に替わってしまう。
        await walk.pace(2200);
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
      writeFileSync(join(OUT_DIR, `${wt.id}.vtt`), toVtt(walk.captions, endMs));
      // プレビューは録画とは別のコンテキストで描く（録画の中に写り込ませない）。
      const cardContext = await browser.newContext({ viewport: VIDEO_SIZE, deviceScaleFactor: 1 });
      const card = await cardContext.newPage();
      await card.setContent(titleCardHtml(wt.title, walk.chapters), { waitUntil: "load" });
      await card.evaluate(() => document.fonts.ready);
      writeFileSync(join(OUT_DIR, `${wt.id}.jpg`), await card.screenshot({ type: "jpeg", quality: 88 }));
      await cardContext.close();
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
