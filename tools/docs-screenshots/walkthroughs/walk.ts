/**
 * walk.ts — ウォークスルーの操作部品。**モード（check / record）を知っている唯一の場所。**
 *
 * 各ウォークスルーは `w.click(...)` `w.fill(...)` と書くだけで、
 *   check  … Playwright の操作をそのまま行う（待たない）
 *   record … カーソルを動かす → 赤枠で示す → 操作する → 一呼吸おく
 * のどちらにもなる。録画用の「間」をウォークスルー側に書かないのは、書いた瞬間に
 * 検査が同じだけ遅くなるから。
 *
 * 画面だけで操作する。SQL で状態を作らない — 既存の e2e-*.ts は承認や出荷書の作成を
 * `docker exec psql` で済ませているが、動画は実際の押し方を見せるものなので
 * 近道をすると嘘になる（録画用コンテナには docker も無い）。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { gotoDoc } from "../doc-number";
import type { WalkUser } from "./types";

export type WalkMode = "check" | "record";

/** storageState のファイル（global-setup.ts が作る）。 */
export const AUTH_STATE: Record<WalkUser, string> = {
  staff: ".auth/staff.json",
  approver: ".auth/state.json",
  admin: ".auth/admin.json",
};

/** 各役のユーザー名。global-setup.ts がログインに使うものと同じ env を読む。 */
const USER_LABEL: Record<WalkUser, string> = {
  staff: process.env.SHOT_STAFF_USERNAME ?? "demo2",
  approver: process.env.SHOT_USERNAME ?? "demo_shot",
  admin: process.env.SHOT_ADMIN_USERNAME ?? "demo1",
};

/**
 * 録画に写すカーソル。Playwright の録画には OS のカーソルが写らないので、
 * mousemove を拾って動く印をページに置く。pointer-events: none なので操作を奪わない。
 * check でも入れておく（入れたときだけ挙動が変わる、という差を作らない）。
 */
export const CURSOR_INIT_SCRIPT = `
(() => {
  if (window.__walkCursor) return;
  window.__walkCursor = true;
  const install = () => {
    if (document.getElementById("walk-cursor")) return;
    const dot = document.createElement("div");
    dot.id = "walk-cursor";
    dot.style.cssText = [
      "position:fixed", "left:0", "top:0", "width:22px", "height:22px",
      "margin:-11px 0 0 -11px", "border-radius:50%",
      "background:rgba(34,139,230,.35)", "border:2px solid #1c7ed6",
      "box-shadow:0 0 0 2px rgba(255,255,255,.9)",
      "z-index:2147483647", "pointer-events:none", "display:none",
      "transition:transform 80ms ease",
    ].join(";");
    document.documentElement.appendChild(dot);
    document.addEventListener("mousemove", (e) => {
      dot.style.display = "block";
      dot.style.left = e.clientX + "px";
      dot.style.top = e.clientY + "px";
    }, true);
    document.addEventListener("mousedown", () => { dot.style.transform = "scale(.7)"; }, true);
    document.addEventListener("mouseup", () => { dot.style.transform = "scale(1)"; }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
`;

/** 赤枠（screenshots.spec.ts の強調と同じ見た目。レイアウトを動かさない）。 */
const HIGHLIGHT_CSS = `
[data-walk-highlight] {
  outline: 3px solid #e03131 !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 6px rgba(224, 49, 49, .18) !important;
}`;

export interface Chapter {
  title: string;
  startMs: number;
}

/** 字幕 1 枚。次の字幕が始まるまで出す。 */
export interface Caption {
  text: string;
  startMs: number;
  /**
   * この字幕のあと最初に指した要素の、画面の中での高さ（0 = 上端 / 1 = 下端）。
   * 字幕を上下どちらに出すかを決めるのに使う（walkthroughs.spec.ts）— 既定の下に
   * 出すと、画面の下半分にある欄を案内している字幕が、当の欄を隠してしまう。
   * 録画のときだけ入る。
   */
  targetY?: number;
}

export class Walk {
  readonly chapters: Chapter[] = [];
  /**
   * 字幕。手順の見出し（章と同じ文）に加えて、`say()` で足した案内が入る —
   * 「この欄に何を入れるか」「別の場合はどうなるか」は字幕で伝える。
   */
  readonly captions: Caption[] = [];
  private stepNo = 0;
  private readonly t0 = Date.now();
  private cursor = { x: 640, y: 360 };

  constructor(
    readonly page: Page,
    readonly mode: WalkMode,
  ) {}

  get recording(): boolean {
    return this.mode === "record";
  }

  /** 録画開始からの経過（ms）。 */
  elapsedMs(): number {
    return Date.now() - this.t0;
  }

  /** 手順の区切り。字幕と章はここから作る。 */
  beginStep(caption: string): void {
    const startMs = this.elapsedMs();
    this.stepNo += 1;
    this.chapters.push({ title: caption, startMs });
    this.captions.push({ text: `${this.stepNo}. ${caption}`, startMs });
  }

