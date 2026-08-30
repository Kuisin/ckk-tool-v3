/**
 * smoke-flows.ts — 一時 DB + 本番ビルドに対して、画面を実際に操作して通しで
 * 確かめる（使い方は README「通し確認」）。撮影パイプラインとは別物で、
 * 動かすのは人が「今の変更を通しで見たい」ときだけ。CI では動かさない。
 *
 * いま見ているもの:
 *   1. AppTabs — 幅に収まらないときだけドロップダウンへ畳み、広げると戻る
 *   2. 承認・予定 (CM01) のタブ表示設定（個人ごと）
 *   3. 申請・報告フォームの完了通知（共有設定 → 提出 → CM01 → 既読）
 *
 * 落ちたときに原因を追えるよう、check() には**実測値**（URL・幅・ラベル）を
 * 添えること。合否だけだと「なぜ」が残らない。
 */
import { chromium, type Page } from "@playwright/test";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const results: string[] = [];
let failed = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failed++;
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
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

/** 横並び・ドロップダウンのどちらでもタブを選ぶ。 */
async function selectTab(page: Page, name: string | RegExp): Promise<void> {
  const menuButton = page.locator('.app-tabs-bar button[aria-haspopup="menu"]');
  if (await menuButton.count()) {
    await menuButton.click();
    await page.waitForTimeout(300);
    await page.getByRole("menuitem", { name }).click();
  } else {
    await page.getByRole("tab", { name }).click();
  }
  await page.waitForTimeout(400);
}

