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
 *
 * **ファイル名はロケールで分かれる。** env `SHOT_LOCALE`（orchestrate.ts の
 * `--locale` が渡す。既定 ja）が "ja" のときは従来どおり `<id>.png`
 * （コミット済み 240 枚と後方互換）、"en"/"zh" のときは `<id>.en.png` /
 * `<id>.zh.png`。アプリの言語自体は DB の app.users.locale で決まる
 * （orchestrate.ts が撮影ユーザーの値を切り替える）ので、ここでの分岐は
 * 「同じ画面の言語違いを別ファイルとして残す」ことだけを担う。
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, test } from "@playwright/test";
import { gotoDoc } from "./doc-number";
import { currentLocale } from "./i18n-text";
import { shots } from "./manifest";

const OUT_DIR = resolve(
  process.env.PW_OUT_DIR ??
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../coolify/apps/nextjs-web/content/manual/assets/screenshots",
    ),
);

const LOCALE = currentLocale();

/** ja は無印 `<id>.png`（既存 240 枚と後方互換）、en/zh は `<id>.<locale>.png`。 */
function shotFilename(id: string): string {
  return LOCALE === "ja" ? `${id}.png` : `${id}.${LOCALE}.png`;
}

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

/**
 * PDF の 1 ページ目を PNG の data URL にする。
 *
 * **ヘッドレス Chromium は iframe の中の PDF を描かない**（PDF ビューアは
 * ヘッドフル専用のプラグイン）。そのままだと PDF タブの撮影は白い紙 1 枚に
 * なる（quote-pdf-01 が長らくそうだった）。そこで PDF を撮影ユーザーの
 * cookie のまま取り直し、poppler の pdftoppm（無ければ Ghostscript）で
 * 1 ページ目を画像にする — scenarios/scn.ts の `pdf()` と同じ手当て。
 *
 * 解像度は 192dpi: 画面の A4 枠（最大 794 CSS px = 210mm @96dpi）を
 * deviceScaleFactor 2 で撮るので、その 2 倍 = 192dpi で 1:1 になる。
 * 同じ PDF からは同じ画像が出る（docs:verify の決定性を崩さない）。
 */
async function pdfFirstPage(
  page: Page,
  url: string,
  maskBottom = 0,
): Promise<string> {
  const res = await page.request.get(url, { timeout: 60_000 });
  const type = res.headers()["content-type"] ?? "";
  if (!res.ok() || !type.includes("pdf")) {
    throw new Error(
      `PDF を取得できない: ${url} → ${res.status()} ${type} ${(await res.text().catch(() => "")).slice(0, 200)}`,
    );
  }
  const dir = mkdtempSync(join(tmpdir(), "ckk-shot-pdf-"));
  try {
    const pdf = join(dir, "doc.pdf");
    writeFileSync(pdf, await res.body());
    const out = join(dir, "page");
    try {
      execFileSync("pdftoppm", ["-png", "-r", "192", "-f", "1", "-l", "1", "-singlefile", pdf, out]);
    } catch {
      execFileSync("gs", [
        "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=png16m", "-r192",
        "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4",
        "-dFirstPage=1", "-dLastPage=1", `-sOutputFile=${out}.png`, pdf,
      ]);
    }
    const dataUrl = `data:image/png;base64,${readFileSync(`${out}.png`).toString("base64")}`;
    return maskBottom > 0 ? await whiteOutBottom(page, dataUrl, maskBottom) : dataUrl;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 画像の下端 `fraction` を白で塗る（manifest の `pdfMaskBottom`）。
 * 帳票によってはフッターに**出力した時刻**が刷られる（設計依頼書の
 * 「出力: yyyy/MM/dd HH:mm」）。それが写ると撮るたびに画像が変わるので、
 * 紙の地の色（白）で消す — マスクの灰色帯よりも紙の見た目を崩さない。
 */
async function whiteOutBottom(page: Page, dataUrl: string, fraction: number): Promise<string> {
  return page.evaluate(
    ({ dataUrl, fraction }) =>
      new Promise<string>((done) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const g = c.getContext("2d")!;
          g.drawImage(img, 0, 0);
          g.fillStyle = "#ffffff";
          const h = Math.round(c.height * fraction);
          g.fillRect(0, c.height - h, c.width, h);
          done(c.toDataURL("image/png"));
        };
        img.src = dataUrl;
      }),
    { dataUrl, fraction },
  );
}

