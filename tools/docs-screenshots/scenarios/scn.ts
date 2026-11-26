/**
 * scn.ts — シナリオの操作部品。ウォークスルーの `Walk`（click / fill / pick / see …）に、
 * **画面を撮る・確かめた結果を残す・DB を覗く**を足したもの。
 *
 *   s.shot("ラベル")            いまの画面を撮る（手順の終わりには自動で 1 枚撮る）
 *   s.check("名前", 条件, 実測) 確かめた結果を残す。**落ちても止めない** — 1 回の実行で
 *                               見つかる問題を全部並べたいので。止めたいときは throw する
 *   s.sql("select …")           この 1 本の DB を psql で引く（-tA。1 行 = 1 要素は sqlRows）
 *   s.pdf("ラベル", "/api/pdf/…") PDF を取って 1 ページ目を画像にし、本文の文字を返す
 *   s.openKiosk()               共有端末アプリにログイン済みのページを開く
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { Walk } from "../walkthroughs/walk";
import type { CheckResult, ShotResult } from "./types";

/** 全高で撮るときの固定要素の始末（screenshots.spec.ts の FULL_HEIGHT_CSS と同じ考え方）。 */
const FULL_HEIGHT_CSS = `
  .mantine-AppShell-footer { display: none !important; }
  .mantine-AppShell-main { padding-bottom: 0 !important; }
  .form-actions { position: static !important; }
`;

/** 開いている間は表示領域ぶんで撮るもの（全高にするとポータルの中身が写らない）。 */
const OVERLAY = [
  ".mantine-Modal-content",
  ".mantine-Drawer-content",
  ".mantine-Menu-dropdown",
  ".mantine-Popover-dropdown",
  ".mantine-Combobox-dropdown",
]
  .map((s) => `${s}:visible`)
  .join(", ");

/** 全高で撮るときの高さの上限（px）。これより長い画面は先頭からここまで。 */
const MAX_SHOT_HEIGHT = 9000;

/** 撮影用の端末トークンとカード（shared-db/sql/kiosk-shot-seed.sql）。 */
const KIOSK_DEVICE_TOKEN = "ckk-shot-device-token-fixed-0001";
const KIOSK_CARD_ID = "SHT1234567890ABC";
const KIOSK_PIN = "4321";

export interface ScnEnv {
  /** 画像の書き出し先（<out>/<id>）。 */
  outDir: string;
  dbContainer: string;
  dbName: string;
  kioskUrl?: string;
}

export class Scn extends Walk {
  /** いまの手順の記録（scenarios.spec.ts が手順ごとに差し替える）。 */
  checks: CheckResult[] = [];
  shots: ShotResult[] = [];
  private shotNo = 0;
  private kioskContext?: BrowserContext;
  /** 直前の `pdf()` で取った PDF のバイト列（画像の有無など、文字にならないものを調べる用）。 */
  lastPdf: Buffer | null = null;

  constructor(
    page: Page,
    readonly env: ScnEnv,
  ) {
    super(page, "check");
    mkdirSync(env.outDir, { recursive: true });
  }

  // ── 撮る ───────────────────────────────────────────────────────────────────

