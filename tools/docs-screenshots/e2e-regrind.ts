/**
 * e2e-regrind.ts — 再研磨（顧客の工具を預かって研ぎ直す）を、使い捨て DB +
 * 本番ビルドに対して**実際に操作して**確かめる。
 *
 * 単体試験は純ロジック（stepAllowedForType / regrindQuantities / 割当の不変条件）
 * しか見ない。ここで見たいのはその先 — **画面から作った指示書の台帳が正しいか**、
 * とくに「顧客の工具が自社在庫に化けない」こと。台帳は画面に出ないので、
 * 1 手ごとに SQL で裏を取る。
 *
 * 見ているもの:
 *   A. 他社製品（研ぎ直す工具）
 *      A1. 製品詳細に「他社製」バッジとメーカー名が出る
 *      A2. 製造工程リストのタブが**出ない**（他社製品は製造できない）
 *   B. 再研磨の注文明細
 *      B1. 在庫照合のボタンが**出ない**（自社在庫を引き当てる注文ではない）
 *      B2.「指示書を作る」が type=REGRIND を連れている
 *      B3. 売り物は**再研磨品目**、工具は別に出る（品目を 2 つ指す）
 *   C. 指示書をつくる（画面から）
 *      C1. 種別が「再研磨」に固定される（製造分・在庫分は押せない）
 *      C2. 使用素材・保管場所の欄が**出ない**
 *      C3. 再研磨工程リストが自動で選ばれ、「最新 v1」と出る
 *      C4. 保存すると type=REGRIND・素材 null・保管場所 null で入る
 *   D. 製品受入（再研磨）の実行画面
 *      D1. 数量欄が「受入本数 / 再研磨する本数」になっている
 *      D2. 不良の種別に「返却（再研磨不可）」があり、**半製品は無い**
 *   E. 受入の完了 → 預り品として入庫
 *      E1. 所有者バケット（顧客 × ロット）に 10 本
 *      E2. **自社の在庫は 0 のまま**
 *      E3. 伝票の事由が REGRIND_RECEIPT、工程に印が付く
 *   F. 全工程完了 → 指示書完了
 *      F1. 指示書が COMPLETED
 *      F2. 自社在庫は**増えない**（完成品の入庫が 1 行も無い）
 *      F3. 預り品が 10 → 8（返却 2 本が落ちる）
 *      F4. 詳細画面の「再研磨数量」が 受入 10 / 返却 2 / 完成 8
 *   H. 出荷（発送）— 研ぎ直した分をお客様へ返す
 *      H1. 預り品バケットから出て 8 → 0 になる
 *      H2. 自社在庫は 0 のまま（マイナスにもならない）
 *      H3. 出庫の取引行が**所有者バケット**を指している
 *      H4. 請求単価が**明細の再研磨品目**の価格表から引かれる（¥1,500）—
 *          出荷明細が指す工具には値段が無いので、これは「請求は明細の
 *          品目を読む」ことの証明でもある
 *   I. 再研磨品目マスタ (MS0H) — 値段の持ち主
 *      I1. 一覧に条件（種類 / 箇所 / 刃数 / サイズ帯）と標準価格が出る
 *      I2. 新規作成でコードが RGD- で採番され、標準価格が入る
 *   G. 画面が壊れていない（pageerror / console error）
 *
 * 落ちたときに原因を追えるよう、check() には**実測値**を添えること。
 *
 * **承認は見ていない** — 再研磨でも製造分と同じ経路（approval_requests +
 * planReadiness）で、再研磨に固有の分岐が無いため。工程を動かすのに要るだけなので
 * SQL で APPROVED にする。
 *
 * 使い方（e2e-ship-shortage.ts と同じ流儀。CI では動かさない）:
 *   1. SHOT_DB_CONTAINER=ckk-regrind-db SHOT_DB_PORT=55462 pnpm docs:seed
 *   2. docker exec -i ckk-regrind-db psql -U postgres -d ckk -f - < e2e-regrind-fixtures.sql
 *   3. nextjs-web をその DB 向けに本番ビルドして :3106 で起動
 *   4. APP_URL=http://localhost:3106 pnpm exec tsx e2e-regrind.ts
 *
 * **2 は必須** — デモシードには他社製品も再研磨工程リストも再研磨の明細も無い。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const APP = process.env.APP_URL ?? "http://localhost:3106";
const DB_CONTAINER = process.env.SHOT_DB_CONTAINER ?? "ckk-regrind-db";
/**
 * 他社製品 = **研ぎ直す工具**（fixtures）。在庫・指示書・出荷はこれで数える。
 * 値段は持たない（売り物ではない）。
 */
