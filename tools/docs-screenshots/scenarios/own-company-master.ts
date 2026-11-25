/**
 * 自社法人マスタ（MS0I）— 2 社目を画面で作り、拠点を付け、会計年度の開始月が
 * 「採番したら閉じる」ことを確かめる。
 *
 * 始まり: デモシード直後（自社法人は CKK の 1 社だけ。CKK はもう書類番号を発行している）。
 * ここだけは 2 社目（TSP）を**画面で**作る — 他のシナリオは fixtures の SQL で用意する。
 */

import { docNumber, docUrl } from "../doc-number";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

const TSP_NAME = "ティー・エス・ピー株式会社";
const TSP_REG_NO = "T9876543210987";

/** SQL を流して、DB が断ったときの文を返す（通ってしまったら null）。 */
function sqlError(s: Scn, script: string): string | null {
  try {
    s.sqlExec(script);
    return null;
  } catch (e) {
    const err = e as { stderr?: string | Buffer; message?: string };
    return String(err.stderr ?? err.message ?? e).trim();
  }
}

/**
 * TSP の会計年度の開始月に入れる値 — **今日の年度が CKK（4 月始まり）と違う**月を選ぶ。
 * 年度のラベルは「始まる年」なので、今日の月より後の月を開始月にすると今日は前年度になる。
 * 12 月だけは、どの開始月でも CKK と同じ年度になる（その月は年度の違いを確かめない）。
 */
function tspStartMonth(jstMonth: number): number {
  if (jstMonth < 4) return 1;
  return jstMonth < 12 ? jstMonth + 1 : 1;
}

