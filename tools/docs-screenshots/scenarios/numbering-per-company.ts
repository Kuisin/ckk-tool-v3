/**
 * 書類番号は「自社法人 × 会計年度」ごとの連番 — CKK と TSP で同じ種類の書類を作り、
 * 番号・URL・PDF の発行元・旧番号・同じ番号が 2 社にあるときの開き方を確かめる。
 *
 * 始まり: fixtures/company-tsp.sql（TSP と、F02 = TSP の拠点）。操作するのは
 * 承認者（demo_shot）— F01（CKK）と F02（TSP）の両方に所属しているので、
 * 拠点を持たない書類（見積書・価格表）に「発行会社」の欄が出る。
 */

import { docNumber, docUrl } from "../doc-number";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

const CKK_NAME = "シー・ケィ・ケー株式会社";
const TSP_NAME = "ティー・エス・ピー株式会社";
const CKK_REG_NO = "T1234567890123";
const TSP_REG_NO = "T9876543210987";

/** その法人の、今日（日本時間）の会計年度。 */
function fiscalYearToday(s: Scn, code: string): string {
  return s.sql(
    `select app.fiscal_year_of(fiscal_year_start_month::int, app.jst_date(now())) from app.own_companies where code = '${code}'`,
  );
}

/** document_sequences の last_seq（行が無ければ 0）。 */
function lastSeq(s: Scn, key: string, code: string): number {
  const fy = fiscalYearToday(s, code);
  const v = s.sql(
    `select coalesce((select last_seq from app.document_sequences q join app.own_companies c on c.id = q.own_company_id where q.key = '${key}' and c.code = '${code}' and q.fiscal_year = ${fy}), 0)`,
  );
  return Number(v);
}

const pad = (n: number) => String(n).padStart(5, "0");

/** いま開いている詳細画面の URL から id（`CKK~QOT-2026-00003`）を取り出す。 */
function idFromUrl(s: Scn): string {
  return decodeURIComponent(new URL(s.page.url()).pathname.split("/").pop() ?? "");
}

function sqlError(s: Scn, script: string): string | null {
  try {
    s.sqlExec(script);
    return null;
  } catch (e) {
    const err = e as { stderr?: string | Buffer; message?: string };
    return String(err.stderr ?? err.message ?? e).trim();
  }
}

/** 見積書を 1 件作る（顧客 = デモ商事 / 製品 = 超硬エンドミル 30 本）。発行会社は渡したときだけ選ぶ。 */
async function createQuote(s: Scn, company?: RegExp): Promise<void> {
  const p = s.page;
  await s.goto("/sales/quotes/new");
  await s.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/);
  if (company) await s.pick(p.getByRole("combobox", { name: /^発行会社/ }), company);
  await s.pickDate(p.getByRole("button", { name: /^有効期限/ }), { nextMonthDay: 20 });
  await s.pick(p.getByRole("combobox", { name: "製品" }).first(), /超硬エンドミル/, { search: "エンドミル" });
  await s.fill(p.getByRole("textbox", { name: "数量" }).first(), "30");
  await s.see("単価（価格表）");
}