/** 畳まれているか（AppTabs は畳むとタブ列に .app-tabs-measure を付ける）。 */
async function collapsed(page: Page): Promise<boolean> {
  return (await page.locator(".app-tabs-measure").count()) > 0;
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const admin = await browser.newContext({
    locale: "ja-JP",
    viewport: { width: 1440, height: 900 },
  });
  const page = await admin.newPage();
  await login(page, "demo1", "demo2026");

  // ── 1. AppTabs: 広い画面では横並び ──────────────────────────────────
  await page.goto(`${APP}/general/tasks`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const wideTabs = await page.locator('[role="tab"]:visible').count();
  check("CM01: 広い画面ではタブが横並び", !(await collapsed(page)) && wideTabs > 1, `タブ ${wideTabs} 枚`);

  // ── 2. AppTabs: 狭い画面ではドロップダウン ─────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const isCollapsed = await collapsed(page);
  // ドロップダウンの見出しボタン（タブ列のボタンは畳むと不可視になる）
  const menuButton = page.locator('.app-tabs-bar button[aria-haspopup="menu"]');
  const label = (await menuButton.count()) ? await menuButton.innerText() : "";
  check(
    "CM01: 狭い画面ではドロップダウンへ畳む",
    isCollapsed && (await menuButton.isVisible()),
    `見出し「${label.trim()}」`,
  );
  check(
    "CM01: 見出しに開いているタブが出る",
    label.includes("作業予定"),
    label.trim(),
  );

  // 畳んだ状態でタブを切り替えられる
  await menuButton.click();
  await page.waitForTimeout(300);
  const item = page.getByRole("menuitem", { name: "文書のコメント" });
  const hasItem = await item.count();
  if (hasItem) await item.click();
  await page.waitForTimeout(600);
  check(
    "CM01: 畳んだ状態でタブを選ぶと中身が切り替わる",
    hasItem > 0 && page.url().includes("tab=comments"),
    page.url(),
  );

  // ── 3. 広げると横並びへ戻る ────────────────────────────────────────
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(600);
  check("CM01: 広げると横並びに戻る", !(await collapsed(page)));

  // ── 4. 書類詳細でも不変条件（収まらないときだけ畳む）が成り立つ ────
  await page.goto(`${APP}/master/business-partners`, { waitUntil: "networkidle" });
  const firstBp = page.locator("tbody tr").first();
  if (await firstBp.count()) {
    await firstBp.click();
    await page.waitForLoadState("networkidle");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(600);
      const m = await page.evaluate(() => {
        const bar = document.querySelector(".app-tabs-bar") as HTMLElement | null;
        const list = document.querySelector('[role="tablist"]') as HTMLElement | null;
        return {
          avail: bar?.clientWidth ?? 0,
          needed: list?.scrollWidth ?? 0,
          collapsed: !!document.querySelector(".app-tabs-measure"),
        };
      });
      check(
        `取引先 詳細 ${width}px: 収まらないときだけ畳む`,
        m.collapsed === m.needed > m.avail,
        `必要 ${m.needed}px / 使える ${m.avail}px → ${m.collapsed ? "ドロップダウン" : "横並び"}`,
      );
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  } else {
    check("取引先 詳細: 一覧に行が無く未確認", false, "demo データ無し");
  }

  // ── 5. CM01 タブの表示/非表示（個人設定）────────────────────────────
  await page.goto(`${APP}/general/tasks`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "表示するタブ" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("checkbox", { name: "文書のコメント" }).uncheck();
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForTimeout(1200);
  await page.goto(`${APP}/general/tasks`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const labels = await page.locator('[role="tab"]:visible').allInnerTexts();
  check(
    "CM01: 隠したタブが再読み込み後も出ない",
    !labels.some((l) => l.includes("文書のコメント")),
    labels.join(" / "),
  );

  // 隠したタブの URL を踏んでも空白にならない（先頭タブへ落ちる）
  await page.goto(`${APP}/general/tasks?tab=comments`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const activeTab = await page
    .locator('[role="tab"][aria-selected="true"]')
    .first()
    .innerText();
  check("CM01: 隠したタブの URL は先頭タブへ落ちる", activeTab.includes("作業予定"), activeTab);

  // 元に戻す
  await page.goto(`${APP}/general/tasks`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "表示するタブ" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("checkbox", { name: "文書のコメント" }).check();
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForTimeout(1000);

  // ── 6. 申請・報告の完了通知（PR #656）を通しで ─────────────────────
  //    demo1 がフォームを作り、共有先（demo1 本人）に「完了通知」を付ける。
  //    demo2 が提出 → demo1 に通知が届き、CM01 の「完了した申請」に出る。
  const title = `E2E 完了通知 ${Date.now()}`;
  await page.goto(`${APP}/general/forms/new`, { waitUntil: "networkidle" });
  await page.getByLabel("タイトル").fill(title);
  await page.getByRole("combobox", { name: "種類" }).click();
  await page.getByRole("option", { name: /申請・報告/ }).click();
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(/\/general\/forms\/[^/]+\/edit/, { timeout: 30_000 });
  const code = /forms\/([^/]+)\/edit/.exec(page.url())?.[1] ?? "";

  // 追加した項目は既定のラベル（「項目 1」）のまま使う — 目的は完了通知の
  // 経路の確認なので、項目の中身は問わない。
  await page.getByRole("button", { name: "項目を追加" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(`${APP}/general/forms/${code}`, { timeout: 30_000 });
  check("フォーム作成: 申請・報告フォームを作れる", !!code, code);

  // 項目を保存した時点で公開される（publishFormFields が status を上げる）。
  // まだ下書きなら押す。
  await page.getByRole("button", { name: "操作メニュー" }).click();
  await page.waitForTimeout(500);
  const publishItem = page.getByRole("menuitem", { name: "公開する" });
  const alreadyPublished = (await publishItem.count()) === 0;
  if (!alreadyPublished) {
    await publishItem.click();
    await page.waitForTimeout(1500);
  } else {
    await page.keyboard.press("Escape");
  }
  check("フォーム: 項目を保存すると公開される", alreadyPublished);

  // 共有設定（スマホ幅のカード表示で操作する — ラベルが出るので選びやすい。
  // 畳んだタブの選択も、この経路で一緒に確かめられる）。
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${APP}/general/forms/${code}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await selectTab(page, "共有");
  check(
    "フォーム詳細: 畳んだドロップダウンから共有タブを開ける",
    (await page.getByRole("button", { name: "編集" }).count()) > 0,
  );
  await page.getByRole("button", { name: "編集" }).click();
  await page.waitForTimeout(400);

  // 1 行目: 全社 × 回答のみ（demo2 が答えられるように）
  await page.getByRole("button", { name: "共有先を追加" }).click();
  await page.waitForTimeout(300);
  // 2 行目: 個人（demo1）× 閲覧 + 完了通知
  await page.getByRole("button", { name: "共有先を追加" }).click();
  await page.waitForTimeout(300);

  const cards = page.locator(".mantine-Paper-root", { has: page.getByText("共有先 2") });
  const second = cards.first();
  await second.getByRole("combobox", { name: "対象" }).click();
  await page.getByRole("option", { name: "個人" }).click();
  await second.getByPlaceholder("ユーザーを検索").fill("demo1");
  await page.waitForTimeout(1200);
  await page.getByRole("option").first().click();
  await second.getByRole("combobox", { name: "権限" }).click();
  await page.getByRole("option", { name: "閲覧", exact: true }).click();
  const notifyBox = second.getByLabel("完了したら通知する");
  await notifyBox.check();
  check("共有設定: 「完了通知」を付けられる", await notifyBox.isChecked());
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForTimeout(1500);
  await page.setViewportSize({ width: 1440, height: 900 });

  // demo2 が回答（提出＝完了。承認フローは使わない設定）
  const other = await browser.newContext({
    locale: "ja-JP",
    viewport: { width: 1440, height: 900 },
  });
  const page2 = await other.newPage();
  await login(page2, "demo2", "demo2026");
  await page2.goto(`${APP}/f/${code}`, { waitUntil: "networkidle" });
  const answerBox = page2.getByLabel("項目 1");
  const canAnswer = (await answerBox.count()) > 0;
  if (canAnswer) {
    await answerBox.fill("E2E からの提出");
    await page2.getByRole("button", { name: "送信" }).click();
    await page2.waitForTimeout(2500);
  }
  check("回答: 共有された相手が提出できる", canAnswer);
  await other.close();

  // demo1 の CM01 に「完了した申請」が出る
  await page.goto(`${APP}/general/tasks`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const tabShown =
    (await page.getByRole("tab", { name: /完了した申請/ }).count()) > 0;
  check("CM01: 完了通知を受け取ると「完了した申請」タブが出る", tabShown);
  if (tabShown) {
    await selectTab(page, /完了した申請/);
    await page.waitForTimeout(400);
    // 表に出ているタブの中だけを見る（Mantine は開いていないタブの中身も
    // DOM に残すので、同じ題名が 未回答のフォーム 側にも居る）。
    const panel = page.locator('[role="tabpanel"]:visible');
    const row = panel.getByText(title).first();
    const unread = await panel.getByText("未読").count();
    check("CM01: 完了した申請が未読で並ぶ", (await row.count()) > 0 && unread > 0);
    await row.click();
    let moved = true;
    try {
      await page.waitForURL(/\/general\/forms\/[^/]+\/responses\//, {
        timeout: 15_000,
      });
    } catch {
      moved = false;
    }
    await page.waitForLoadState("networkidle");
    check("完了した申請の行から回答詳細へ行ける", moved, page.url());
    await page.goto(`${APP}/general/tasks?tab=completions`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    // 今回の 1 件だけを見る（同じ DB に前の試行の未読が残っているため）。
    const card = page
      .locator('[role="tabpanel"]:visible .mantine-Paper-root')
      .filter({ hasText: title })
      .first();
    check(
      "CM01: 開いた通知は既読になる",
      (await card.getByText("未読").count()) === 0,
    );
  }

  console.log("\n---- 結果 ----");
  for (const r of results) console.log(r);
  await browser.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
