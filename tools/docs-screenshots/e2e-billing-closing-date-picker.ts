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
import { chromium, type Page } from "@playwright/test";

const APP = process.env.APP_URL ?? "http://localhost:3100";
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
  await targetDayButton.click();

  // ポップオーバーは選択で閉じる（closeOnChange 既定 true）
  await targetDayButton.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});

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
  console.log(results.join("\n"));
  console.log("");
  console.log(failed === 0 ? `ALL PASS (${results.length})` : `${failed} FAILED / ${results.length}`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