export const ownCompanyMaster: Scenario = {
  id: "own-company-master",
  title: "自社法人マスタ — 2 社目の作成・拠点の付け替え・会計年度の開始月のロック",
  feature: "G 自社法人マスタ (#977 / #979)",
  user: "admin",
  steps: [
    {
      caption: "自社法人マスタ（MS0I）を開く — シード直後は既定の CKK 1 社だけ",
      run: async (s) => {
        await s.goto("/master/own-companies");
        await s.see("シー・ケィ・ケー株式会社");
        await s.checkVisible("CKK に「既定」の印が付いている", "既定", { exact: true });
        const companies = s.sql("select string_agg(code, ',' order by id) from app.own_companies");
        s.check("DB の自社法人は CKK だけ", companies === "CKK", companies);
      },
    },
    {
      caption: "2 社目 TSP を作る — 法人コードに「~」は使えず、登録番号は T + 13 桁でないと保存できない",
      run: async (s) => {
        const p = s.page;
        await s.goto("/master/own-companies/new");
        await s.fill(p.getByRole("textbox", { name: "法人コード" }), "T~SP");
        await s.fill(p.getByRole("textbox", { name: "名称（日本語）" }), TSP_NAME);
        await s.fill(p.getByRole("textbox", { name: "適格請求書発行事業者登録番号" }), "T12345");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.checkVisible("登録番号の形が違うと、欄の下に理由が出る", "登録番号は T + 13 桁で入力してください");
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("登録番号の形が違う");

        await s.fill(p.getByRole("textbox", { name: "適格請求書発行事業者登録番号" }), TSP_REG_NO);
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.checkVisible("区切りと紛れる文字（~）を含む法人コードは断られる", "法人コードに「/」「~」と空白は使えません");
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("法人コードに ~ は使えない");
        s.check("断られた時点では TSP は出来ていない", s.sql("select count(*) from app.own_companies") === "1", s.sql("select count(*) from app.own_companies"));

        await s.fill(p.getByRole("textbox", { name: "法人コード" }), "TSP");
        await s.fill(p.getByRole("textbox", { name: "郵便番号" }), "460-0008");
        await s.fill(p.getByRole("textbox", { name: "住所（日本語）" }), "愛知県名古屋市中区栄1丁目2番3号");
        await s.fill(p.getByRole("textbox", { name: "電話番号" }), "052-000-1111");
        const month = p.getByRole("textbox", { name: "会計年度の開始月" });
        s.check("会計年度の開始月の初期値は 4", (await month.inputValue()) === "4", await month.inputValue());
        await s.shot("入力し終えたフォーム");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(/\/master\/own-companies\/\d+$/);
        await s.see(TSP_NAME);
        await s.checkVisible("詳細に登録番号が出る", TSP_REG_NO);
        await s.checkVisible("詳細に会計年度の開始月が出る", "4 月", { exact: true });
        // 不備 2 回 → 保存成功。成功の通知が出たら、前のエラーの通知は消える
        // （以前は詳細画面へ移っても赤 2 枚が緑 1 枚と並んで残っていた）。
        const toasts = p.locator(".mantine-Notification-root");
        const redToasts = async () =>
          (await toasts.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.getPropertyValue("--notification-color")))).filter((c) => /red/.test(c)).length;
        await p.waitForTimeout(800);
        s.check("保存に成功した画面に、前のエラーの通知が残っていない", (await redToasts()) === 0, await toasts.allInnerTexts());
        const row = s.sql(
          "select code, invoice_registration_no, fiscal_year_start_month, is_default, is_active from app.own_companies where code = 'TSP'",
        );
        s.check("DB に TSP が出来た（既定ではない・有効）", row === `TSP|${TSP_REG_NO}|4|f|t`, row);
      },
    },
    {
      caption: "TSP を編集する — 法人コードは変えられない。まだ採番していないので会計年度の開始月は変えられる",
      run: async (s) => {
        const p = s.page;
        const id = s.sql("select id from app.own_companies where code = 'TSP'");
        await s.goto(`/master/own-companies/${id}/edit`);
        const code = p.getByRole("textbox", { name: "法人コード" });
        await code.waitFor({ state: "visible" });
        s.check("法人コードの欄は入力できない", await code.isDisabled(), `disabled=${await code.isDisabled()} value=${await code.inputValue()}`);
        await s.checkVisible("変えられない理由が欄に書いてある", "作成後は変更できません");

        const denied = sqlError(s, "update app.own_companies set code = 'TSQ' where code = 'TSP'");
        s.check("DB に直接 UPDATE しても法人コードは変わらない（トリガーが断る）", denied !== null && /immutable/.test(denied), denied ?? "UPDATE が通ってしまった");
        s.check("法人コードは TSP のまま", s.sql("select count(*) from app.own_companies where code = 'TSP'") === "1", s.sql("select string_agg(code, ',') from app.own_companies"));

        const jstMonth = Number(s.sql("select extract(month from (now() at time zone 'Asia/Tokyo'))::int"));
        const start = tspStartMonth(jstMonth);
        const month = p.getByRole("textbox", { name: "会計年度の開始月" });
        s.check("採番していない法人の開始月の欄は入力できる", await month.isEnabled(), `enabled=${await month.isEnabled()}`);
        await s.fill(month, String(start));
        await s.shot(`開始月を ${start} 月に変える`);
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(/\/master\/own-companies\/\d+$/);
        await s.checkVisible("詳細の開始月が変わっている", `${start} 月`, { exact: true });
        const saved = s.sql("select fiscal_year_start_month from app.own_companies where code = 'TSP'");
        s.check("DB の開始月も変わっている", saved === String(start), saved);
      },
    },
    {
      caption: "拠点マスタで第二工場（F02）を TSP に付ける — 自社法人の「拠点」タブに並ぶ",
      run: async (s) => {
        const p = s.page;
        const plantId = s.sql("select id from app.plants where code = 'F02'");
        await s.goto(`/master/plants/${plantId}/edit`);
        await s.pick(p.getByRole("combobox", { name: /^自社法人/ }), /^TSP /);
        await s.shot("拠点の自社法人に TSP を選ぶ");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(/\/master\/plants\/\d+$/);
        await s.checkVisible("拠点の詳細に自社法人が出る", new RegExp(TSP_NAME));
        const owner = s.sql(
          "select c.code from app.plants p join app.own_companies c on c.id = p.own_company_id where p.code = 'F02'",
        );
        s.check("DB でも F02 は TSP に属している", owner === "TSP", owner);

        const id = s.sql("select id from app.own_companies where code = 'TSP'");
        await s.goto(`/master/own-companies/${id}`);
        await s.click(p.getByRole("tab", { name: "拠点" }));
        await s.checkVisible("TSP の「拠点」タブに第二工場が並ぶ", "第二工場");
        await s.shot("TSP の拠点タブ");
        await s.goto("/master/own-companies");
        const tspRow = p.getByRole("row", { name: /TSP/ });
        const cells = await tspRow.getByRole("cell").allInnerTexts();
        s.check("一覧の TSP の拠点数が 1", cells[3]?.trim() === "1", cells.join(" | "));
      },
    },
    {
      caption: "CKK を編集する — もう書類番号を発行しているので、会計年度の開始月は閉じていて理由が出る",
      run: async (s) => {
        const p = s.page;
        const id = s.sql("select id from app.own_companies where code = 'CKK'");
        const issued = s.sql(`select count(*) from app.document_sequences where own_company_id = ${id}`);
        s.check("CKK には採番の記録（document_sequences）がある", Number(issued) > 0, `${issued} 行`);
        await s.goto(`/master/own-companies/${id}/edit`);
        const month = p.getByRole("textbox", { name: "会計年度の開始月" });
        await month.waitFor({ state: "visible" });
        s.check("CKK の開始月の欄は入力できない", await month.isDisabled(), `disabled=${await month.isDisabled()} value=${await month.inputValue()}`);
        await s.checkVisible(
          "閉じている理由が欄に書いてある",
          "この法人はすでに書類番号を発行しているため、会計年度の開始月は変えられません",
        );
        const denied = sqlError(s, "update app.own_companies set fiscal_year_start_month = 1 where code = 'CKK'");
        s.check("DB に直接 UPDATE しても開始月は変わらない（トリガーが断る）", denied !== null && /locked/.test(denied), denied ?? "UPDATE が通ってしまった");
        const still = s.sql("select fiscal_year_start_month from app.own_companies where code = 'CKK'");
        s.check("CKK の開始月は 4 のまま", still === "4", still);
      },
    },
    {
      caption: "TSP の拠点で購買依頼を 1 件作る — TSP の年度で 1 番が振られ、以後は TSP の開始月も閉じる",
      run: async (s) => {
        const p = s.page;
        const tsp = s.sql("select id from app.own_companies where code = 'TSP'");
        const before = s.sql(`select count(*) from app.document_sequences where own_company_id = ${tsp}`);
        s.check("作る前、TSP はまだ 1 枚も採番していない", before === "0", `${before} 行`);

        await s.goto("/purchase/purchase-requests/new");
        await s.fill(p.getByRole("textbox", { name: /^依頼理由/ }), "TSP の最初の書類（採番の確認）");
        await s.pick(p.getByRole("combobox", { name: /^素材/ }).first(), /B01A0001-A060-310/, { search: "B01A0001-A060" });
        await s.pick(p.getByRole("combobox", { name: /^入荷先拠点/ }).first(), /第二工場/);
        await s.fill(p.getByRole("textbox", { name: "数量" }).first(), "10");
        await s.pickDate(p.getByRole("button", { name: /^希望納期/ }).first(), { nextMonthDay: 10 });
        await s.shot("入荷先拠点を第二工場（TSP）にした購買依頼");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/purchase/purchase-requests", "PRQ"));
        await s.see(docNumber("PRQ"));
        await s.shot("TSP の最初の書類（購買依頼）");

        const doc = s.sql(
          `select c.code, r.doc_number, r.fiscal_year, r.doc_seq, r.doc_ref from app.purchase_requests r join app.own_companies c on c.id = r.own_company_id where r.own_company_id = ${tsp}`,
        );
        const [, number, fy, seq, ref] = doc.split("|");
        const expectedFy = s.sql(
          `select app.fiscal_year_of(fiscal_year_start_month::int, app.jst_date(now())) from app.own_companies where id = ${tsp}`,
        );
        const ckkFy = s.sql(
          "select app.fiscal_year_of(fiscal_year_start_month::int, app.jst_date(now())) from app.own_companies where code = 'CKK'",
        );
        s.check("購買依頼は TSP の書類になり、TSP の 1 番が振られた", seq === "1" && number === `PRQ-${expectedFy}-00001`, doc);
        s.check("年度は TSP の開始月で決まる（起票日の日本時間）", fy === expectedFy, `番号の年度 ${fy} / TSP の今日の年度 ${expectedFy} / CKK の今日の年度 ${ckkFy}`);
        const jstMonth = Number(s.sql("select extract(month from (now() at time zone 'Asia/Tokyo'))::int"));
        if (jstMonth !== 12) {
          s.check("同じ日でも、開始月が違う TSP と CKK では年度が違う", fy !== ckkFy, `TSP ${fy} / CKK ${ckkFy}`);
        }
        s.check("参照は 法人コード/番号", ref === `TSP/${number}`, ref);
        s.check("URL は 法人コード~番号", new RegExp(`/purchase/purchase-requests/TSP(~|%7E)${number}$`).test(p.url()), p.url());
        const seqRow = s.sql(
          `select key || ':' || fiscal_year || ':' || last_seq from app.document_sequences where own_company_id = ${tsp}`,
        );
        s.check("document_sequences に TSP の行が出来た", seqRow === `PURCHASE_REQUEST:${expectedFy}:1`, seqRow);

        await s.goto(`/master/own-companies/${tsp}/edit`);
        const month = p.getByRole("textbox", { name: "会計年度の開始月" });
        await month.waitFor({ state: "visible" });
        s.check("採番したあとは TSP の開始月も入力できない", await month.isDisabled(), `disabled=${await month.isDisabled()}`);
        await s.checkVisible(
          "TSP にも閉じている理由が出る",
          "この法人はすでに書類番号を発行しているため、会計年度の開始月は変えられません",
        );
        const denied = sqlError(s, "update app.own_companies set fiscal_year_start_month = 4 where code = 'TSP'");
        s.check("DB に直接 UPDATE しても TSP の開始月は変わらない", denied !== null && /locked/.test(denied), denied ?? "UPDATE が通ってしまった");
      },
    },
  ],
};
