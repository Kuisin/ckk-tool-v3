/**
 * e2e-shipping-and-final-inspection.ts — 今回の 2 つの変更を、一時 DB +
 * 本番ビルドに対して実際に操作して確かめる（使い方は README「通し確認」）。
 *
 * 見ているもの:
 *   A. 最終検査を出荷前検査工程へ寄せた件
 *      A1. 指示書詳細に最終検査パネルが**もう出ない**
 *      A2. 印の付いた工程（出荷前検査）の実行画面には出る
 *      A3. 3 項目の ○ を押すと確認者スタンプが残る
 *      A4. 出荷前チェーンは順番どおり — 先頭以外は押せず理由が出る
 *      A5. 棚包を記録すると次の段（納品書発行）が押せるようになる
 *      A6. 工程マスタ (MS08) に「最終検査工程」の印が出ている
 *   B. 指示書 → 出荷書（次のステップ）と注文請書の欄
 *      B1. 完了した指示書に「次のステップ: 出荷書の作成」が出る
 *      B2. 押すと出荷書の新規作成が開き、**注文請書の欄が埋まっている**
 *      B3. 明細に注文明細のグループが入っている
 *      B4. 注文明細から作っても注文請書の欄が埋まっている（今回の本題）
 *      B5. 注文請書から作っても埋まっている
 *   C. 画面が壊れていない（pageerror / console error / React hydration）
 *
 * 落ちたときに原因を追えるよう、check() には**実測値**を添えること。
 *
 * 使い方（smoke-flows.ts と同じ流儀。CI では動かさない）:
 *   1. pnpm docs:seed                      # 使い捨て DB（:55432）
 *   2. docker exec -i ckk-shots-db psql -U postgres -d ckk -f - < e2e-fixtures.sql
 *   3. nextjs-web を本番ビルドして :3100 で起動
 *   4. pnpm exec tsx e2e-shipping-and-final-inspection.ts
 *
 * **2 は必須**。デモシードだけでは 出荷前検査工程・受注残・確定済みの注文請書が
 * 揃わず、ここで見たい状態そのものが作れない。何度流しても同じ結果になるよう、
 * fixtures は前回の打刻を消してから作り直す。
 */
import { chromium, type Page } from "@playwright/test";

const APP = process.env.APP_URL ?? "http://localhost:3100";
/** 完了済み・注文明細つきの指示書（manufacturing-demo-seed）。 */
const DONE_WO = process.env.DONE_WO ?? "9002";
/** 完了していない指示書 — カードが**出ない**ことを見る。 */
const DRAFT_WO = process.env.DRAFT_WO ?? "9003";
/** 進行中の指示書 — 出荷前検査工程を足してある。 */
const OPEN_WO = process.env.OPEN_WO ?? "9001";

