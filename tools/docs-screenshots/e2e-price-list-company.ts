/**
 * e2e-price-list-company.ts — 価格表を会社ごとに持つ（コピー・差分・同期）を、
 * 使い捨て DB + 本番ビルドに対して**実際に操作して**確かめる。
 *
 * 見ているもの:
 *   A. 2 社目（TSP）と拠点を用意し、demo1 を両社の拠点に所属させる（SQL）
 *   B. CKK の価格表がある顧客 × 製品で、TSP を発行会社にして新規作成を開くと
 *      「他社の価格表があります」と出て、コピーできる
 *   C. 保存すると TSP の価格表が新しい番号で入り（own_company_id = TSP）、
 *      値引きルールもコピーされる。詳細に「CKK と同じ」
 *   D. TSP の数量段階の倍率を変えると「CKK と差分あり」、差分の表に段階が出る
 *   E. 「CKK の内容で同期」で同じ中身に戻る（DB の段階も CKK と一致）
 *   F. 一覧に発行会社の列と「他社との差分」列が出る
 *   G. 画面が壊れていない（pageerror）
 *
 * 使い方（CI では動かさない）:
 *   pnpm check -- --keep で残したアプリと DB に対して:
 *   APP_URL=http://localhost:3489 SHOT_DB_CONTAINER=ckk-lc189-app \
 *     pnpm exec tsx e2e-price-list-company.ts
 */

import { execFileSync } from "node:child_process";
import { chromium, type Page } from "@playwright/test";

