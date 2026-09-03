/**
 * e2e-inspection-and-material.ts — ad-hoc Playwright check (not part of CI,
 * see tools/docs-screenshots/README.md「通し確認」/ memory
 * worktree-local-ui-verification) for two 2026-09 changes on 指示書:
 *
 *   1. 使用素材が製品の想定材種（材種 × 直径）からプリフィルされ、
 *      想定外の材種を選ぶと警告が出る（新規作成フォーム）。
 *   2. 検査表の割当がポップアップ（見る/編集）へ移り、書いただけでは
 *      保存されず「保存」を押すまでサーバーへ届かない。
 *
 * Run against the throwaway seeded DB (tools/docs-screenshots recipe):
 *   pnpm exec tsx e2e-inspection-and-material.ts
 */
import { chromium, type Page } from "@playwright/test";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const results: string[] = [];
let failed = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failed++;
  results.push(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(page: Page, user: string, pass: string): Promise<void> {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "開発用アカウントでログイン" }).click();
  await page.getByLabel("ユーザー名").fill(user);
  await page.getByLabel("パスワード", { exact: false }).first().fill(pass);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL(`${APP}/`, { timeout: 30_000 });
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    locale: "ja-JP",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await login(page, "demo1", "demo2026");

  // ═══════════════════════════════════════════════════════════════════════
  // 1. 使用素材のプリフィル + 想定外の材種の警告（指示書 新規作成）
  // ═══════════════════════════════════════════════════════════════════════
  await page.goto(`${APP}/production/work-orders/new`, {
    waitUntil: "networkidle",
  });

  // 対象: 在庫向け（注文明細なし）へ切り替え、製品を直接選ぶ
  await page.getByText("在庫向け（注文明細なし）", { exact: true }).click();
  await page.waitForTimeout(200);

  const productInput = page.getByPlaceholder("製品コード・名称で検索");
  await productInput.click();
  await productInput.fill("超硬エンドミル");
  await page.waitForTimeout(600);
  await page.getByRole("option", { name: /超硬エンドミル/ }).first().click();
  await page.waitForTimeout(900); // getWorkOrderMaterialAssumption の往復を待つ

  const materialInput = page.getByPlaceholder("素材コード・名称で検索");
  const materialValue = await materialInput.inputValue();
  check(
    "使用素材が製品の想定材種（材種×直径）からプリフィルされる",
    /^B01A0001-A060-310/.test(materialValue),
    `material input = "${materialValue}"`,
  );

  const mismatchBefore = await page
    .getByText("選択中の素材は製品の想定材種", { exact: false })
    .count();
  check("プリフィル直後は想定外の警告が出ない", mismatchBefore === 0);

  // 想定外の材種（B04A0001 系）へ手動で変更 → 警告が出る
  await materialInput.click();
  await materialInput.fill("B04A0001");
  await page.waitForTimeout(600);
  await page.getByRole("option", { name: /B04A0001/ }).first().click();
  await page.waitForTimeout(900); // getMaterialTypeSpec の往復を待つ

  const mismatchAfter = await page
    .getByText("選択中の素材は製品の想定材種", { exact: false })
    .count();
  check("想定外の材種へ変えると警告が出る", mismatchAfter > 0);

  // ═══════════════════════════════════════════════════════════════════════
  // 2. 検査表ポップアップ — 見る/編集モード・保存を押すまで書き込まない
  //    指示書 #9001 の段加工検査（STEP_INSPECTION, PENDING）で確認する。
  // ═══════════════════════════════════════════════════════════════════════
  const stepUrl = `${APP}/production/work-orders/9001/steps/dc011000-0000-4000-8000-000000000005`;
  await page.goto(stepUrl, { waitUntil: "networkidle" });

  check(
    "工程詳細ページに検査表セクションがある",
    (await page.getByText("検査表", { exact: true }).count()) > 0,
  );
  check(
    "初期状態は未割当（work_order_step_inspection_templates に行が無い）",
    (await page.getByText("検査表が割り当てられていません").count()) > 0,
  );

  await page.getByRole("button", { name: "検査表を見る" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  check(
    "ポップアップは既定で閲覧モードで開く（未割当の空状態を表示）",
    (await dialog.getByText("検査表が割り当てられていません").count()) > 0,
  );
  check(
    "閲覧モードのボタンは「編集」",
    (await dialog.getByRole("button", { name: "編集" }).count()) > 0,
  );

  // 編集モードへ
  await dialog.getByRole("button", { name: "編集" }).click();
  const multiSelect = dialog.getByLabel("検査表");
  await multiSelect.click();
  await page.waitForTimeout(400);
  await page.getByRole("option", { name: /DEMO-INS-01/ }).first().click();
  await page.keyboard.press("Escape"); // MultiSelect のドロップダウンを閉じる
  await page.waitForTimeout(200);

  // ここではまだ書いただけ — キャンセルで下書きを捨てる（保存されない）
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await page.waitForTimeout(300);
  check(
    "キャンセルは下書きを保存せず閲覧モードへ戻す",
    (await dialog.getByText("検査表が割り当てられていません").count()) > 0,
  );
  await page.getByRole("button", { name: "閉じる" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.reload({ waitUntil: "networkidle" });
  check(
    "リロード後も未割当のまま（キャンセルはサーバーへ届いていない）",
    (await page.getByText("検査表が割り当てられていません").count()) > 0,
  );

  // 今度は保存する
  await page.getByRole("button", { name: "検査表を見る" }).click();
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "編集" }).click();
  await dialog.getByLabel("検査表").click();
  await page.waitForTimeout(400);
  await page.getByRole("option", { name: /DEMO-INS-01/ }).first().click();
  await page.keyboard.press("Escape"); // MultiSelect のドロップダウンを閉じる
  await page.waitForTimeout(200);
  await dialog.getByRole("button", { name: "保存" }).click();
  await page.waitForTimeout(1200);
  check(
    "保存を押すと閲覧モードへ戻り、割り当てた検査表が表示される",
    (await dialog.getByText(/DEMO-INS-01/).count()) > 0,
  );
  await page.getByRole("button", { name: "閉じる" }).click();
  await dialog.waitFor({ state: "hidden" });

  await page.reload({ waitUntil: "networkidle" });
  check(
    "リロード後も保存した検査表の割当が残る（サーバーに永続化された）",
    (await page.locator("text=/DEMO-INS-01/").count()) > 0,
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