const results: string[] = [];
let failed = 0;
const pageErrors: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failed++;
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`;
  results.push(line);
  console.log(line);
}

async function login(page: Page): Promise<void> {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "開発用アカウントでログイン" })
    .click();
  await page.getByLabel("ユーザー名").fill("demo1");
  await page
    .getByLabel("パスワード", { exact: false })
    .first()
    .fill("demo2026");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL(`${APP}/`, { timeout: 30_000 });
}

/** 出荷書フォームの「注文請書」欄にいま入っている表示値。 */
async function acceptanceFieldValue(page: Page): Promise<string> {
  const input = page.locator('input[placeholder*="注文請書"]').first();
  await input.waitFor({ state: "visible", timeout: 15_000 });
  return (await input.inputValue()).trim();
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // デモ DB にアバター画像が無いだけの 404 は既知（e2e-against-app-dev）。
    if (t.includes("/api/avatars/")) return;
    pageErrors.push(`console: ${t.slice(0, 200)}`);
  });

  await login(page);

  // ── A6. 工程マスタに印が出ている ────────────────────────────────────────
  await page.goto(`${APP}/master/process-steps`, { waitUntil: "networkidle" });
  await page.getByPlaceholder(/検索/).first().fill("出荷前検査");
  await page.waitForTimeout(600);
  const catalogRow = page
    .locator("table tbody tr", { hasText: "出荷前検査" })
    .first();
  check("A6 工程マスタに出荷前検査がある", (await catalogRow.count()) > 0);
  if (await catalogRow.count()) {
    await catalogRow.click();
    await page.waitForLoadState("networkidle");
    const flags = await page.locator("body").innerText();
    check(
      "A6 工程の印に「最終検査」が出る",
      flags.includes("最終検査"),
      `url=${page.url()}`,
    );
  }

  // ── A1. 指示書詳細に最終検査パネルが出ない ──────────────────────────────
  await page.goto(`${APP}/production/work-orders/${DONE_WO}`, {
    waitUntil: "networkidle",
  });
  const woBody = await page.locator("body").innerText();
  check(
    "A1 指示書詳細に最終検査パネルが無い",
    !woBody.includes("出荷前確認（棚包"),
    `wo=${DONE_WO}`,
  );

  // ── B1. 次のステップ カードが出る ───────────────────────────────────────
  const nextStep = page.getByText("次のステップ: 出荷書の作成").first();
  check(
    "B1 次のステップ（出荷書の作成）が出る",
    (await nextStep.count()) > 0,
    `wo=${DONE_WO}`,
  );

  // ── B2/B3. 押すと出荷書フォームが埋まって開く ───────────────────────────
  if (await nextStep.count()) {
    await page
      .getByRole("link", { name: /出荷書を作成/ })
      .first()
      .click();
    await page.waitForURL(/\/shipping\/delivery-orders\/new/, {
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500); // シードは fetch → setState の非同期
    const v = await acceptanceFieldValue(page);
    check(
      "B2 指示書から: 注文請書の欄が埋まる",
      /^ORD-\d{6}-\d{5}/.test(v),
      `value="${v}"`,
    );
    // 本文一致だと「まとめますか」モーダルの明細番号を拾ってしまうので、
    // 実際に明細が入ったかは数量合計で見る。
    const total = await page
      .getByText(/数量合計\s*\d+/)
      .first()
      .innerText();
    check(
      "B3 指示書から: 注文明細のグループが入る",
      Number(total.replace(/\D/g, "")) > 0,
      total,
    );
    const modal = page.getByText("同じ注文請書の他の明細もまとめますか");
    check(
      "B6 同じ注文請書の他の明細をまとめるか聞く",
      (await modal.count()) > 0,
      `modal=${await modal.count()}`,
    );
    if (await modal.count()) {
      await page.getByRole("button", { name: "この指示書だけ" }).click();
      await page.waitForTimeout(500);
      check(
        "B6 「この指示書だけ」で閉じても明細は増えない",
        Number(
          (
            await page
              .getByText(/数量合計\s*\d+/)
              .first()
              .innerText()
          ).replace(/\D/g, ""),
        ) === Number(total.replace(/\D/g, "")),
      );
    }
  }

  // ── B4. 注文明細から作っても埋まる（今回の本題） ────────────────────────
  // 出荷できる明細を確実に選ぶ — 未処理出荷書 (SH03) は「完了指示書の出来高が
  // 出荷書に載りきっていない明細」だけを並べるので、そこの先頭を使う。
  await page.goto(`${APP}/shipping/pending-shipments`, {
    waitUntil: "networkidle",
  });
  const olRow = page.locator("table tbody tr").first();
  check("B4 未処理出荷書に出荷できる明細がある", (await olRow.count()) > 0);
  // 完了していない指示書にはカードを出さない。
  // 「完了しているが受注残が無い」ほうは shippableQuantity の単体テスト
  // （lib/work-order-shipping-core.test.ts）が見る — e2e で作るには
  // デモデータの受注数を壊す必要があり、他の検査と両立しないため。
  await page.goto(`${APP}/production/work-orders/${DRAFT_WO}`, {
    waitUntil: "networkidle",
  });
  check(
    "B7 未完了の指示書にはカードを出さない",
    (await page.getByText("次のステップ: 出荷書の作成").count()) === 0,
    `wo=${DRAFT_WO}`,
  );
  await page.goto(`${APP}/shipping/pending-shipments`, {
    waitUntil: "networkidle",
  });
  if (await olRow.count()) {
    const olNumber = (await olRow.innerText()).split("\n")[0]?.trim() ?? "";
    await olRow.click();
    await page.waitForURL(/\/sales\/order-lines\/.+/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    const olUrl = `${page.url()} (${olNumber})`;
    // 「出荷書を作成」は次のステップカード or ⋯ メニューにある。
    const doLink = page.getByRole("link", { name: /出荷書を作成/ }).first();
    if (await doLink.count()) {
      await doLink.click();
    } else {
      await page.getByRole("button", { name: "操作メニュー" }).first().click();
      await page.getByRole("menuitem", { name: /出荷書を作成/ }).click();
    }
    await page.waitForURL(/\/shipping\/delivery-orders\/new/, {
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    const v = await acceptanceFieldValue(page);
    check(
      "B4 注文明細から: 注文請書の欄が埋まる",
      /^ORD-\d{6}-\d{5}/.test(v),
      `from=${olUrl} value="${v}"`,
    );
  }

  // ── B5. 注文請書から作っても埋まる ──────────────────────────────────────
  await page.goto(`${APP}/sales/order-acceptances`, {
    waitUntil: "networkidle",
  });
  const oaRow = page.locator("table tbody tr").first();
  if (await oaRow.count()) {
    await oaRow.click();
    await page.waitForURL(/\/sales\/order-acceptances\/.+/, {
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle");
    const oaLink = page.getByRole("link", { name: /出荷書を作成/ }).first();
    if (await oaLink.count()) {
      await oaLink.click();
      await page.waitForURL(/\/shipping\/delivery-orders\/new/, {
        timeout: 30_000,
      });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);
      const v = await acceptanceFieldValue(page);
      check(
        "B5 注文請書から: 注文請書の欄が埋まる",
        /^ORD-\d{6}-\d{5}/.test(v),
        `value="${v}"`,
      );
    } else {
      check(
        "B5 注文請書から: 出荷書を作成が出る",
        false,
        "リンクが見つからない（未確定？）",
      );
    }
  }

  // ── A2..A5. 出荷前検査工程の実行画面 ────────────────────────────────────
  await page.goto(`${APP}/production/work-orders/${OPEN_WO}/steps`, {
    waitUntil: "networkidle",
  });
  const stepLink = page.getByText("出荷前検査", { exact: false }).first();
  check(
    "A2 工程一覧に出荷前検査がある",
    (await stepLink.count()) > 0,
    `wo=${OPEN_WO}`,
  );
  if (await stepLink.count()) {
    await stepLink.click();
    await page.waitForTimeout(1500);
    await page.waitForLoadState("networkidle");
    const stepBody = await page.locator("body").innerText();
    check(
      "A2 最終検査パネルが工程の実行画面に出る",
      stepBody.includes("最終検査") && stepBody.includes("出荷前確認（棚包"),
      `url=${page.url()}`,
    );

    // A3. ○ を押すとスタンプが残る
    const okBtn = page
      .getByRole("button", { name: /図面・ラベル.*問題なし/ })
      .first();
    check(
      "A3 ○ ボタンに読み上げ用のラベルが付いている",
      (await okBtn.count()) > 0,
    );
    if (await okBtn.count()) {
      await okBtn.click();
      await page.waitForTimeout(2500);
      const after = await page.locator("body").innerText();
      check(
        "A3 ○ を押すと確認者スタンプが残る",
        /図面・ラベル[\s\S]{0,400}デモ/.test(after) ||
          after.includes("を記録しました"),
        "スタンプ or 完了通知",
      );
    }

    // A4. 出荷前チェーンは順番どおり
    const laterStage = page
      .getByRole("button", { name: /棚包担当者を先に記録/ })
      .first();
    check(
      "A4 先の段は押せず理由が出る",
      (await laterStage.count()) > 0 && (await laterStage.isDisabled()),
      `count=${await laterStage.count()}`,
    );

    // A5. 棚包を記録すると次が押せる
    const recordButtons = page.getByRole("button", { name: "記録する" });
    if (await recordButtons.count()) {
      await recordButtons.first().click();
      await page.waitForTimeout(2500);
      const nowEnabled = page.getByRole("button", { name: "記録する" });
      check(
        "A5 棚包を記録すると次の段が押せる",
        (await nowEnabled.count()) > 0,
        `残りの「記録する」= ${await nowEnabled.count()}`,
      );
    }
  }

  check(
    "C 画面のエラーが無い",
    pageErrors.length === 0,
    pageErrors.slice(0, 5).join(" | "),
  );

  await browser.close();
  console.log(
    `\n${results.filter((r) => r.startsWith("PASS")).length} passed, ${failed} failed`,
  );
  if (pageErrors.length) console.log("page errors:\n" + pageErrors.join("\n"));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