  /**
   * いまの画面を撮る。モーダルやメニューが開いていれば表示領域ぶん、そうでなければ
   * 全高（下が切れると「保存したあと何が出たか」が読めない）。
   * `target` に別のページ（共有端末）を渡すとそちらを撮る。
   */
  /**
   * 撮るのは**落ち着いた画面** — `animations: "disabled"` で CSS の遷移を終わらせて
   * から撮る。入力した直後に撮ると、エラーの赤枠が消えていく途中（border-color の
   * 遷移）が写り、直ったはずの入力欄が赤いままに見えた（分類する のモーダル）。
   */
  async shot(label: string, target: Page = this.page): Promise<void> {
    this.shotNo += 1;
    const file = `${String(this.shotNo).padStart(2, "0")}.jpg`;
    const path = join(this.env.outDir, file);
    try {
      const overlay = await target.locator(OVERLAY).count();
      const size = target.viewportSize();
      if (overlay > 0 || !size) {
        await target.screenshot({ path, type: "jpeg", quality: 72, animations: "disabled" });
      } else {
        // 全高は **幅をそのままに、表示領域の高さだけ伸ばして**撮る。
        // Playwright の `fullPage: true` は撮る瞬間に表示領域を作り直すので、
        // 幅で出し分けている画面（768px 未満 = 携帯の並び）が一瞬切り替わり、
        // 入力途中の値が消えることがある（工程の実行画面で実際に消えた）。
        // 高さだけなら並びは変わらない。固定ヘッダーが途中に写ることも無い。
        const style = await target.addStyleTag({ content: FULL_HEIGHT_CSS }).catch(() => null);
        const { height, scrollY } = await target.evaluate(() => ({
          height: document.documentElement.scrollHeight,
          scrollY: window.scrollY,
        }));
        const tall = Math.min(Math.max(size.height, height), MAX_SHOT_HEIGHT);
        if (tall !== size.height) await target.setViewportSize({ width: size.width, height: tall });
        await target.screenshot({ path, type: "jpeg", quality: 72, animations: "disabled" });
        if (tall !== size.height) await target.setViewportSize(size);
        if (scrollY > 0) await target.evaluate((y) => window.scrollTo(0, y), scrollY).catch(() => undefined);
        await style?.evaluate((el) => (el as Element).remove()).catch(() => undefined);
      }
      this.shots.push({ file, label });
    } catch (e) {
      // 撮れなかったことで手順を落とさない（遷移の途中など）。記録だけ残す。
      this.checks.push({ name: `画面を撮る: ${label}`, ok: false, actual: String(e).slice(0, 200) });
    }
  }

  // ── 確かめる ───────────────────────────────────────────────────────────────