export const numberingPerCompany: Scenario = {
  id: "numbering-per-company",
  title: "書類番号 — 自社法人 × 会計年度ごとの連番（CKK と TSP）",
  feature: "PR 9 書類番号（法人 × 年度の連番） (#979 / #980 / #982 / #985 / #990)",
  user: "approver",
  pdf: true,
  fixtures: ["scenarios/fixtures/company-tsp.sql"],
  steps: [
    {
      caption: "CKK の見積書を作る — 2 社にまたがる人には「発行会社」が出て、初期値は既定の CKK。番号は CKK の続き番",
      run: async (s) => {
        const p = s.page;
        const fy = fiscalYearToday(s, "CKK");
        const before = lastSeq(s, "QUOTE", "CKK");
        await createQuote(s);
        const company = p.getByRole("combobox", { name: /^発行会社/ });
        s.check("発行会社の欄が出ている", (await company.count()) === 1, `${await company.count()} 個`);
        const initial = await company.inputValue();
        s.check("発行会社の初期値は既定の法人（CKK）", initial.startsWith("CKK "), initial);
        await s.shot("発行会社 = CKK のまま保存する前");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/sales/quotes", "QOT"));
        await s.see(docNumber("QOT"));
        const expected = `QOT-${fy}-${pad(before + 1)}`;
        s.check(`URL は CKK~${expected}`, idFromUrl(s) === `CKK~${expected}`, p.url());
        const row = s.sql(
          `select c.code, q.doc_number, q.fiscal_year, q.doc_seq, q.doc_ref, coalesce(q.legacy_number, '') from app.quotes q join app.own_companies c on c.id = q.own_company_id order by q.created_at desc limit 1`,
        );
        s.check("DB: CKK の続き番・参照は CKK/番号・旧番号は無い", row === `CKK|${expected}|${fy}|${before + 1}|CKK/${expected}|`, row);
        s.check("document_sequences（QUOTE × CKK）が 1 進んだ", lastSeq(s, "QUOTE", "CKK") === before + 1, `${before} → ${lastSeq(s, "QUOTE", "CKK")}`);
      },
    },
    {
      caption: "TSP の価格表を作る — 価格表は法人ごと。CKK のものをコピーすると、番号は TSP の 1 番になる",
      run: async (s) => {
        const p = s.page;
        const fy = fiscalYearToday(s, "TSP");
        const ckkBefore = lastSeq(s, "PRICE_LIST", "CKK");
        s.check("作る前、TSP は価格表を 1 枚も採番していない", lastSeq(s, "PRICE_LIST", "TSP") === 0, String(lastSeq(s, "PRICE_LIST", "TSP")));
        await s.goto("/sales/price-lists/new");
        await s.pick(p.getByRole("combobox", { name: /^発行会社/ }), /^TSP /);
        await s.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/, { search: "デモ商事" });
        await s.pick(p.getByRole("combobox", { name: /^製品/ }), /超硬エンドミル/, { search: "エンドミル" });
        await s.see("他社の価格表があります");
        await s.shot("他社（CKK）の価格表からコピーできる");
        await s.click(p.getByRole("button", { name: /の価格表からコピー/ }));
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/sales/price-lists", "PRC"));
        const expected = `PRC-${fy}-00001`;
        s.check(`URL は TSP~${expected}`, idFromUrl(s) === `TSP~${expected}`, p.url());
        await s.checkVisible("詳細に発行会社（TSP）が出る", new RegExp(`TSP ${TSP_NAME}`));
        s.check("document_sequences（PRICE_LIST × TSP）= 1", lastSeq(s, "PRICE_LIST", "TSP") === 1, String(lastSeq(s, "PRICE_LIST", "TSP")));
        s.check("CKK の連番は動かない", lastSeq(s, "PRICE_LIST", "CKK") === ckkBefore, `${ckkBefore} → ${lastSeq(s, "PRICE_LIST", "CKK")}`);
      },
    },
    {
      caption: "TSP の見積書を作る — 発行会社を TSP にすると TSP の 1 番。番号・法人・年度は保存後に変えられない",
      run: async (s) => {
        const p = s.page;
        const fy = fiscalYearToday(s, "TSP");
        const ckkBefore = lastSeq(s, "QUOTE", "CKK");
        await createQuote(s, /^TSP /);
        await s.shot("発行会社 = TSP");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/sales/quotes", "QOT"));
        await s.see(docNumber("QOT"));
        const expected = `QOT-${fy}-00001`;
        s.check(`URL は TSP~${expected}`, idFromUrl(s) === `TSP~${expected}`, p.url());
        const row = s.sql(
          `select c.code, q.doc_number, q.doc_seq, q.doc_ref from app.quotes q join app.own_companies c on c.id = q.own_company_id order by q.created_at desc limit 1`,
        );
        s.check("DB: TSP の 1 番・参照は TSP/番号", row === `TSP|${expected}|1|TSP/${expected}`, row);
        s.check("document_sequences（QUOTE × TSP）= 1", lastSeq(s, "QUOTE", "TSP") === 1, String(lastSeq(s, "QUOTE", "TSP")));
        s.check("CKK の連番は動かない", lastSeq(s, "QUOTE", "CKK") === ckkBefore, `${ckkBefore} → ${lastSeq(s, "QUOTE", "CKK")}`);
        await s.checkVisible("見積書の詳細で、どの法人の書類かが読める（発行会社 / 発行元）", new RegExp(`${TSP_NAME}|TSP `), { wait: 3000 });

        const number = sqlError(s, `update app.quotes set doc_number = 'QOT-${fy}-09999' where doc_ref = 'TSP/${expected}'`);
        s.check("DB に直接 UPDATE しても番号は変わらない", number !== null, number ?? "UPDATE が通ってしまった");
        const company = sqlError(
          s,
          `update app.quotes set own_company_id = (select id from app.own_companies where code = 'CKK') where doc_ref = 'TSP/${expected}'`,
        );
        s.check("DB に直接 UPDATE しても発行元の法人は変わらない", company !== null, company ?? "UPDATE が通ってしまった");
        const year = sqlError(s, `update app.quotes set fiscal_year = fiscal_year + 1 where doc_ref = 'TSP/${expected}'`);
        s.check("DB に直接 UPDATE しても会計年度は変わらない", year !== null, year ?? "UPDATE が通ってしまった");
      },
    },
    {
      caption: "見積書を発行して PDF を出す — 発行元の欄（社名・住所・登録番号）は、その書類の法人のものになる",
      run: async (s) => {
        const fyTsp = fiscalYearToday(s, "TSP");
        const tspId = `TSP~QOT-${fyTsp}-00001`;
        // PDF は発行済みの見積書だけが出せる。2 通とも画面から発行する。
        const issue = async (id: string) => {
          await s.goto(`/sales/quotes/${id}`);
          await s.menu("発行");
          await s.clickInDialog("発行");
          await s.see("発行済", { exact: true });
        };
        await issue(tspId);
        await s.shot("発行した TSP の見積書");
        const tsp = await s.pdf("TSP の見積書", `/api/pdf/quote?id=${encodeURIComponent(tspId)}&force=1`);
        const tspText = tsp.replace(/\s+/g, " ");
        s.check("TSP の見積書 PDF に TSP の社名が載る", tspText.includes(TSP_NAME), tspText.slice(0, 400));
        s.check("TSP の見積書 PDF に TSP の登録番号が載る", tspText.includes(TSP_REG_NO), tspText.slice(0, 400));
        s.check("TSP の見積書 PDF に TSP の住所が載る", tspText.includes("名古屋市中区栄"), tspText.slice(0, 400));
        s.check("TSP の見積書 PDF に CKK の社名・登録番号は載らない", !tspText.includes(CKK_NAME) && !tspText.includes(CKK_REG_NO), tspText.slice(0, 400));
        s.check("TSP の見積書 PDF に番号が載る", tspText.includes(`QOT-${fyTsp}-00001`), tspText.slice(0, 400));

        const ckkId = s.sql(
          "select replace(q.doc_ref, '/', '~') from app.quotes q join app.own_companies c on c.id = q.own_company_id where c.code = 'CKK' order by q.created_at desc limit 1",
        );
        await issue(ckkId);
        const ckk = await s.pdf("CKK の見積書", `/api/pdf/quote?id=${encodeURIComponent(ckkId)}&force=1`);
        const ckkText = ckk.replace(/\s+/g, " ");
        s.check("CKK の見積書 PDF に CKK の社名と登録番号が載る", ckkText.includes(CKK_NAME) && ckkText.includes(CKK_REG_NO), ckkText.slice(0, 400));
        s.check("CKK の見積書 PDF に TSP の社名・登録番号は載らない", !ckkText.includes(TSP_NAME) && !ckkText.includes(TSP_REG_NO), ckkText.slice(0, 400));
      },
    },
    {
      caption: "同じ番号が 2 社にある — 番号だけの URL は発行会社を選ぶ画面へ送られ、どちらを選んでも開ける",
      run: async (s) => {
        const p = s.page;
        const number = `QOT-${fiscalYearToday(s, "TSP")}-00001`;
        const holders = s.sql(
          `select string_agg(c.code, ',' order by c.code) from app.quotes q join app.own_companies c on c.id = q.own_company_id where q.doc_number = '${number}'`,
        );
        s.check(`${number} は CKK と TSP の両方にある`, holders === "CKK,TSP", holders);

        await s.goto("/sales/quotes");
        await s.see(number);
        const rows = p.getByRole("row", { name: new RegExp(number) });
        s.check("一覧に同じ番号の行が 2 つ並ぶ", (await rows.count()) === 2, `${await rows.count()} 行`);
        const texts = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
        s.check(
          "一覧で、同じ番号の 2 行がどちらの法人のものか見分けられる",
          texts.some((t) => /TSP|ティー・エス・ピー/.test(t)) && texts.some((t) => /CKK|シー・ケィ・ケー/.test(t)),
          texts.join(" ‖ "),
        );
        await s.shot("一覧 — 同じ番号が 2 行");

        await s.goto(`/sales/quotes/${number}`);
        s.check("番号だけの URL は /doc/choose へ送られる", new URL(p.url()).pathname === "/doc/choose", p.url());
        const chooser = await s.checkVisible("発行会社を選ぶ画面が出る", "発行会社を選択", { wait: 8000 });
        await s.shot("発行会社を選ぶ画面");
        if (chooser) {
          await s.checkVisible("選択肢に CKK がある", `CKK · ${number}`);
          await s.checkVisible("選択肢に TSP がある", `TSP · ${number}`);
          await s.click(p.getByRole("link", { name: new RegExp(TSP_NAME) }));
          await s.waitForUrl(docUrl("/sales/quotes", "QOT"));
          s.check("TSP を選ぶと TSP の見積書が開く", idFromUrl(s) === `TSP~${number}`, p.url());
          await s.goto(`/sales/quotes/${number}`);
          await s.click(p.getByRole("link", { name: new RegExp(CKK_NAME) }));
          await s.waitForUrl(docUrl("/sales/quotes", "QOT"));
          s.check("CKK を選ぶと CKK の見積書が開く", idFromUrl(s) === `CKK~${number}`, p.url());
        }

        // 法人コード付きの URL は、選ぶ画面を通らずにそれぞれの書類が開く。
        await s.goto(`/sales/quotes/TSP~${number}`);
        await s.see(number);
        const tspTotal = s.sql(`select count(*) from app.quote_items i join app.quotes q on q.id = i.quote_id where q.doc_ref = 'TSP/${number}'`);
        s.check("TSP~番号 の URL は TSP の見積書を開く", idFromUrl(s) === `TSP~${number}` && (await p.getByText("旧番号").count()) === 0, `${p.url()} / 明細 ${tspTotal} 件`);
        await s.goto(`/sales/quotes/CKK~${number}`);
        await s.see("QOT-202607-00001");
        s.check("CKK~番号 の URL は CKK の見積書（旧番号 QOT-202607-00001）を開く", idFromUrl(s) === `CKK~${number}`, p.url());
      },
    },
    {
      caption: "旧番号 — 一覧は旧番号でも探せて、旧番号の URL・1 社にしか無い番号の URL は正規の URL へ送られる",
      run: async (s) => {
        const p = s.page;
        const legacy = "QOT-202607-00002";
        const current = s.sql(`select doc_number from app.quotes where legacy_number = '${legacy}'`);
        await s.goto("/sales/quotes");
        await s.fill(p.getByRole("textbox", { name: "見積番号・顧客で検索" }), legacy);
        await s.see(/1–1 \/ 1件/);
        await s.checkVisible("旧番号で検索すると、振り直し後の番号の行が出る", current, { exact: true });
        await s.shot("旧番号で検索した一覧");

        await s.goto(`/sales/quotes/${legacy}`);
        await s.see(legacy);
        s.check("旧番号の URL は 法人コード~新番号 へ送られる", idFromUrl(s) === `CKK~${current}`, p.url());
        await s.checkVisible("詳細に旧番号が出る", "旧番号", { exact: true });

        await s.goto(`/sales/quotes/${current}`);
        await s.see(legacy);
        s.check("1 社にしか無い番号は、選ぶ画面を通らずに開く", idFromUrl(s) === `CKK~${current}`, p.url());
      },
    },
    {
      caption: "キャンセルしても番号は残る — TSP の購買依頼を作ってキャンセルし、次に作ると次の番号になる（欠番を埋めない）",
      run: async (s) => {
        const p = s.page;
        const fy = fiscalYearToday(s, "TSP");
        const create = async (reason: string) => {
          await s.goto("/purchase/purchase-requests/new");
          await s.fill(p.getByRole("textbox", { name: /^依頼理由/ }), reason);
          await s.pick(p.getByRole("combobox", { name: /^素材/ }).first(), /B01A0001-A060-310/, { search: "B01A0001-A060" });
          await s.pick(p.getByRole("combobox", { name: /^入荷先拠点/ }).first(), /第二工場/);
          await s.fill(p.getByRole("textbox", { name: "数量" }).first(), "10");
          await s.pickDate(p.getByRole("button", { name: /^希望納期/ }).first(), { nextMonthDay: 10 });
          await s.click(p.getByRole("button", { name: "保存", exact: true }));
          await s.waitForUrl(docUrl("/purchase/purchase-requests", "PRQ"));
          await s.see(docNumber("PRQ"));
        };

        await create("キャンセルする購買依頼（番号が残ることの確認）");
        const first = `PRQ-${fy}-00001`;
        s.check(`入荷先拠点が TSP の拠点なので TSP の書類になる（TSP~${first}）`, idFromUrl(s) === `TSP~${first}`, p.url());
        await s.menu("キャンセル");
        const dialog = p.getByRole("dialog").last();
        await s.fill(dialog.getByRole("textbox", { name: /理由/ }), "誤って作成したため");
        await s.shot("キャンセルの確認");
        await s.clickInDialog("キャンセルする");
        await s.see("キャンセル済み");
        await s.checkVisible("キャンセル後も番号はそのまま表示される", first, { exact: true });
        const cancelled = s.sql(`select status || '|' || doc_number from app.purchase_requests where doc_ref = 'TSP/${first}'`);
        s.check("DB: キャンセル済みの行が番号を持ったまま残る", cancelled === `CANCELLED|${first}`, cancelled);
        await s.shot("キャンセルした購買依頼（番号は残る）");

        await create("キャンセルのあとに作る購買依頼");
        const second = `PRQ-${fy}-00002`;
        s.check(`次の購買依頼は ${second}（キャンセルした 1 番を使い回さない）`, idFromUrl(s) === `TSP~${second}`, p.url());
        s.check("document_sequences（PURCHASE_REQUEST × TSP）= 2", lastSeq(s, "PURCHASE_REQUEST", "TSP") === 2, String(lastSeq(s, "PURCHASE_REQUEST", "TSP")));
        const all = s.sql(
          "select string_agg(r.doc_number || ':' || r.status, ',' order by r.doc_seq) from app.purchase_requests r join app.own_companies c on c.id = r.own_company_id where c.code = 'TSP'",
        );
        s.check("TSP の購買依頼は 1 番（キャンセル）と 2 番（下書き）", all === `${first}:CANCELLED,${second}:DRAFT`, all);
      },
    },
  ],
};