/**
 * 画面に埋め込まれた PDF プレビュー（PdfAttachmentPanel の iframe）を、
 * その PDF の 1 ページ目の画像に差し替える。iframe の寸法・影はそのまま
 * 引き継ぐので、画面の見た目（灰色の台に A4 が 1 枚）は変わらない。
 */
async function rasterizePdfFrames(page: Page, maskBottom = 0): Promise<void> {
  const srcs = await page.evaluate(() =>
    [...document.querySelectorAll("iframe")]
      .filter((f) => f.getBoundingClientRect().width > 0)
      .map((f) => f.getAttribute("src") ?? "")
      .filter((s) => s.startsWith("/api/")),
  );
  for (const src of srcs) {
    // 埋め込みの中身が PDF ではない・取れない（ファイル保存先の無い撮影環境で
    // 添付や図面を開いている画面など）ときは、差し替えずに元のまま撮る —
    // それは以前からの見え方で、PDF タブの撮影ではない。
    let dataUrl: string;
    try {
      dataUrl = await pdfFirstPage(page, src.split("#")[0], maskBottom);
    } catch (e) {
      console.warn(`[shots] PDF の差し替えをしない: ${String(e).slice(0, 160)}`);
      continue;
    }
    await page.evaluate(
      ({ src, dataUrl }) =>
        new Promise<void>((done) => {
          const frame = [...document.querySelectorAll("iframe")].find(
            (f) => f.getAttribute("src") === src,
          );
          if (!frame) return done();
          const img = document.createElement("img");
          img.style.cssText = frame.style.cssText;
          img.style.aspectRatio = "";
          img.style.height = "auto";
          img.alt = frame.title;
          img.onload = () => done();
          img.src = dataUrl;
          frame.replaceWith(img);
        }),
      { src, dataUrl },
    );
  }
}

/**
 * manifest の `pdf` 指定 — 画面ではなく PDF そのもの（1 ページ目）を撮る。
 * 指示書の検査表のように、画面に埋め込みプレビューを持たない帳票用。
 * 灰色の台に A4 を 1 枚置いた、PDF タブと同じ見た目の 1 枚にする。
 */
async function showPdfAlone(page: Page, url: string, maskBottom = 0): Promise<void> {
  const dataUrl = await pdfFirstPage(page, url, maskBottom);
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#e9ecef">
      <div id="shot-pdf" style="padding:16px;width:fit-content;margin:0 auto;background:#e9ecef">
        <img src="${dataUrl}" style="display:block;width:794px;background:white;box-shadow:0 2px 16px rgba(0,0,0,0.15)">
      </div></body></html>`,
    { waitUntil: "load" },
  );
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

    // 旧番号の URL（シードの書類）は正規の URL へ送られる。?tab= を落とさない。
    await gotoDoc(page, shot.path, { waitUntil: "networkidle" });
    if (shot.steps) await shot.steps(page);
    // PDF は画像に差し替えてから撮る（ヘッドレスは iframe の PDF を描かない）。
    if (shot.pdf) await showPdfAlone(page, shot.pdf, shot.pdfMaskBottom);
    else await rasterizePdfFrames(page, shot.pdfMaskBottom);
    const framing = shot.pdf
      ? ({ mode: "element", selector: "#shot-pdf" } as const)
      : await decideFraming(page, shot.clip, shot.fullPage);
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
    const path = join(OUT_DIR, shotFilename(shot.id));
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