  /** 確かめた結果を残す。落ちても止めない。実測値は必ず渡す（落ちたとき原因を追える）。 */
  check(name: string, ok: boolean, actual?: unknown): boolean {
    const text =
      actual === undefined ? undefined : typeof actual === "string" ? actual : JSON.stringify(actual);
    this.checks.push({ name, ok, actual: text?.slice(0, 600) });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${text === undefined ? "" : `  → ${text.slice(0, 200)}`}`);
    return ok;
  }

  /** この文言が画面に見えているか（待たない版は wait: 0）。結果を check として残す。 */
  async checkVisible(name: string, text: string | RegExp, opts: { exact?: boolean; wait?: number } = {}): Promise<boolean> {
    const target = this.page.getByText(text, { exact: opts.exact }).first();
    const ok = await target
      .waitFor({ state: "visible", timeout: opts.wait ?? 10_000 })
      .then(() => true)
      .catch(() => false);
    return this.check(name, ok, ok ? String(text) : `見つからない: ${String(text)} @ ${this.page.url()}`);
  }

  /** この文言が画面に**無い**こと。 */
  async checkHidden(name: string, text: string | RegExp, opts: { exact?: boolean } = {}): Promise<boolean> {
    const n = await this.page.getByText(text, { exact: opts.exact }).count();
    return this.check(name, n === 0, `${n} 件`);
  }

  // ── DB ─────────────────────────────────────────────────────────────────────

  private psql(args: string[], input?: string): string {
    return execFileSync(
      "docker",
      ["exec", "-i", this.env.dbContainer, "psql", "-U", "postgres", "-d", this.env.dbName, "-v", "ON_ERROR_STOP=1", ...args],
      { input, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    ).trim();
  }

  /** 1 つの値（または 1 行）を引く。列は `|` 区切り。 */
  sql(query: string): string {
    return this.psql(["-tAc", query]);
  }

  /** 複数行を引く（1 行 = 1 要素。列は `|` 区切り）。 */
  sqlRows(query: string): string[] {
    const out = this.sql(query);
    return out === "" ? [] : out.split("\n");
  }

  /** 状態を書き換える SQL を流す（準備用。確かめる対象の操作は画面で行うこと）。 */
  sqlExec(script: string): void {
    this.psql(["-q", "-f", "-"], script);
  }

  // ── PDF ────────────────────────────────────────────────────────────────────

  /**
   * PDF を取り、1 ページ目を画像にして手順に載せ、本文の文字を返す。
   * シナリオに `pdf: true` が要る（Gotenberg を起動する）。
   * 取れなかったときは check を FAIL で残して空文字を返す。
   */
  async pdf(label: string, path: string): Promise<string> {
    const res = await this.page.request.get(path, { timeout: 60_000 });
    const type = res.headers()["content-type"] ?? "";
    this.lastPdf = null;
    if (!res.ok() || !type.includes("pdf")) {
      this.check(`PDF を取得: ${label}`, false, `${res.status()} ${type} ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return "";
    }
    this.shotNo += 1;
    const base = String(this.shotNo).padStart(2, "0");
    const pdfPath = join(this.env.outDir, `${base}.pdf`);
    this.lastPdf = await res.body();
    writeFileSync(pdfPath, this.lastPdf);
    let text = "";
    try {
      text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" });
      execFileSync("gs", [
        "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=jpeg", "-dJPEGQ=80", "-r110",
        "-dFirstPage=1", "-dLastPage=1", `-sOutputFile=${join(this.env.outDir, `${base}.jpg`)}`, pdfPath,
      ]);
      this.shots.push({ file: `${base}.jpg`, label: `${label}（PDF 1 ページ目）` });
    } catch (e) {
      this.check(`PDF を画像にする: ${label}`, false, String(e).slice(0, 200));
    }
    return text;
  }

  // ── 共有端末 ───────────────────────────────────────────────────────────────

  get kioskUrl(): string {
    if (!this.env.kioskUrl) throw new Error("シナリオに kiosk: true が無い（共有端末アプリを起動していない）");
    return this.env.kioskUrl;
  }

  /**
   * 共有端末アプリを、撮影用の端末 + カード（demo_shot・PIN 4321）でログインして開く。
   * 返したページは `s.shot("…", page)` で撮れる。同じシナリオの中では 1 つを使い回す。
   */
  async openKiosk(path = "/"): Promise<Page> {
    const browser = this.page.context().browser();
    if (!browser) throw new Error("browser が無い");
    if (!this.kioskContext) {
      this.kioskContext = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        hasTouch: true,
        locale: "ja-JP",
        timezoneId: "Asia/Tokyo",
      });
      await this.kioskContext.addCookies([{ name: "kiosk_device", value: KIOSK_DEVICE_TOKEN, url: this.kioskUrl }]);
      const p = await this.kioskContext.newPage();
      await p.goto(`${this.kioskUrl}/login`, { waitUntil: "networkidle" });
      const access = await p.request.post(`${this.kioskUrl}/api/qr/access`, { data: { cardId: KIOSK_CARD_ID } });
      const { ticket } = (await access.json()) as { ticket?: string };
      if (!ticket) throw new Error(`共有端末のログインに失敗（/api/qr/access → ${access.status()}）`);
      const pin = await p.request.post(`${this.kioskUrl}/api/kiosk/pin`, {
        data: { ticket, purpose: "PIN_VERIFY", pin: KIOSK_PIN },
      });
      if (!pin.ok()) throw new Error(`共有端末の PIN 確認に失敗（${pin.status()}）`);
      await p.close();
    }
    const page = await this.kioskContext.newPage();
    await page.goto(`${this.kioskUrl}${path}`, { waitUntil: "networkidle" });
    return page;
  }

  async dispose(): Promise<void> {
    await this.kioskContext?.close().catch(() => undefined);
  }
}
