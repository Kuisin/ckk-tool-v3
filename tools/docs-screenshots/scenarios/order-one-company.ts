/**
 * 注文請書 1 件 = 自社法人 1 つ。明細の担当拠点はどれも請書の法人に属していなければ
 * ならない。あわせて「発行会社」の欄が、2 社にまたがる人にだけ出ることを確かめる。
 *
 * 始まり: fixtures/company-tsp.sql（TSP と、F01 = CKK / F02 = TSP）+
 * fixtures/order-one-company.sql（担当者 demo2 を F01 だけに所属させる）。
 *   承認者 demo_shot … F01・F02 に所属 = 2 社にまたがる人
 *   担当者 demo2     … F01 だけ       = CKK にしか属さない人
 */

import { docNumber, docUrl } from "../doc-number";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

const MISMATCH = "担当拠点がこの注文請書の自社法人（CKK）に属していません";

function fiscalYearToday(s: Scn, code: string): string {
  return s.sql(
    `select app.fiscal_year_of(fiscal_year_start_month::int, app.jst_date(now())) from app.own_companies where code = '${code}'`,
  );
}

function idFromUrl(s: Scn): string {
  return decodeURIComponent(new URL(s.page.url()).pathname.split("/").pop() ?? "");
}

const orderCount = (s: Scn) => s.sql("select count(*) from app.order_acceptances");

/** 明細 n 行目（0 始まり）に製品・数量・納期・担当拠点を入れる。 */
async function fillLine(s: Scn, n: number, product: { pick: RegExp; search: string }, quantity: string, plant: RegExp): Promise<void> {
  const p = s.page;
  await s.pick(p.getByRole("combobox", { name: "製品" }).nth(n), product.pick, { search: product.search });
  await s.fill(p.getByRole("textbox", { name: "数量" }).nth(n), quantity);
  await s.pickDate(p.getByRole("button", { name: "納期" }).nth(n), { nextMonthDay: 25 });
  await setPlant(s, n, plant);
}

/** 明細 n 行目の「配送」を開いて担当拠点を選ぶ（開いていればそのまま）。 */
async function setPlant(s: Scn, n: number, plant: RegExp): Promise<void> {
  const p = s.page;
  const plants = p.getByRole("combobox", { name: /^担当拠点/ });
  if ((await plants.count()) <= n || !(await plants.nth(n).isVisible())) {
    await s.click(p.getByRole("button", { name: /^配送/ }).nth(n));
  }
  await s.pick(p.getByRole("combobox", { name: /^担当拠点/ }).nth(n), plant);
}

const ENDMILL = { pick: /超硬エンドミル/, search: "エンドミル" };
const DRILL = { pick: /超硬ドリル/, search: "ドリル" };

/** その画面に「発行会社」の欄があるか（フォームが描かれるのを待ってから数える）。 */
async function hasIssuingCompany(s: Scn, path: string, ready: RegExp): Promise<boolean> {
  await s.goto(path);
  await s.page.getByRole("combobox", { name: ready }).first().waitFor({ state: "visible", timeout: 20_000 });
  return (await s.page.getByRole("combobox", { name: /^発行会社/ }).count()) > 0;
}