const ITEM = 9101;
/** 再研磨品目 = **売る役務**（fixtures）。値段はこちらに付く。 */
const REGRIND_ITEM = 9102;
/** 再研磨の注文明細（fixtures）。 */
const ORDER_LINE = "ORD-209902-00001-01";
const ORDER_LINE_UUID = "d6000000-0000-4000-8000-000000009101";
/** 預り品の所有者 = 明細の顧客。 */
const CUSTOMER = "d0000000-0000-4000-8000-000000000001";

const results: string[] = [];
let failed = 0;
const pageErrors: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failed++;
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`;
  results.push(line);
  console.log(line);
}

/**
 * fixtures を流し直す。**毎回やる** — 前の実行が作った指示書が残っていると
 * 注文明細の受注残が 0 になり、「リンクが無い」「保存できない」という
 * 本題と関係ない落ち方をする（実際に踏んだ）。fixtures 自身が冪等。
 */
function resetFixtures(): void {
  const file = join(import.meta.dirname, "e2e-regrind-fixtures.sql");
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "ckk",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
      "-f",
      "-",
    ],
    { input: readFileSync(file, "utf8"), encoding: "utf8" },
  );
}

/** DB へ直接聞く（画面が言っていることと台帳が一致しているかの裏取り）。 */
function sql(query: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "ckk",
      "-tAc",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
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
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

/**
 * 1 工程を開始 → 完了する。`scrap` を渡すと不良行を 1 本入れる
 * （再研磨の受入では「返却（再研磨不可）」の意味になる）。
 */
async function runStep(
  page: Page,
  woNumber: string,
  stepId: string,
  scrap?: { count: number; defectType: string; reason: string },
): Promise<void> {
  await page.goto(`${APP}/production/work-orders/${woNumber}/steps/${stepId}`, {
    waitUntil: "networkidle",
  });
  const start = page.getByRole("button", { name: "工程開始" });
  if (await start.isVisible().catch(() => false)) {
    await start.click();
    await page.waitForTimeout(1200);
  }
  if (scrap) {
    await addDefectRow(page, scrap);
  }
  await page.getByRole("button", { name: "工程完了" }).click();
  await page
    .getByText("工程を完了しました", { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .catch(() => undefined);
  await page.waitForTimeout(800);
}

/**
 * 不良の行を 1 本入れる。Mantine の Select は role=combobox、NumberInput /
 * TextInput は role を持たない素の input なので、前者は role で、後者は
 * ラベルで掴む（種別は工程の欄にも同名があるので**不良行の中**に限る）。
 */
async function addDefectRow(
  page: Page,
  scrap: { count: number; defectType: string; reason: string },
): Promise<void> {
  await page.getByRole("button", { name: "不良を追加" }).first().click();
  await page.waitForTimeout(400);
  const row = page
    .locator(".mantine-Paper-root")
    .filter({ has: page.getByLabel("詳細") })
    .last();
  await row.getByRole("combobox", { name: "種別", exact: true }).click();
  await page.getByRole("option", { name: scrap.defectType }).first().click();
  await row.getByRole("combobox", { name: "不良種類" }).click();
  await page.getByRole("option", { name: scrap.defectType }).first().click();
  await row.getByLabel("本数").fill(String(scrap.count));
  await row.getByLabel("詳細").fill(scrap.reason);
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${page.url()} :: ${e.message}`));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      !/avatars|favicon|\/api\/pdf\//.test(m.text())
    ) {
      pageErrors.push(`${page.url()} :: console ${m.text()}`);
    }
  });

  resetFixtures();
  await login(page);

  // ── A. 他社製品（研ぎ直す工具）──────────────────────────────────────────
  await page.goto(`${APP}/master/products/${ITEM}`, {
    waitUntil: "networkidle",
  });
  const productBody = (await page.locator("body").innerText()).replace(
    /\s+/g,
    " ",
  );
  check(
    "A1 他社製バッジとメーカー名が出る",
    productBody.includes("他社製") && productBody.includes("日研ツール"),
    productBody.slice(0, 120),
  );
  const routesTab = page.getByRole("tab", { name: "工程リスト" });
  check(
    "A2 他社製品に製造工程リストのタブが出ない",
    (await routesTab.count()) === 0,
  );

  // ── B. 再研磨の注文明細 ──────────────────────────────────────────────────
  await page.goto(`${APP}/sales/order-lines/${ORDER_LINE}`, {
    waitUntil: "networkidle",
  });
  const stockCheckBtn = page.getByRole("button", { name: "在庫照合" });
  check(
    "B1 再研磨の明細に在庫照合が出ない",
    (await stockCheckBtn.count()) === 0,
  );
  const woLinks = await page
    .locator('a[href*="/production/work-orders/new"]')
    .evaluateAll((as) =>
      as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""),
    );
  check(
    "B2 指示書作成のリンクが type=REGRIND を連れている",
    woLinks.length > 0 && woLinks.every((h) => h.includes("type=REGRIND")),
    woLinks.join(" | ") || "リンク無し",
  );
  // 明細は品目を 2 つ指す — 売っているのは役務、預かるのは工具。
  const lineBody = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  check(
    "B3 売り物は再研磨品目、工具は他社製品として別に出る",
    lineBody.includes("再研磨 超硬エンドミル") &&
      lineBody.includes("日研ツール"),
    lineBody.slice(0, 220),
  );
  const lineItems = sql(
    `SELECT item_id||'/'||coalesce(tool_item_id::text,'-') FROM app.order_lines
      WHERE id='${ORDER_LINE_UUID}'::uuid`,
  );
  check(
    "B3b DB でも item_id = 再研磨品目 / tool_item_id = 工具",
    lineItems === `${REGRIND_ITEM}/${ITEM}`,
    lineItems,
  );

  // ── C. 指示書をつくる ────────────────────────────────────────────────────
  await page.goto(
    `${APP}/production/work-orders/new?orderLine=${ORDER_LINE_UUID}&type=REGRIND&qty=10`,
    { waitUntil: "networkidle" },
  );
  await page.waitForTimeout(1500); // 工程リストのロード（種別の固定はこの後）

  const regrindOn = await page
    .getByRole("radio", { name: "再研磨" })
    .isChecked()
    .catch(() => false);
  const mfgDisabled = await page
    .getByRole("radio", { name: "製造分" })
    .isDisabled()
    .catch(() => true);
  check(
    "C1 種別が再研磨に固定される",
    regrindOn && mfgDisabled,
    `再研磨=${regrindOn} 製造分disabled=${mfgDisabled}`,
  );

  const formBody = (
    await page.locator("form, body").first().innerText()
  ).replace(/\s+/g, " ");
  check(
    "C2 使用素材・保管場所の欄が出ない",
    !formBody.includes("使用素材") && !formBody.includes("保管場所"),
    formBody.slice(0, 200),
  );
  check(
    "C3 再研磨工程リストが選ばれ最新版が出る",
    formBody.includes("再研磨工程リスト") && /最新版? v1/.test(formBody),
    formBody.slice(0, 260),
  );

  await page.getByRole("button", { name: "保存" }).click();
  // 保存後は**書類番号**（WOR-YYYYMM-NNNNN）の詳細へ飛ぶ。台帳はロット番号
  // （= 指示書番号の通し連番）で引くので、番号は DB から引き直す。
  await page.waitForURL(/\/production\/work-orders\/WOR-\d{6}-\d{5}/, {
    timeout: 30_000,
  });
  const docNumber = new URL(page.url()).pathname.split("/").pop() ?? "";
  const woNumber = sql(
    `SELECT coalesce(max(work_order_number)::text,'0') FROM app.work_orders WHERE product_item_id=${ITEM}`,
  );
  check(
    "C4a 指示書が作られる",
    /^WOR-\d{6}-\d{5}$/.test(docNumber) && woNumber !== "0",
    `${docNumber} / ロット ${woNumber}`,
  );

  const woRow = sql(
    `SELECT type||'|'||coalesce(material_item_id::text,'-')||'|'||coalesce(storage_location_id::text,'-')
       ||'|'||coalesce(route_version_id::text,'-')
       FROM app.work_orders WHERE work_order_number = ${Number(woNumber) || 0}`,
  );
  check(
    "C4b 種別 REGRIND・素材なし・保管場所なし・再研磨ルート由来",
    woRow.startsWith("REGRIND|-|-|") &&
      woRow.endsWith("dc040000-0000-4000-8000-000000009101"),
    woRow,
  );

  // 工程を動かすために承認する（承認そのものは再研磨に固有の分岐が無いので見ない）
  sql(
    `UPDATE app.work_orders SET status='APPROVED', approval_status='APPROVED', approved_at=now()
      WHERE work_order_number=${Number(woNumber)}`,
  );

  const steps = sql(
    `SELECT string_agg(s.id::text||':'||c.code, ',' ORDER BY s.sort_order)
       FROM app.work_order_steps s
       JOIN app.process_step_catalog c ON c.id = s.process_step_id
       JOIN app.work_orders w ON w.id = s.work_order_id
      WHERE w.work_order_number = ${Number(woNumber)}`,
  );
  const stepList = steps.split(",").map((s) => {
    const [id, code] = s.split(":");
    return { id, code };
  });
  check(
    "C4c 再研磨リストの 3 工程が入る",
    stepList.map((s) => s.code).join(",") ===
      "REGRIND_RECEIPT,REGRIND_OD,PRE_SHIP_INSPECTION",
    stepList.map((s) => s.code).join(","),
  );

  const receipt = stepList.find((s) => s.code === "REGRIND_RECEIPT");
  if (!receipt) {
    check("D/E/F 受入工程が無いので以降を飛ばす", false);
  } else {
    // ── D. 受入工程の画面 ──────────────────────────────────────────────────
    await page.goto(
      `${APP}/production/work-orders/${woNumber}/steps/${receipt.id}`,
      {
        waitUntil: "networkidle",
      },
    );
    await page.getByRole("button", { name: "工程開始" }).click();
    await page.waitForTimeout(1500);
    const stepBody = (await page.locator("body").innerText()).replace(
      /\s+/g,
      " ",
    );
    check(
      "D1 数量欄が受入本数 / 再研磨する本数になっている",
      stepBody.includes("受入本数") && stepBody.includes("再研磨する本数"),
      stepBody.slice(0, 200),
    );

    await page.getByRole("button", { name: "不良を追加" }).first().click();
    await page.waitForTimeout(400);
    const defectRow = page
      .locator(".mantine-Paper-root")
      .filter({ has: page.getByLabel("詳細") })
      .last();
    await defectRow
      .getByRole("combobox", { name: "種別", exact: true })
      .click();
    await page.waitForTimeout(300);
    const options = await page.getByRole("option").allInnerTexts();
    check(
      "D2 種別に返却（再研磨不可）があり、半製品が無い",
      options.some((o) => o.includes("返却")) &&
        !options.some((o) => o.includes("半製品")),
      options.join(" / "),
    );

    // ── E. 受入を完了 → 預り品として入庫 ──────────────────────────────────
    await page.getByRole("option", { name: /返却/ }).first().click();
    await defectRow.getByRole("combobox", { name: "不良種類" }).click();
    await page.getByRole("option", { name: /返却/ }).first().click();
    await defectRow.getByLabel("本数").fill("2");
    await defectRow.getByLabel("詳細").fill("刃長が規格外で研ぎ直せない");
    await page.getByRole("button", { name: "工程完了" }).click();
    await page
      .getByText("工程を完了しました", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .catch(() => undefined);
    await page.waitForTimeout(1000);

    const owned = sql(
      `SELECT coalesce(sum(quantity),0)::text FROM app.item_inventory
        WHERE item_id=${ITEM} AND owner_bp_id='${CUSTOMER}'::uuid AND custody_bp_id IS NULL`,
    );
    check(
      "E1 預り品バケットに 10 本入る",
      Number(owned) === 10,
      `qty=${owned}`,
    );

    const own = sql(
      `SELECT coalesce(sum(quantity),0)::text FROM app.item_inventory
        WHERE item_id=${ITEM} AND owner_bp_id IS NULL`,
    );
    check("E2 自社の在庫は 0 のまま", Number(own) === 0, `qty=${own}`);

    const cause = sql(
      `SELECT m.cause FROM app.inventory_movements m
        WHERE m.source_type='work_orders' AND m.source_id='${woNumber}'
          AND m.cause='REGRIND_RECEIPT'`,
    );
    const stamped = sql(
      `SELECT coalesce(regrind_receipt_movement_id::text,'-') FROM app.work_order_steps
        WHERE id='${receipt.id}'::uuid`,
    );
    check(
      "E3 事由 REGRIND_RECEIPT の伝票が立ち、工程に印が付く",
      cause === "REGRIND_RECEIPT" && stamped !== "-",
      `cause=${cause} stamp=${stamped.slice(0, 8)}`,
    );

    // ── F. 残りの工程 → 指示書完了 ────────────────────────────────────────
    for (const s of stepList.filter((x) => x.code !== "REGRIND_RECEIPT")) {
      await runStep(page, woNumber, s.id);
    }

    const woStatus = sql(
      `SELECT status FROM app.work_orders WHERE work_order_number=${Number(woNumber)}`,
    );
    check(
      "F1 指示書が完了する",
      woStatus === "COMPLETED",
      `status=${woStatus}`,
    );

    const ownAfter = sql(
      `SELECT coalesce(sum(quantity),0)::text FROM app.item_inventory
        WHERE item_id=${ITEM} AND owner_bp_id IS NULL`,
    );
    const finishedIn = sql(
      `SELECT count(*) FROM app.inventory_transactions t
         JOIN app.inventory_movements m ON m.id=t.movement_id
         JOIN app.item_inventory i ON i.id=t.inventory_id
        WHERE m.source_type='work_orders' AND m.source_id='${woNumber}'
          AND t.transaction_type='IN' AND i.owner_bp_id IS NULL`,
    );
    check(
      "F2 完了しても自社在庫は増えない（完成品の入庫が 1 行も無い）",
      Number(ownAfter) === 0 && finishedIn === "0",
      `own=${ownAfter} 入庫行=${finishedIn}`,
    );

    const ownedAfter = sql(
      `SELECT coalesce(sum(quantity),0)::text FROM app.item_inventory
        WHERE item_id=${ITEM} AND owner_bp_id='${CUSTOMER}'::uuid AND custody_bp_id IS NULL`,
    );
    check(
      "F3 預り品が 10 → 8（返却 2 本が落ちる）",
      Number(ownedAfter) === 8,
      `qty=${ownedAfter}`,
    );

    await page.goto(`${APP}/production/work-orders/${woNumber}`, {
      waitUntil: "networkidle",
    });
    const detail = (await page.locator("body").innerText()).replace(
      /\s+/g,
      " ",
    );
    check(
      "F4 詳細に 再研磨数量 受入 10 / 返却 2 / 完成 8 が出る",
      /再研磨数量/.test(detail) &&
        /受入\s*10/.test(detail) &&
        /返却\s*2/.test(detail) &&
        /完成\s*8/.test(detail),
      (detail.match(/再研磨数量.{0,60}/) ?? ["見つからない"])[0],
    );

    // ── H. 出荷（発送）— 所有者バケットから出る ──────────────────────────
    // 出荷書そのものは試験の対象ではない（作るのは SQL）。見たいのは
    // **どのバケットから引くか**で、そこは出荷の処理（planDispatchLines →
    // ownerBucketFor）が決める。
    const lot = sql(
      `SELECT coalesce(lot_number::text,'-') FROM app.item_inventory
        WHERE item_id=${ITEM} AND owner_bp_id='${CUSTOMER}'::uuid AND custody_bp_id IS NULL
        ORDER BY quantity DESC LIMIT 1`,
    );
    sql(`INSERT INTO app.delivery_orders (year_month, seq, customer_bp_id, from_plant_id,
           type, status, notes, created_by, created_at, updated_at)
         VALUES ('209902', 1, '${CUSTOMER}'::uuid,
           (SELECT id FROM app.plants WHERE code='F01'),
           'DISPATCH'::app."DELIVERY_ORDER_TYPE", 'DRAFT'::app."DELIVERY_ORDER_STATUS",
           'e2e: 再研磨の返却', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid, now(), now())`);
    sql(`INSERT INTO app.delivery_order_items (id, delivery_order_year_month, delivery_order_seq,
           order_line_id, item_id, lot_number, quantity, sort_order)
         VALUES ('dd000000-0000-4000-8000-000000009101'::uuid, '209902', 1,
           '${ORDER_LINE_UUID}'::uuid, ${ITEM}, ${lot === "-" ? "NULL" : lot}, 8, 0)`);

    await page.goto(`${APP}/shipping/delivery-orders/DOR-209902-00001`, {
      waitUntil: "networkidle",
    });
    // **確定を画面から押す** — 請求単価はここで焼き込まれる（H4 が見る値）。
    // 下書きのまま SQL で CONFIRMED にすると、そこを通らずに単価が null の
    // ままになり、H4 は何も確かめていないことになる。
    await page.getByRole("button", { name: "操作メニュー" }).click();
    await page.getByRole("menuitem", { name: "確定" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /確定|実行/ })
      .click()
      .catch(() => undefined);
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "networkidle" });

    await page.getByRole("button", { name: "操作メニュー" }).click();
    await page.getByRole("menuitem", { name: "出荷" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "出荷する" })
      .click();
    await page
      .getByText("出荷しました", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .catch(() => undefined);
    await page.waitForTimeout(1000);

    const ownedShipped = sql(
      `SELECT coalesce(sum(quantity),0)::text FROM app.item_inventory
        WHERE item_id=${ITEM} AND owner_bp_id='${CUSTOMER}'::uuid AND custody_bp_id IS NULL`,
    );
    check(
      "H1 出荷で預り品が 8 → 0 になる",
      Number(ownedShipped) === 0,
      `qty=${ownedShipped}`,
    );

    const ownShipped = sql(
      `SELECT coalesce(sum(quantity),0)::text FROM app.item_inventory
        WHERE item_id=${ITEM} AND owner_bp_id IS NULL`,
    );
    check(
      "H2 自社在庫は 0 のまま（マイナスにもならない）",
      Number(ownShipped) === 0,
      `qty=${ownShipped}`,
    );

    const outOnOwner = sql(
      `SELECT count(*) FROM app.inventory_transactions t
         JOIN app.inventory_movements m ON m.id=t.movement_id
         JOIN app.item_inventory i ON i.id=t.inventory_id
        WHERE m.source_id='DOR-209902-00001' AND t.transaction_type='OUT'
          AND i.owner_bp_id='${CUSTOMER}'::uuid`,
    );
    check(
      "H3 出庫が所有者バケットから出ている",
      outOnOwner === "1",
      `行=${outOnOwner}`,
    );

    // 請求単価は**注文明細の品目**（再研磨品目 9102）の価格表から引く。
    // 出荷明細が指すのは工具 9101 で、そちらには値段が 1 円も無い —
    // だからここに 1500 が入っていること自体が「請求は明細を読む」証拠。
    // 標準価格 ¥1,200 ではなく価格表の ¥1,500 が勝つことも同時に見ている。
    const billed = sql(
      `SELECT coalesce(unit_price::text,'-') FROM app.delivery_order_items
        WHERE delivery_order_year_month='209902' AND delivery_order_seq=1`,
    );
    check(
      "H4 請求単価が再研磨品目の価格表から引かれる（標準価格 1200 ではなく 1500）",
      Number(billed) === 1500,
      `unit_price=${billed}`,
    );
  }

  // ── I. 再研磨品目マスタ (MS0H) ──────────────────────────────────────────
  // 値段の持ち主がここ。条件（種類 / 箇所 / 刃数 / サイズ帯）が並ばないと、
  // 何百とある行からどれを選ぶのか決められない（旧 再研マスタも金額の表だった）。
  await page.goto(`${APP}/master/regrind-items`, { waitUntil: "networkidle" });
  const masterBody = (await page.locator("body").innerText()).replace(
    /\s+/g,
    " ",
  );
  check(
    "I1 一覧に条件と標準価格が出る",
    masterBody.includes("RGD-209902-0001") &&
      masterBody.includes("超硬エンドミル") &&
      masterBody.includes("外周のみ") &&
      /φ6\s*超\s*10\s*以下/.test(masterBody) &&
      /1,200/.test(masterBody),
    masterBody.slice(0, 260),
  );

  await page.goto(`${APP}/master/regrind-items/new`, {
    waitUntil: "networkidle",
  });
  await page.getByLabel("名称（日本語）").fill("e2e 再研磨 溝のみ 2枚刃");
  await page.getByLabel("工具の種類").fill("ハイスエンドミル");
  await page.getByLabel("加工箇所").fill("溝のみ");
  await page.getByLabel("標準価格").fill("540");
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(/\/master\/regrind-items$/, { timeout: 20_000 });
  const created = sql(
    `SELECT coalesce(code,'-')||'|'||coalesce(standard_unit_price::text,'-')
       FROM app.items WHERE item_type='REGRIND' AND name->>'ja' = 'e2e 再研磨 溝のみ 2枚刃'`,
  );
  check(
    "I2 新規作成でコードが RGD- で採番され標準価格が入る",
    /^RGD-\d{6}-\d{4}\|540/.test(created),
    created || "作られていない",
  );

  check(
    "G 画面に未捕捉のエラーが無い",
    pageErrors.length === 0,
    pageErrors.slice(0, 3).join(" | "),
  );

  await browser.close();
  console.log(
    `\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${results.length} checks)`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