  /**
   * 字幕で案内する。**操作の前に呼ぶ** — 「この欄には何を入れるか」を先に読んでから、
   * その入力が画面で起きるように。次の `say()` か次の手順まで出たままになる。
   *
   * 録画では読む時間だけ待つ（文字数に比例・上限あり）。check では待たない。
   * 1 枚は 2 行まで（`\n` で改行）。長い説明は 2 枚に分ける — 画面の下 1/3 を
   * 字幕が覆うと、説明している当の欄が見えなくなる。
   */
  async say(text: string): Promise<void> {
    this.captions.push({ text, startMs: this.elapsedMs() });
    if (this.recording) {
      const chars = text.replace(/\s/g, "").length;
      await this.page.waitForTimeout(Math.min(5200, 1100 + chars * 75));
    }
  }

  /** 録画のときだけ待つ。check では何もしない。 */
  async pace(ms = 900): Promise<void> {
    if (this.recording) await this.page.waitForTimeout(ms);
  }

  // ── 移動 ───────────────────────────────────────────────────────────────────

  async goto(path: string): Promise<void> {
    await gotoDoc(this.page, path, { waitUntil: "load" });
    await this.afterNavigation();
  }

  /**
   * 通信が落ち着くのを待つ。**ただし上限つき** — 詳細画面には PDF のプレビュー
   * （iframe → /api/pdf）のように長く開いたままの通信があり、試験環境には
   * レンダラ（Gotenberg）が無いので、素の networkidle は数分かかる。納品書の画面で
   * 実際に 4 分半待ち、動画がその間ずっと同じ画面を映していた。
   * 画面が使えるかどうかは、このあとの操作（要素が見えるまで待つ）が確かめる。
   */
  private async settle(): Promise<void> {
    await this.page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
  }

  /** 画面が切り替わったあとの共通処理（赤枠の CSS を入れ直し、読む間をおく）。 */
  private async afterNavigation(): Promise<void> {
    await this.settle();
    await this.page.addStyleTag({ content: HIGHLIGHT_CSS }).catch(() => undefined);
    await this.pace(1200);
  }

  /** URL がこの形になるまで待つ（保存後の詳細画面への遷移など）。 */
  async waitForUrl(url: RegExp): Promise<void> {
    await this.page.waitForURL(url, { timeout: 30_000, waitUntil: "commit" });
    await this.page.waitForLoadState("domcontentloaded");
    await this.afterNavigation();
  }

  // ── 操作 ───────────────────────────────────────────────────────────────────

