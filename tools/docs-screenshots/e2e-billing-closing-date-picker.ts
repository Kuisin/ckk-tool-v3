/**
 * e2e-billing-closing-date-picker.ts — ad-hoc Playwright check (not part of
 * CI, see tools/docs-screenshots/README.md「通し確認」/ memory
 * worktree-local-ui-verification) for the 締日処理 実行 モーダル
 * (RunClosingModal, ClosingTable.tsx) の DatePickerInput.
 *
 * Regression this guards: @mantine/dates v9 normalizes all values to
 * "YYYY-MM-DD" strings (DateStringValue) — onChange fires with a string,
 * never a Date. The modal used to cast that string `as unknown as Date` and
 * call `.getFullYear()`/`.getMonth()`/`.getDate()` on it, which throws at
 * runtime (the string has no such methods), so clicking any day in the
 * calendar crashed the onChange handler and the displayed date never
 * updated — "date selection not working". Fixed by passing/receiving the
 * ISO string directly (no Date round-trip).
 *
 * Run against the throwaway seeded DB (tools/docs-screenshots recipe):
 *   pnpm exec tsx e2e-billing-closing-date-picker.ts
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const results: string[] = [];
let failed = 0;
/** 画面の写しを残す先（省略時は残さない）。 */
const SHOT_DIR = process.env.SHOT_DIR;
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  const path = `${SHOT_DIR}/${name}.png`;
  // モーダルが開いている間は表示領域ぶんで撮る。
  const overlay = await page.locator(".mantine-Modal-content:visible").count();
  const size = page.viewportSize();
  if (overlay > 0 || !size) {
    if (overlay > 0) await page.waitForTimeout(400); // 開く・入れ替わるアニメーションが終わってから
    await page.screenshot({ path });
    return;
  }
  // 全高で撮る。**fullPage: true は使わない** — Playwright は撮る前に表示領域を一瞬
  // 1×1 にするので、幅で配置を切り替える画面（工程実行の 2 ペイン = MasterDetailShell）
  // が作り直され、開いたばかりのモーダルや入力途中の値が消える（実際に踏んだ）。
  // 幅は変えずに高さだけ伸ばして撮り、元に戻す。
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: size.width, height: Math.min(Math.max(size.height, height), 8000) });
  await page.screenshot({ path });
  await page.setViewportSize(size);
}

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

/** dayjs ja ロケールでの月名（"9月" のように前ゼロなし）。 */
function jaMonth(month1to12: number): string {
  return `${month1to12}月`;
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

  // ═══════════════════════════════════════════════════════════════════════
  // 締日処理 実行モーダル — DatePickerInput で日付をクリックすると
  // 表示が実際に切り替わること（+ 例外が飛ばないこと）
  // ═══════════════════════════════════════════════════════════════════════
  await page.goto(`${APP}/billing/closings`, { waitUntil: "networkidle" });

  await shot(page, "01-closings-list");
  await page.getByRole("button", { name: "締日処理を実行" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  check(
    "モーダルが開く（締日処理の実行）",
    (await dialog.getByText("締日処理の実行", { exact: true }).count()) > 0,
  );

  const dateField = dialog.getByLabel("指定日");
  const initialText = (await dateField.textContent())?.trim() ?? "";
  check(
    "初期値は今日の日付（YYYY/MM/DD 表示）",
    /^\d{4}\/\d{2}\/\d{2}$/.test(initialText),
    `initial = "${initialText}"`,
  );

  await shot(page, "02-run-modal-today");
  // カレンダーを開く
  await dateField.click();

  // 表示中の月から、今日とは違う日を選ぶ（1 日 → 今日が 1 日なら 2 日）。
  // aria-label は dayjs(date).locale("ja").format("D MMMM YYYY")（DatesProvider
  // の locale=ja + dayjs ja ロケールの months = "1月".."12月"）。
  const now = new Date();
  const targetDay = now.getDate() === 1 ? 2 : 1;
  const targetLabel = `${targetDay} ${jaMonth(now.getMonth() + 1)} ${now.getFullYear()}`;
  const targetDayButton = page.getByRole("button", {
    name: targetLabel,
    exact: true,
  });
  await targetDayButton.waitFor({ state: "visible", timeout: 5_000 });
  await shot(page, "03-calendar-open");
  await targetDayButton.click();

  // ポップオーバーは選択で閉じる（closeOnChange 既定 true）
  await targetDayButton.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});

  await shot(page, "04-date-picked");
  const updatedText = (await dateField.textContent())?.trim() ?? "";
  const expectedText = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(targetDay).padStart(2, "0")}`;
  check(
    "日付をクリックすると表示が選んだ日付に切り替わる（バグ修正前は変わらなかった）",
    updatedText === expectedText,
    `updated = "${updatedText}", expected = "${expectedText}"`,
  );

  check(
    "onChange で例外が発生していない（value を Date として扱う不整合の再発防止）",
    pageErrors.length === 0,
    pageErrors.join(" | "),
  );

  // URL にも指定日が反映される（useUrlStringState）
  const url = new URL(page.url());
  const expectedIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
  check(
    "選んだ日付が URL の date パラメータへ反映される",
    url.searchParams.get("date") === expectedIso,
    `date param = "${url.searchParams.get("date")}"`,
  );

  // ── 結果 ──────────────────────────────────────────────────────────────
  console.log("");
  // 結果は check() が 1 件ずつ出している（ここで並べ直すと、標準出力を読む側 —
  // scripts/scenarios.ts — が同じチェックを 2 回数える）。
  console.log("");
  console.log(failed === 0 ? `ALL PASS (${results.length})` : `${failed} FAILED / ${results.length}`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