const APP = process.env.APP_URL ?? "http://localhost:3489";
const DB_CONTAINER = process.env.SHOT_DB_CONTAINER ?? "ckk-lc189-app";

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function sql(query: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
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

const bodyText = async (page: Page) =>
  (await page.locator("body").innerText()).replace(/\s+/g, " ");

async function main() {
  // ── A. 2 社目と拠点 ──────────────────────────────────────────────────────
  const ckkId = Number(
    sql(`SELECT id FROM app.own_companies WHERE is_default`),
  );
  sql(`INSERT INTO app.own_companies (code, name, is_default, updated_at)
       VALUES ('TSP', '{"ja":"TSP"}', false, now())
       ON CONFLICT (code) DO NOTHING`);
  const tspId = Number(
    sql(`SELECT id FROM app.own_companies WHERE code = 'TSP'`),
  );
  sql(`INSERT INTO app.plants (code, name, own_company_id, updated_at)
       VALUES ('E2E-TSP', '{"ja":"TSP 工場"}', ${tspId}, now())
       ON CONFLICT (code) DO NOTHING`);
  const userId = sql(`SELECT id FROM app.users WHERE username = 'demo1'`);
  const tspPlant = sql(`SELECT id FROM app.plants WHERE code = 'E2E-TSP'`);
  // demo1 の既存の所属拠点を CKK に、TSP 工場にも所属させる（2 社にまたがる）。
  sql(`UPDATE app.plants SET own_company_id = ${ckkId}
        WHERE id IN (SELECT plant_id FROM app.user_plants WHERE user_id = '${userId}')
          AND own_company_id IS NULL`);
  if (!sql(`SELECT 1 FROM app.user_plants WHERE user_id = '${userId}'`)) {
    const any = sql(
      `SELECT id FROM app.plants WHERE code <> 'E2E-TSP' ORDER BY id LIMIT 1`,
    );
    sql(`UPDATE app.plants SET own_company_id = ${ckkId} WHERE id = ${any}`);
    sql(
      `INSERT INTO app.user_plants (user_id, plant_id) VALUES ('${userId}', ${any})`,
    );
  }
  sql(`INSERT INTO app.user_plants (user_id, plant_id)
       VALUES ('${userId}', ${tspPlant}) ON CONFLICT DO NOTHING`);
  // 承認の段が組まれていると保存が PENDING になる — 見たいのは中身なので外す。
  check(
    "A TSP と拠点を用意",
    tspId > 0 && tspId !== ckkId,
    `ckk=${ckkId} tsp=${tspId}`,
  );

  // CKK の価格表（工具なし・段階 2 本以上）を 1 つ選び、値引きを 1 件持たせる。
  const src =
    sql(`SELECT e.id || '|' || e.customer_bp_id || '|' || e.item_id || '|' || e.doc_ref
      FROM app.price_list_entries e
     WHERE e.own_company_id = ${ckkId} AND e.tool_item_id IS NULL
       AND (SELECT count(*) FROM app.price_list_variants v WHERE v.entry_id = e.id) >= 1
       AND NOT EXISTS (SELECT 1 FROM app.price_list_entries o
                        WHERE o.customer_bp_id = e.customer_bp_id AND o.item_id = e.item_id
                          AND o.own_company_id <> e.own_company_id)
     ORDER BY e.doc_ref LIMIT 1`);
  const [srcId, customer, itemId, srcRef] = src.split("|");
  const variantId = sql(
    `SELECT id FROM app.price_list_variants WHERE entry_id = '${srcId}' ORDER BY order_type LIMIT 1`,
  );
  if (
    !sql(
      `SELECT 1 FROM app.price_list_discounts WHERE variant_id = '${variantId}'`,
    )
  ) {
    sql(`INSERT INTO app.price_list_discounts (id, variant_id, label, discount_type, value, min_quantity, valid_from, is_active, created_at)
         VALUES (gen_random_uuid(), '${variantId}', 'E2E 大口', 'RATE', 5, 100, '2026-01-01', true, now())`);
  }
  check("A CKK の価格表を元にする", Boolean(srcId), srcRef);

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);

  // ── B. 新規作成で TSP を選ぶ → コピーを勧められる ─────────────────────────
  await page.goto(
    `${APP}/sales/price-lists/new?customer=${customer}&product=${itemId}`,
    { waitUntil: "networkidle" },
  );
  const companySelect = page.getByLabel("発行会社", { exact: false }).first();
  await companySelect.click();
  await page.getByRole("option", { name: /TSP/ }).click();
  await page.waitForTimeout(500);
  let body = await bodyText(page);
  check(
    "B 他社の価格表があると勧める",
    body.includes("他社の価格表があります"),
    body.slice(0, 0),
  );
  await page.getByRole("button", { name: /CKK の価格表からコピー/ }).click();
  await page.waitForTimeout(1500);
  body = await bodyText(page);
  check("B コピーした旨と値引きの件数が出る", /値引きルール \d+ 件/.test(body));
  await page.screenshot({ path: "/tmp/plc-new-copied.png", fullPage: true });

  // ── C. 保存 → TSP の価格表 ────────────────────────────────────────────────
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForURL((u) => /\/sales\/price-lists\/TSP/.test(u.pathname), {
    timeout: 30_000,
  });
  const tspUrl = page.url();
  const tspRef = decodeURIComponent(tspUrl.split("/").pop() ?? "").replace(
    "~",
    "/",
  );
  const tspRow = sql(
    `SELECT own_company_id || '|' || id FROM app.price_list_entries WHERE doc_ref = '${tspRef}'`,
  );
  const [tspCompany, tspEntryId] = tspRow.split("|");
  check("C TSP の価格表として入る", Number(tspCompany) === tspId, tspRef);
  const discountCount = sql(
    `SELECT count(*) FROM app.price_list_discounts d JOIN app.price_list_variants v ON v.id = d.variant_id WHERE v.entry_id = '${tspEntryId}'`,
  );
  check(
    "C 値引きルールもコピーされる",
    Number(discountCount) >= 1,
    discountCount,
  );
  await page.waitForLoadState("networkidle");
  body = await bodyText(page);
  check("C 詳細に「CKK と同じ」", body.includes("CKK と同じ"));

  // ── D. 段階の倍率を変える → 差分あり ──────────────────────────────────────
  sql(`UPDATE app.price_list_tiers SET multiplier = multiplier + 0.07
        WHERE id = (SELECT t.id FROM app.price_list_tiers t JOIN app.price_list_variants v ON v.id = t.variant_id
                     WHERE v.entry_id = '${tspEntryId}' ORDER BY v.order_type, t.min_quantity LIMIT 1)`);
  await page.reload({ waitUntil: "networkidle" });
  body = await bodyText(page);
  check("D 詳細に「CKK と差分あり」", body.includes("CKK と差分あり"));
  await page.getByRole("button", { name: "差分を見る" }).click();
  body = await bodyText(page);
  check("D 差分の表に数量段階が出る", body.includes("数量段階 1"));
  await page.screenshot({ path: "/tmp/plc-detail-diff.png", fullPage: true });

  // ── E. 同期 ──────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "CKK の内容で同期" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "CKK の内容で同期" })
    .click();
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: "networkidle" });
  body = await bodyText(page);
  check("E 同期後に「CKK と同じ」", body.includes("CKK と同じ"));
  const tiersOf = (id: string) =>
    sql(`SELECT string_agg(v.order_type || ':' || t.min_quantity || ':' || t.multiplier::text, ',' ORDER BY v.order_type, t.min_quantity)
           FROM app.price_list_tiers t JOIN app.price_list_variants v ON v.id = t.variant_id WHERE v.entry_id = '${id}'`);
  check(
    "E DB の段階が CKK と一致",
    tiersOf(tspEntryId) === tiersOf(srcId),
    `${tiersOf(tspEntryId)} vs ${tiersOf(srcId)}`,
  );
  const audit = sql(
    `SELECT count(*) FROM app.audit_logs WHERE table_name = 'price_list_entries' AND after_data::text LIKE '%syncedFrom%'`,
  );
  check("E 監査に同期元が残る", Number(audit) >= 1, audit);
  await page.screenshot({ path: "/tmp/plc-detail-synced.png", fullPage: true });

  // ── F. 一覧 ──────────────────────────────────────────────────────────────
  await page.goto(`${APP}/sales/price-lists`, { waitUntil: "networkidle" });
  body = await bodyText(page);
  check(
    "F 一覧に発行会社・他社との差分の列",
    body.includes("発行会社") && body.includes("他社との差分"),
  );
  await page.screenshot({ path: "/tmp/plc-list.png", fullPage: false });

  check("G pageerror なし", errors.length === 0, errors.join(" / "));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