export const orderOneCompany: Scenario = {
  id: "order-one-company",
  title: "注文請書は 1 社のもの — 別の法人の拠点は混ぜられない／発行会社の欄が出る人・出ない人",
  feature: "PR 9 書類番号（法人 × 年度の連番） (#979 / #980 / #982 / #985 / #990)",
  user: "approver",
  fixtures: ["scenarios/fixtures/company-tsp.sql", "scenarios/fixtures/order-one-company.sql"],
  steps: [
    {
      caption: "注文請書を作る — 1 行目は本社工場（CKK）、2 行目は第二工場（TSP）。別の法人の拠点が混ざると保存できない",
      run: async (s) => {
        const p = s.page;
        const before = orderCount(s);
        const seqBefore = s.sql("select coalesce(sum(last_seq), 0) from app.document_sequences where key = 'ORDER'");
        await s.goto("/sales/order-acceptances/new");
        await s.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/, { search: "デモ商事" });
        await s.fill(p.getByRole("textbox", { name: /^顧客注文書番号/ }), "PO-ONE-COMPANY-1");
        await s.pickDate(p.getByRole("button", { name: /^注文日/ }), "today");
        s.check(
          "注文請書の作成画面に「発行会社」の欄は無い（法人は担当拠点から決まる）",
          (await p.getByRole("combobox", { name: /^発行会社/ }).count()) === 0,
          `${await p.getByRole("combobox", { name: /^発行会社/ }).count()} 個`,
        );
        await fillLine(s, 0, ENDMILL, "10", /本社工場/);
        await s.click(p.getByRole("button", { name: "明細を追加" }));
        await fillLine(s, 1, DRILL, "5", /第二工場/);
        await s.shot("1 行目 = 本社工場（CKK）/ 2 行目 = 第二工場（TSP）");
        await s.click(p.getByRole("button", { name: "下書きを作成" }));
        await s.checkVisible("どの行の拠点が合わないかを書いたエラーが出る", `明細 2 行目: ${MISMATCH}`);
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("別の法人の拠点が混ざっていて保存できない");
        s.check("注文請書は出来ていない", orderCount(s) === before, `${before} → ${orderCount(s)}`);
        const seqAfter = s.sql("select coalesce(sum(last_seq), 0) from app.document_sequences where key = 'ORDER'");
        s.check("断られた保存では番号を消費しない", seqAfter === seqBefore, `${seqBefore} → ${seqAfter}`);
      },
    },
    {
      caption: "2 行目も本社工場に直すと保存できる — 注文請書は CKK の書類になり、CKK の続き番が振られる",
      run: async (s) => {
        const p = s.page;
        const fy = fiscalYearToday(s, "CKK");
        const last = Number(s.sql(`select last_seq from app.document_sequences q join app.own_companies c on c.id = q.own_company_id where q.key = 'ORDER' and c.code = 'CKK' and q.fiscal_year = ${fy}`));
        await setPlant(s, 1, /本社工場/);
        await s.click(p.getByRole("button", { name: "下書きを作成" }));
        await s.waitForUrl(docUrl("/sales/order-acceptances", "ORD", "", true));
        await s.see(docNumber("ORD"));
        const expected = `ORD-${fy}-${String(last + 1).padStart(5, "0")}`;
        s.check(`URL は CKK~${expected}`, idFromUrl(s) === `CKK~${expected}`, p.url());
        const row = s.sql(
          `select c.code || '|' || o.doc_number || '|' || (select string_agg(pl.code, ',' order by l.sort_order) from app.order_lines l join app.plants pl on pl.id = l.assigned_plant_id where l.acceptance_id = o.id) from app.order_acceptances o join app.own_companies c on c.id = o.own_company_id where o.customer_order_ref = 'PO-ONE-COMPANY-1'`,
        );
        s.check("DB: 法人は CKK、明細の担当拠点は 2 行とも F01", row === `CKK|${expected}|F01,F01`, row);
      },
    },
    {
      caption: "作ったあとの編集でも同じ — CKK の注文請書の明細を第二工場（TSP）に変えると保存できない",
      run: async (s) => {
        const p = s.page;
        await s.click(p.getByRole("button", { name: "編集", exact: true }).first());
        // 注文請書の編集は詳細画面の中で切り替わる（URL は変わらない）。
        await s.see("編集中", { exact: true });
        await setPlant(s, 1, /第二工場/);
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.checkVisible("編集でも、合わない行を書いたエラーが出る", `明細 2 行目: ${MISMATCH}`);
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("編集で別の法人の拠点に変えても保存できない");
        const plants = s.sql(
          "select string_agg(pl.code, ',' order by l.sort_order) from app.order_lines l join app.plants pl on pl.id = l.assigned_plant_id join app.order_acceptances o on o.id = l.acceptance_id where o.customer_order_ref = 'PO-ONE-COMPANY-1'",
        );
        s.check("DB の担当拠点は F01 のまま", plants === "F01,F01", plants);
      },
    },
    {
      caption: "明細がすべて第二工場（TSP）の注文請書 — TSP の書類になり、TSP の 1 番が振られる",
      run: async (s) => {
        const p = s.page;
        const fy = fiscalYearToday(s, "TSP");
        await s.goto("/sales/order-acceptances/new");
        await s.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/, { search: "デモ商事" });
        await s.fill(p.getByRole("textbox", { name: /^顧客注文書番号/ }), "PO-ONE-COMPANY-2");
        await s.pickDate(p.getByRole("button", { name: /^注文日/ }), "today");
        await fillLine(s, 0, ENDMILL, "10", /第二工場/);
        await s.shot("担当拠点 = 第二工場（TSP）だけの注文請書");
        await s.click(p.getByRole("button", { name: "下書きを作成" }));
        await s.waitForUrl(docUrl("/sales/order-acceptances", "ORD", "", true));
        await s.see(docNumber("ORD"));
        const expected = `ORD-${fy}-00001`;
        s.check(`URL は TSP~${expected}`, idFromUrl(s) === `TSP~${expected}`, p.url());
        const row = s.sql(
          "select c.code || '|' || o.doc_ref from app.order_acceptances o join app.own_companies c on c.id = o.own_company_id where o.customer_order_ref = 'PO-ONE-COMPANY-2'",
        );
        s.check("DB: 法人は TSP、参照は TSP/番号", row === `TSP|TSP/${expected}`, row);
      },
    },
    {
      caption: "2 社にまたがる人（承認者）— 見積書・価格試算・価格表の作成画面に「発行会社」が出る",
      run: async (s) => {
        const plants = s.sql(
          "select string_agg(p.code || '=' || c.code, ',' order by p.code) from app.user_plants up join app.users u on u.id = up.user_id join app.plants p on p.id = up.plant_id join app.own_companies c on c.id = p.own_company_id where u.username = 'demo_shot'",
        );
        s.check("承認者は CKK の拠点と TSP の拠点の両方に所属している", plants === "F01=CKK,F02=TSP", plants);
        const quote = await hasIssuingCompany(s, "/sales/quotes/new", /^営業担当/);
        s.check("見積書の作成画面に発行会社が出る", quote, String(quote));
        await s.shot("見積書（2 社にまたがる人）");
        const estimate = await hasIssuingCompany(s, "/sales/trial-estimates/new", /^材種/);
        s.check("価格試算の作成画面に発行会社が出る", estimate, String(estimate));
        await s.shot("価格試算（2 社にまたがる人）");
        const priceList = await hasIssuingCompany(s, "/sales/price-lists/new", /^営業担当/);
        s.check("価格表の作成画面に発行会社が出る", priceList, String(priceList));
        await s.shot("価格表（2 社にまたがる人）");
        const options = s.page.getByRole("combobox", { name: /^発行会社/ });
        await s.click(options);
        const labels = await s.page.getByRole("option").allInnerTexts();
        s.check("選べるのは自分の所属拠点の法人（CKK と TSP）", labels.length === 2 && labels.some((l) => l.startsWith("CKK ")) && labels.some((l) => l.startsWith("TSP ")), labels.join(" / "));
        await s.page.keyboard.press("Escape");

        // 一覧では、番号の隣の発行会社バッジでどちらの法人の書類かが読める。
        await s.goto("/sales/order-acceptances");
        await s.see(docNumber("ORD"));
        const tsp = await s.page.locator('tbody [data-doc-company="TSP"]').count();
        const ckk = await s.page.locator('tbody [data-doc-company="CKK"]').count();
        s.check("注文請書の一覧に TSP と CKK のバッジが出る（2 社にまたがる人）", tsp > 0 && ckk > 0, `TSP ${tsp} / CKK ${ckk}`);
        await s.shot("注文請書の一覧 — 発行会社のバッジ（2 社にまたがる人）");
      },
    },
    {
      caption: "1 社にしか属さない人（担当者）— 発行会社の欄は出ず、作った見積書はその人の法人（CKK）になる",
      run: async (s) => {
        const p = s.page;
        await s.switchUser("staff", "/sales/quotes/new");
        const plants = s.sql(
          "select string_agg(p.code || '=' || c.code, ',' order by p.code) from app.user_plants up join app.users u on u.id = up.user_id join app.plants p on p.id = up.plant_id join app.own_companies c on c.id = p.own_company_id where u.username = 'demo2'",
        );
        s.check("担当者は CKK の拠点にだけ所属している", plants === "F01=CKK", plants);
        const quote = await hasIssuingCompany(s, "/sales/quotes/new", /^営業担当/);
        s.check("見積書の作成画面に発行会社は出ない", !quote, String(quote));
        await s.shot("見積書（1 社にしか属さない人）");
        const estimate = await hasIssuingCompany(s, "/sales/trial-estimates/new", /^材種/);
        s.check("価格試算の作成画面に発行会社は出ない", !estimate, String(estimate));
        const priceList = await hasIssuingCompany(s, "/sales/price-lists/new", /^営業担当/);
        s.check("価格表の作成画面に発行会社は出ない", !priceList, String(priceList));
        await s.shot("価格表（1 社にしか属さない人）");

        await s.goto("/sales/quotes/new");
        await s.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/);
        await s.pickDate(p.getByRole("button", { name: /^有効期限/ }), { nextMonthDay: 20 });
        await s.pick(p.getByRole("combobox", { name: "製品" }).first(), /超硬エンドミル/, { search: "エンドミル" });
        await s.fill(p.getByRole("textbox", { name: "数量" }).first(), "30");
        await s.see("単価（価格表）");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/sales/quotes", "QOT"));
        await s.see(docNumber("QOT"));
        s.check("欄が無くても、見積書は担当者の法人（CKK）で作られる", idFromUrl(s).startsWith("CKK~QOT-"), p.url());
        const detailBadges = await p.locator("[data-doc-company]").count();
        s.check("1 社だけの人の詳細には発行会社のバッジが出ない", detailBadges === 0, `${detailBadges} 個`);

        await s.goto("/sales/quotes");
        await s.see(docNumber("QOT"));
        const listCkk = await p.locator('[data-doc-company="CKK"]').count();
        s.check("1 社だけの人の一覧には、自分の法人（CKK）のバッジは出ない", listCkk === 0, `${listCkk} 個`);
        await s.shot("見積書の一覧（1 社にしか属さない人）");
      },
    },
  ],
};
