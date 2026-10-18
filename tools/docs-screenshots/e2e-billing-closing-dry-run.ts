/**
 * e2e-billing-closing-dry-run.ts — ad-hoc Playwright check (not part of CI,
 * see README「通し確認」/ memory worktree-local-ui-verification) for the
 * 締日処理 (BL02) の「実行は今日まで + 試算は未来日も見られる」規則。
 *
 * What this guards:
 *   runClosing は 1 回の実行で **2 つの時計**を見ていた — 候補集めは指定日
 *   (collectClosingCandidatesUpTo)、請求書を作ってよいかは実際の今日
 *   (closingDateReached)。未来日を指定すると締日行だけができて請求書はできず、
 *   しかも生成の見送りは黙った `continue` なので画面には「作成 1 件」とだけ
 *   出て一覧が空になった（理由がどこにも出ない）。
 *   対策は 2 つで、その両方をここで確かめる:
 *     1. 実行モーダルの指定日は**今日まで**（maxDate + サーバー側 guard）
 *     2. 先を見たいときは**試算**（未来日可・DB には何も書かない）
 *
 * Run against the throwaway seeded DB:
 *   APP_URL=http://localhost:3137 pnpm exec tsx e2e-billing-closing-dry-run.ts
 */
import { execFileSync } from "node:child_process";
import { chromium, type Page } from "@playwright/test";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const DB_CONTAINER = process.env.SHOT_DB_CONTAINER ?? "ckk-shots-db";
const results: string[] = [];
let failed = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(page: Page, user: string, pass: string): Promise<void> {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "開発用アカウントでログイン" }).click();
  await page.getByLabel("ユーザー名").fill(user);
  await page.getByLabel("パスワード", { exact: false }).first().fill(pass);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL(`${APP}/`, { timeout: 30_000 });
}

/** dayjs ja ロケールの日ボタン aria-label（"21 9月 2026"）。 */
function dayLabel(d: Date): string {
  return `${d.getDate()} ${d.getMonth() + 1}月 ${d.getFullYear()}`;
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    locale: "ja-JP",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await login(page, "demo1", "demo2026");

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const crossesMonth = tomorrow.getMonth() !== today.getMonth();

  await page.goto(`${APP}/billing/closings`, { waitUntil: "networkidle" });

  // ═════════════════════════════════════════════════════════════════════════
  // 1. 実行モーダル — 未来日（明日）は選べない
  // ═════════════════════════════════════════════════════════════════════════
  await page.getByRole("button", { name: "締日処理を実行" }).click();
  const runDialog = page.getByRole("dialog");
  await runDialog.waitFor({ state: "visible" });

  await runDialog.getByLabel("指定日").click();
  if (crossesMonth) {
    await page.getByRole("button", { name: "Next month" }).click();
  }
  const tomorrowInRun = page.getByRole("button", {
    name: dayLabel(tomorrow),
    exact: true,
  });
  await tomorrowInRun.waitFor({ state: "visible", timeout: 5_000 });
  check(
    "実行モーダル: 明日（未来日）は選べない（maxDate = 今日）",
    await tomorrowInRun.isDisabled(),
    `disabled = ${await tomorrowInRun.isDisabled()}`,
  );
  const todayInRun = page.getByRole("button", {
    name: dayLabel(today),
    exact: true,
  });
  check(
    "実行モーダル: 今日は選べる（今日までは実行してよい）",
    !(await todayInRun.isDisabled()),
  );
  await page.keyboard.press("Escape"); // カレンダーを閉じる
  await runDialog.getByRole("button", { name: "キャンセル" }).click();
  await runDialog.waitFor({ state: "hidden", timeout: 5_000 });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. 試算モーダル — 未来日を選べて、結果が出る（DB には書かない）
  // ═════════════════════════════════════════════════════════════════════════
  await page.getByRole("button", { name: "試算", exact: true }).click();
  const simDialog = page.getByRole("dialog");
  await simDialog.waitFor({ state: "visible" });
  check(
    "試算モーダルが開く",
    (await simDialog.getByText("締日処理の試算", { exact: true }).count()) > 0,
  );

  await simDialog.getByLabel("指定日").click();
  if (crossesMonth) {
    await page.getByRole("button", { name: "Next month" }).click();
  }
  const tomorrowInSim = page.getByRole("button", {
    name: dayLabel(tomorrow),
    exact: true,
  });
  await tomorrowInSim.waitFor({ state: "visible", timeout: 5_000 });
  check(
    "試算モーダル: 明日（未来日）を選べる（ここだけ未来を許す）",
    !(await tomorrowInSim.isDisabled()),
  );
  await tomorrowInSim.click();

  const expectedText = `${tomorrow.getFullYear()}/${String(tomorrow.getMonth() + 1).padStart(2, "0")}/${String(tomorrow.getDate()).padStart(2, "0")}`;
  check(
    "試算モーダル: 選んだ未来日が表示に反映される",
    (await simDialog.getByLabel("指定日").textContent())?.trim() ===
      expectedText,
  );

  // 試算を実行（サーバーアクション simulateClosing）
  await simDialog.getByRole("button", { name: "試算", exact: true }).click();
  // 結果は 件数サマリ か「締まる分はありません」のどちらかが必ず出る
  const summary = simDialog.getByText(/締日 \d+ 件/);
  const nothing = simDialog.getByText("締まる分はありません", { exact: true });
  await Promise.race([
    summary.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {}),
    nothing.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {}),
  ]);
  const hasSummary = (await summary.count()) > 0;
  const hasNothing = (await nothing.count()) > 0;
  check(
    "試算: 結果が表示される（件数サマリ または 締まる分なし）",
    hasSummary || hasNothing,
    hasSummary ? await summary.first().innerText() : "締まる分はありません",
  );
  if (hasSummary) {
    console.log(
      `      内訳: ${(await simDialog.getByText(/請求書 \d+ 件/).first().innerText().catch(() => "-"))}`,
    );
  }

  check(
    "試算で例外が発生していない",
    pageErrors.length === 0,
    pageErrors.join(" | "),
  );

  // ═════════════════════════════════════════════════════════════════════════
  // 3. 試算は DB に書かない — 一覧の件数が変わらないこと
  // ═════════════════════════════════════════════════════════════════════════
  // 画面の件数ではなく **DB を直接数える** — 締日行が増えていないことは
  // 一覧の見た目からは確かめられない（試算の結果はモーダルの中だけなので、
  // 一覧が変わらなくても「書いていない」ことの証明にならない）。
  const countClosings = (): number =>
    Number(
      execFileSync("docker", [
        "exec",
        DB_CONTAINER,
        "psql",
        "-U",
        "postgres",
        "-d",
        "ckk",
        "-tAc",
        "select count(*) from app.billing_closings",
      ])
        .toString()
        .trim(),
    );
  const before = countClosings();
  await simDialog.getByRole("button", { name: "試算", exact: true }).click();
  await page.waitForTimeout(2_000);
  const after = countClosings();
  check(
    "試算を 2 回走らせても締日行は DB 上で増えない（読むだけ）",
    before === after && Number.isFinite(before),
    `billing_closings: before = ${before}, after = ${after}`,
  );

  console.log("");
  console.log(results.join("\n"));
  console.log("");
  console.log(
    failed === 0 ? `ALL PASS (${results.length})` : `${failed} FAILED / ${results.length}`,
  );
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
