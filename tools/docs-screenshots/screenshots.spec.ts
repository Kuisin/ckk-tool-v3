/**
 * screenshots.spec.ts — manifest の各エントリを 1 テスト = 1 PNG として撮影。
 *
 * 出力先は既定で content/manual/assets/screenshots（コミット対象）。
 * docs:verify は PW_OUT_DIR を一時ディレクトリに向けて撮り直し、コミット済み
 * PNG と pixelmatch で比較する。--only <id> は orchestrate が -g に変換。
 *
 * **既定は全高（fullPage）で 1 枚**。以前は表示領域ぶん（1440×900）だけを撮って
 * いたので、折り返しより下（詳細画面のタブ・明細表・フォームの後半）が問答無用で
 * 切れていた。マニュアルは「画面のどこに何があるか」を示すものなので、切れて
 * いる下半分は説明できない。表示領域ぶんで撮りたい 1 枚があれば
 * `fullPage: false` を明示する（いまは 0 枚）。
 */

import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, test } from "@playwright/test";
import { shots } from "./manifest";

const OUT_DIR = resolve(
  process.env.PW_OUT_DIR ??
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../coolify/apps/nextjs-web/content/manual/assets/screenshots",
    ),
);

/**
 * 全高で撮るときの固定要素の始末（web アプリのみ）。
 *
 * Chromium の全高撮影は `position: fixed` を**表示領域の位置に焼き込む**。
 * 画面下端に貼り付くフッター（社名・版）は、そのままだと画像の途中に横帯として
 * 残る（以前は撮影ごとに display:none を注入して個別に回避していた）。途中に
 * 出るくらいなら要らないので隠し、フッターのために空けてある下余白も一緒に
 * 畳んで、画像が中身で終わるようにする。
 *
 * 下端に貼り付く `position: sticky` も同じことが起きる（`.form-actions` =
 * 保存 / キャンセルの行）。こちらは隠さず**流れに戻す** — 全高で見ればその行は
 * フォームの末尾にあるのが本当の位置で、途中に貼り付いていると「フォームは
 * ここで終わり」と読めてしまう。
 *
 * ヘッダーは `top: 0` なので画像の先頭に 1 回だけ出る — そのままでよい。
 * 上に貼り付く sticky（表の見出し・工程フロー図・マスタ一覧の左ペイン）は
 * スクロール 0 の位置＝本来の位置なので触らない。
 * キオスクのヘッダー・フッターは `position: relative`（KioskShell.tsx）で
 * 流れの中にあるため、この始末は要らない（端末名・バッテリーはマニュアルの
 * 説明対象なので消してはいけない）。
 */
const FULL_HEIGHT_CSS = `
  .mantine-AppShell-footer { display: none !important; }
  .mantine-AppShell-main { padding-bottom: 0 !important; }
  .form-actions { position: static !important; }
`;

/**
 * 全高撮影の前に、折り返しより下の遅延読み込みを起こしてから先頭へ戻す。
 *
 * Chromium の全高撮影は表示領域を広げて 1 枚に収めるが、**それでは
 * IntersectionObserver は発火しない**。`useInView`（hooks/useInView.ts）で門を
 * 置いた重い中身 — 設計図ビューアの 3D / PDF / 画像プレビュー — は「まだ
 * 見えていない」ままなので、スクロールで一度通す。`useInView` は once なので、
 * 先頭へ戻しても読み込んだものは捨てられない。
 *
 * 刻みは表示領域ぶん・待ちは固定にして、docs:verify の決定性（同じ入力なら
 * 同じ画像）を崩さない。全高で撮る 1 枚だけが呼ぶ（モーダル・メニューが開いて
 * いる撮影では動かさない — decideFraming 参照）。
 */
async function settle(page: Page): Promise<void> {
  const { total, step } = await page.evaluate(() => ({
    total: document.documentElement.scrollHeight,
    step: window.innerHeight,
  }));
  for (let y = step; y < total; y += step) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  // スクロールで始まった取得（画像・プレビュー）を撮る前に終わらせる。
  await page.waitForLoadState("networkidle");
}

/** 撮り方 — 要素 1 つ / 表示領域ぶん / 全高。 */
type Framing =
  | { mode: "element"; selector: string }
  | { mode: "viewport" }
  | { mode: "full" };

/**
 * この 1 枚をどう撮るかを決める。
 *
 * 1. `clip` 指定 → その要素だけ（manifest が明示した 3 枚。印刷シート・モーダル）
 * 2. **モーダル / メニューが開いている → 表示領域ぶん。** 全高にすると、
 *    ポータルで描かれるドロップダウンが Chromium の「表示領域を超える撮影」で
 *    **描かれない**（実測: 同じ座標・同じ DOM で、表示領域の撮影には写り、全高の
 *    撮影には写らない）。主題が消えた画像は例外にならず静かに出てくるので、
 *    開閉物が主題の撮影は従来どおり表示領域ぶんで撮る — 元々そう撮れていた
 *    ものなので後退でもない。
 *    ただし**モーダルが表示領域より高いときは、そのモーダル要素を撮る**。
 *    表示領域ぶんだと下が切れる = このパイプラインで直したかったことそのもの。
 * 3. それ以外 → 全高
 */
async function decideFraming(
  page: Page,
  clip: string | undefined,
  fullPage: boolean | undefined,
): Promise<Framing> {
  if (clip) return { mode: "element", selector: clip };
  if (fullPage === false) return { mode: "viewport" };
  const overlay = await page.evaluate(() => {
    // **開いているものだけを数える。** Mantine は閉じている Popover の
    // ドロップダウンも DOM に残す（display:none・寸法 0）ので、要素の有無で
    // 判定すると、ただのフォーム画面（Select が並ぶ新規作成など）まで
    // 「メニューが開いている」と誤判定して表示領域ぶんで撮ってしまう。
    const shown = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? r : null;
    };
    const dialog = [...document.querySelectorAll('[role="dialog"]')]
      .map(shown)
      .find(Boolean);
    const floating = [
      ...document.querySelectorAll('[role="menu"], .mantine-Popover-dropdown'),
    ]
      .map(shown)
      .find(Boolean);
    if (!dialog && !floating) return null;
    return { tall: dialog ? dialog.height > window.innerHeight : false };
  });
  if (!overlay) return { mode: "full" };
  // role="dialog" は .mantine-Modal-content と同じ要素（確認済み）。
  return overlay.tall
    ? { mode: "element", selector: '[role="dialog"]' }
    : { mode: "viewport" };
}

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
    const framing = await decideFraming(page, shot.clip, shot.fullPage);
    if (framing.mode === "full") {
      // 下端まで中身を埋めてから、固定・下貼り付きの要素を流れに戻す。
      await settle(page);
      if (shot.app !== "kiosk") {
        await page.addStyleTag({ content: FULL_HEIGHT_CSS });
      }
    }
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

    if (framing.mode === "element") {
      await page.locator(framing.selector).screenshot({
        path,
        animations: "disabled",
        caret: "hide",
        mask,
        maskColor,
      });
    } else {
      await page.screenshot({
        path,
        fullPage: framing.mode === "full",
        animations: "disabled",
        caret: "hide",
        mask,
        maskColor,
      });
    }
  });
}
