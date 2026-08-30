/**
 * smoke-flows.ts — 一時 DB + 本番ビルドに対して、画面を実際に操作して通しで
 * 確かめる（使い方は README「通し確認」）。撮影パイプラインとは別物で、
 * 動かすのは人が「今の変更を通しで見たい」ときだけ。CI では動かさない。
 *
 * いま見ているもの:
 *   1. AppTabs — 幅に収まらないときだけドロップダウンへ畳み、広げると戻る
 *   2. 承認・予定 (CM01) のタブ表示設定（個人ごと）
 *   3. 申請・報告フォームの完了通知（共有設定 → 提出 → CM01 → 既読）
 *   4. 個人の表示設定が **DB に入っていて端末をまたぐ**こと（別ブラウザ
 *      コンテキスト＝別端末で開き直して確かめる）
 *   5. 設計図 (PD06) と設計依頼 (SA06) の分離 — 版の系列が (製品 × 受注元) で
 *      分かれること、依頼は成果物が無いと完了できないこと、成果物があれば
 *      完了できること、製品マスタ側からは書けないこと
 *   6. リッチテキスト — 設計依頼のコメント（スレッド）と設計図の版メモ
 *      （1 版 1 件）が書けて、読み込み直しても残ること
 *   7. ヘッダーの「戻る」— ページ階層の親（旧仕様）ではなく実際のブラウザ
 *      履歴の前ページへ戻ること、モバイルの重複「戻る」リンク（PageHeader /
 *      MasterDetailShell）が消えていること
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

  // ── 7. 個人の表示設定は端末をまたぐ（DB 保存であることの確認）─────────
  //    別のブラウザコンテキスト＝ cookie も localStorage も別 ＝ 別端末。
  //    ここで同じ設定が出れば、端末ローカルではなく DB に載っている。
  await page.goto(`${APP}/sales/quotes`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const beforeHeaders = await page.locator("thead th").allInnerTexts();
  await page.getByRole("button", { name: "列の表示" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("checkbox", { name: "合計金額" }).uncheck();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
  const afterHeaders = await page.locator("thead th").allInnerTexts();
  check(
    "一覧: 列を隠せる（見積書の合計金額）",
    beforeHeaders.some((h) => h.includes("合計金額")) &&
      !afterHeaders.some((h) => h.includes("合計金額")),
    afterHeaders.join(" / "),
  );

  // 「別端末」で開き直す
  const device2 = await browser.newContext({
    locale: "ja-JP",
    viewport: { width: 1440, height: 900 },
  });
  const page3 = await device2.newPage();
  await login(page3, "demo1", "demo2026");
  await page3.goto(`${APP}/sales/quotes`, { waitUntil: "networkidle" });
  await page3.waitForTimeout(600);
  const headers2 = await page3.locator("thead th").allInnerTexts();
  check(
    "別端末で開いても列の設定が効いている（DB 保存）",
    !headers2.some((h) => h.includes("合計金額")),
    headers2.join(" / "),
  );

  // タブの表示設定も同じく端末をまたぐ
  await page.goto(`${APP}/general/tasks`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "表示するタブ" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("checkbox", { name: "文書のコメント" }).uncheck();
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForTimeout(1200);
  await page3.goto(`${APP}/general/tasks`, { waitUntil: "networkidle" });
  await page3.waitForTimeout(600);
  const tabs2 = await page3.locator('[role="tab"]:visible').allInnerTexts();
  check(
    "別端末で開いてもタブの表示設定が効いている（DB 保存）",
    !tabs2.some((t) => t.includes("文書のコメント")),
    tabs2.join(" / "),
  );

  // 元に戻す（この DB は使い捨てだが、続けて流したときのために）
  await page.getByRole("button", { name: "表示するタブ" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("checkbox", { name: "文書のコメント" }).check();
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForTimeout(800);
  await device2.close();

  // ── 5. 設計図 (PD06) × 設計依頼 (SA06) の分離 ───────────────────────
  //
  // ここが今回いちばん壊れやすい。版の入口を 1 本にしたので、
  //   ・依頼の完了が「成果物あり」に依存する
  //   ・製品マスタからは書けない
  //   ・系列 (製品 × 受注元) が混ざらない
  // の 3 つを画面越しに確かめる。
  await page.goto(`${APP}/production/design-files`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const seriesRows = await page.locator("tbody tr").allInnerTexts();
  check(
    "PD06: 一覧が 1 行 = 1 系列（汎用と顧客別が別行）",
    seriesRows.some((r) => r.includes("汎用")) &&
      seriesRows.some((r) => r.includes("デモ商事")),
    `${seriesRows.length} 行`,
  );

  // 製品 9001 は汎用 v2 とデモ商事 v1 を持つ ⇒ 詳細で 2 系列が節に分かれる
  await page.goto(`${APP}/production/design-files/9001`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(500);
  const genericLatest = await page
    .locator("text=最新 v2")
    .count();
  const customerLatest = await page.locator("text=最新 v1").count();
  check(
    "PD06: 版は (製品 × 受注元) ごとに数える（汎用 v2 / デモ商事 v1 が同居）",
    genericLatest > 0 && customerLatest > 0,
    `汎用 v2:${genericLatest} 顧客 v1:${customerLatest}`,
  );

  // 成果物ゼロの進行中依頼 → 「完了」ではなく登録への誘導が出る
  await page.goto(`${APP}/sales/design-requests/DSG-202607-00001`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(500);
  const registerCta = page.getByRole("link", { name: "設計図に登録" });
  check(
    "SA06: 成果物が無い依頼は完了できず、設計図の登録へ誘導する",
    (await registerCta.count()) > 0,
    await page.getByText("図面を登録してください").first().innerText().catch(() => "(案内なし)"),
  );
  await page.getByRole("button", { name: "操作メニュー" }).first().click();
  await page.waitForTimeout(300);
  const doneItemAbsent =
    (await page.getByRole("menuitem", { name: "完了" }).count()) === 0;
  check("SA06: そのとき操作メニューにも「完了」が出ない", doneItemAbsent);
  await page.keyboard.press("Escape");

  // 誘導先は製品・受注元が依頼で固定されている（選び直せない）
  await registerCta.click();
  await page.waitForURL(/\/production\/design-files\/new\?request=/, {
    timeout: 15_000,
  });
  await page.waitForTimeout(500);
  const fixedNotice = await page
    .getByText("設計依頼 DSG-202607-00001 の成果物として登録します")
    .count();
  // Mantine の Select は combobox（manifest の 材種 と同じ引き方）。
  const customerSelect = page.getByRole("combobox", { name: "受注元" });
  const customerDisabled = (await customerSelect.count())
    ? await customerSelect.isDisabled()
    : false;
  check(
    "SA06→PD06: 依頼から来ると製品・受注元が固定される",
    fixedNotice > 0 && customerDisabled,
    `案内:${fixedNotice} 受注元disabled:${customerDisabled}`,
  );

  // 成果物のある進行中依頼 → 完了できる
  await page.goto(`${APP}/sales/design-requests/DSG-202607-00006`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "操作メニュー" }).first().click();
  await page.waitForTimeout(300);
  const doneItem = page.getByRole("menuitem", { name: "完了" });
  check(
    "SA06: 成果物のある依頼は完了できる",
    (await doneItem.count()) > 0,
    "DSG-202607-00006",
  );
  await page.keyboard.press("Escape");

  // 製品マスタ側は読むだけ（第 2 の書き込み口を作っていないこと）
  await page.goto(`${APP}/master/products/9001?tab=related`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(600);
  const addFromMaster = await page
    .getByRole("button", { name: "設計図を追加" })
    .count();
  const manageLink = await page
    .getByRole("link", { name: "設計図で管理" })
    .count();
  check(
    "MS24: 製品マスタからは版を足せない（読み取り + 設計図へのリンクだけ）",
    addFromMaster === 0 && manageLink > 0,
    `追加ボタン:${addFromMaster} 管理リンク:${manageLink}`,
  );

  // ── 6. リッチテキスト（設計依頼のコメント / 設計図の版メモ）──────────
  //
  // どちらも document_memos に入るが owner の作り方が違う:
  //   設計依頼 … ownerId = 依頼番号（業務キー）/ COMMENT（スレッド）
  //   設計図   … ownerId = 版の uuid（業務キーが無い）/ MEMO（1 件の共有欄）
  const commentText = `E2E コメント ${Date.now()}`;
  await page.goto(
    `${APP}/sales/design-requests/DSG-202607-00001?tab=comments`,
    { waitUntil: "networkidle" },
  );
  await page.waitForTimeout(800);
  const commentEditor = page.locator(".ProseMirror").first();
  await commentEditor.click();
  await commentEditor.fill(commentText);
  await page.getByRole("button", { name: "投稿" }).first().click();
  await page.waitForTimeout(1500);
  check(
    "SA06: コメントを投稿できる",
    (await page.getByText(commentText).count()) > 0,
    commentText,
  );

  // 読み込み直しても残る（DB に入っている）
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  check(
    "SA06: コメントは再読み込み後も残る",
    (await page.getByText(commentText).count()) > 0,
  );

  // 設計図の版メモ — 行の「メモ」からモーダルで開く
  const memoText = `E2E 版メモ ${Date.now()}`;
  await page.goto(`${APP}/production/design-files/9001`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "メモ" }).first().click();
  await page.waitForTimeout(800);
  const memoDialog = page.getByRole("dialog");
  // 未記入なら「メモを追加」、既にあれば鉛筆（aria-label="編集"）。
  const memoAdd = memoDialog.getByRole("button", { name: "メモを追加" });
  const memoEdit = memoDialog.getByRole("button", { name: "編集" });
  if (await memoAdd.count()) {
    await memoAdd.first().click();
  } else if (await memoEdit.count()) {
    await memoEdit.first().click();
  }
  await page.waitForTimeout(600);
  const memoEditor = memoDialog.locator(".ProseMirror").first();
  await memoEditor.click();
  await memoEditor.fill(memoText);
  await memoDialog.getByRole("button", { name: "保存" }).first().click();
  await page.waitForTimeout(1500);
  check(
    "PD06: 版ごとのメモを書ける",
    (await page.getByText(memoText).count()) > 0,
    memoText,
  );

  // ── 7. ヘッダーの「戻る」──────────────────────────────────────────
  //
  // 旧仕様は URL のパス階層を1段上がるだけの独自ロジックで、/master/products
  // からは常に「マスタ」カテゴリ扱いでホームへ飛んでいた（間に何を見ていても
  // 無視される）。実際のブラウザ履歴で戻るなら、直前に見ていた
  // /master/business-partners に戻るはず — この差がそのまま回帰の検出になる。
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP}/master/business-partners`, {
    waitUntil: "networkidle",
  });
  await page.goto(`${APP}/master/products`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "前のページへ戻る" }).click();
  await page.waitForLoadState("networkidle");
  check(
    "ヘッダー「戻る」: 階層の親（旧: ホーム固定）ではなく実際の履歴の前ページへ戻る",
    page.url().endsWith("/master/business-partners"),
    page.url(),
  );

  // モバイル: PageHeader が出していた重複リンク（パンくずの代わりの「‹ 取引先」）が消えている
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP}/master/business-partners`, {
    waitUntil: "networkidle",
  });
  const firstBpRow = page.locator("tbody tr").first();
  if (await firstBpRow.count()) {
    await firstBpRow.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    const dupCrumbLink = await page
      .getByRole("link", { name: "取引先", exact: true })
      .count();
    check(
      "PageHeader: モバイルの重複「戻る」リンクが無い（取引先 詳細）",
      dupCrumbLink === 0,
      `件数 ${dupCrumbLink}`,
    );
  } else {
    check(
      "PageHeader: モバイル重複リンク確認は一覧に行が無く未確認",
      false,
      "demo データ無し",
    );
  }

  // モバイル: MasterDetailShell が出していた重複リンク（詳細ルートの「一覧へ戻る」）が消えている
  await page.goto(`${APP}/settings/trial-pricing-engine/criteria/new`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(400);
  const dupListLink = await page.getByText("一覧へ戻る").count();
  check(
    "MasterDetailShell: モバイルの重複「一覧へ戻る」リンクが無い（計算基準 新規）",
    dupListLink === 0,
    `件数 ${dupListLink}`,
  );
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log("\n---- 結果 ----");
  for (const r of results) console.log(r);
  await browser.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