  /** 録画のとき: カーソルを要素の中央へ動かし、赤枠で示す。 */
  private async pointAt(target: Locator): Promise<void> {
    await target.waitFor({ state: "visible", timeout: 20_000 });
    if (!this.recording) return;
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const dist = Math.hypot(x - this.cursor.x, y - this.cursor.y);
      await this.page.mouse.move(x, y, { steps: Math.max(8, Math.min(30, Math.round(dist / 25))) });
      this.cursor = { x, y };
      // いま出ている字幕が案内している相手の位置を控える（最初に指した 1 つだけ）。
      const caption = this.captions.at(-1);
      const height = this.page.viewportSize()?.height;
      if (caption && caption.targetY === undefined && height) caption.targetY = y / height;
    }
    await target.evaluate((el) => el.setAttribute("data-walk-highlight", "")).catch(() => undefined);
    await this.page.waitForTimeout(650);
  }

  private async unpoint(target: Locator): Promise<void> {
    if (!this.recording) return;
    // 押した結果その要素が消えていることは普通にある（メニュー項目・モーダルのボタン）。
    await target
      .evaluate((el) => el.removeAttribute("data-walk-highlight"), undefined, { timeout: 500 })
      .catch(() => undefined);
  }

  async click(target: Locator): Promise<void> {
    await this.pointAt(target);
    await target.click();
    await this.unpoint(target);
    await this.pace(500);
  }

  /** 入力する。録画では 1 文字ずつ打つ（何を入れたかが読める）。 */
  async fill(target: Locator, value: string): Promise<void> {
    await this.pointAt(target);
    if (this.recording) {
      // 全選択してから打つ（打った文字が選択範囲を置き換える）。先に空にすると
      // Mantine の NumberInput は 0 を入れ直すので、"30" が "300" になり、
      // check（fill で一度に入れる）と違う値が保存されてしまう。
      await target.click();
      await target.press("ControlOrMeta+A");
      await target.pressSequentially(value, { delay: 70 });
    } else {
      await target.fill(value);
    }
    await this.unpoint(target);
    await this.pace(400);
  }

  /**
   * Mantine の Select / SearchSelect から 1 つ選ぶ。`selectOption` は効かない
   * （素の <select> ではない）ので、開く → 絞り込む → 候補を押す。
   * search を渡すと入力して絞り込む（候補をサーバーから引く SearchSelect 用）。
   */
  async pick(
    combobox: Locator,
    option: string | RegExp,
    opts: { search?: string; exact?: boolean } = {},
  ): Promise<void> {
    await this.pointAt(combobox);
    await combobox.click();
    if (opts.search !== undefined) {
      if (this.recording) await combobox.pressSequentially(opts.search, { delay: 70 });
      else await combobox.fill(opts.search);
    }
    await this.unpoint(combobox);
    const item = this.page.getByRole("option", { name: option, exact: opts.exact }).first();
    await this.click(item);
  }

  /**
   * 日付を選ぶ（Mantine DatePickerInput — ボタンを押すとカレンダーが開く）。
   * 「今日」か「来月の N 日」しか選ばない: 録画はいつ走るか分からないので、
   * 固定の年月日を書くと過去の日付になって検証で弾かれる日が来る。
   */
  async pickDate(button: Locator, when: "today" | { nextMonthDay: number }): Promise<void> {
    await this.click(button);
    const calendar = this.page.locator("[data-dates-dropdown], .mantine-DatePickerInput-calendarHeader").first();
    await calendar.waitFor({ state: "visible", timeout: 10_000 });
    const popover = this.page.locator(".mantine-Popover-dropdown:visible, .mantine-Modal-content:visible").last();
    if (when === "today") {
      await this.click(popover.locator("button[data-today]").first());
      return;
    }
    await this.click(popover.locator("button[data-direction='next']").first());
    await this.click(
      popover
        .locator("button.mantine-DatePickerInput-day:not([data-outside])")
        .getByText(String(when.nextMonthDay), { exact: true })
        .first(),
    );
  }

  /** 詳細画面右上の「操作メニュー」（⋯）から項目を選ぶ。 */
  async menu(item: string | RegExp): Promise<void> {
    await this.click(this.page.getByRole("button", { name: "操作メニュー" }).first());
    await this.click(this.page.getByRole("menuitem", { name: item }).first());
  }

  /** 開いているモーダルの中のボタンを押す（背後に同名のボタンがあっても取り違えない）。 */
  async clickInDialog(name: string | RegExp, opts: { exact?: boolean } = {}): Promise<void> {
    const dialog = this.page.getByRole("dialog").last();
    await dialog.waitFor({ state: "visible", timeout: 20_000 });
    await this.pace(700);
    await this.click(dialog.getByRole("button", { name, exact: opts.exact ?? true }).first());
  }

  // ── 確認 ───────────────────────────────────────────────────────────────────

  /** この文言が画面に出るまで待つ（出なければ落ちる）。録画では赤枠で示して読ませる。 */
  async see(text: string | RegExp, opts: { exact?: boolean } = {}): Promise<void> {
    const target = this.page.getByText(text, { exact: opts.exact }).first();
    await expect(target).toBeVisible({ timeout: 30_000 });
    if (this.recording) {
      await this.pointAt(target);
      await this.page.waitForTimeout(900);
      await this.unpoint(target);
    }
  }

  /** 完了の通知（トースト）が出るまで待つ。 */
  async toast(text: string | RegExp): Promise<void> {
    await expect(this.page.getByText(text).first()).toBeVisible({ timeout: 30_000 });
    await this.pace(1200);
  }

  // ── ユーザーの切り替え ─────────────────────────────────────────────────────

  /**
   * 別のユーザーの画面へ切り替える（依頼した人と承認する人が違う場面）。
   * ログイン画面を通さず cookie を差し替える — ログインは 15 分に 5 回失敗で
   * 締め出されるので、global-setup.ts が 1 回だけ行ったものを使い回す。
   * 動画が途切れないよう、同じコンテキストのまま切り替える。
   */
  async switchUser(user: WalkUser, path: string): Promise<void> {
    const state = JSON.parse(readFileSync(join(process.cwd(), AUTH_STATE[user]), "utf8")) as {
      cookies: Parameters<ReturnType<Page["context"]>["addCookies"]>[0];
    };
    const context = this.page.context();
    // 先にいまの画面を離れる。開いたままだと、前のユーザーで飛んでいた通信の
    // 応答（セッションの延長 = Set-Cookie）が**差し替えたあと**に届き、cookie を
    // 前のユーザーへ戻してしまう。CI（遅い機械）で実際に起き、担当者に戻した
    // つもりの操作が承認者のまま記録されて、次の承認依頼で「自分で自分に依頼」になった。
    await this.page.goto("about:blank");
    await context.clearCookies();
    await context.addCookies(state.cookies);
    console.log(`[walk] switched to ${USER_LABEL[user]}`);
    await this.goto(path);
    // 差し替えが効いていることを、サーバーに「いま誰か」を聞いて確かめる（効いて
    // いなければその場で落とす — 数手順あとに別の理由で落ちると原因に辿り着けない）。
    // cookie の値は比べられない: セッションは暗号化した JWT で、リクエストのたびに
    // 発行し直されるので、同じ人でも値が変わる。
    const res = await this.page.request.get("/api/auth/session");
    const session = (await res.json().catch(() => null)) as { user?: { username?: string } } | null;
    if (session?.user?.username !== USER_LABEL[user]) {
      throw new Error(
        `ユーザーの切り替えが効いていない（${USER_LABEL[user]} のはずが ${session?.user?.username ?? "未ログイン"}）`,
      );
    }
  }
}
