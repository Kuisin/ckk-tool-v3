/**
 * 原価試算 / 売価試算（#976）。
 *
 * 価格試算に種別ができた:
 *   原価試算（COST） … 原価合計で止まる。見積単価は出さない。権限 estimate_cost を
 *                      持つ人にしか**行ごと**見えず、価格表の単価のもとにはできない
 *   売価試算（PRICE）… 従来の価格試算（見積単価まで出す）
 *
 * デモユーザーでは 管理者 demo1 だけが estimate_cost を持つ（担当者 demo2・承認者
 * demo_shot は持たない）。だから 作るのは管理者、見えないことを確かめるのは担当者。
 */

import { docNumber, docUrl } from "../doc-number";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

const COST_NAME = "SCN 原価試算 ドリル φ4×50";
const PRICE_NAME = "SCN 売価試算 ドリル φ4×50";

/** 手順をまたいで持ち回る値。 */
const ctx: { costUrl: string; costNumber: string; costTotal: string } = { costUrl: "", costNumber: "", costTotal: "" };

const mainText = async (s: Scn) => (await s.page.locator("main").innerText()).replace(/\s+/g, " ");

/** 「原価合計 ￥1,234」のような 1 行から金額だけを取る。 */
function money(text: string, label: string): string {
  return (new RegExp(`${label}\\s*(￥[\\d,]+)`).exec(text) ?? [])[1] ?? "";
}

/** 価格試算の入力（材料・寸法）。原価試算と売価試算で同じものを入れる。 */
async function fillEstimate(s: Scn): Promise<void> {
  const p = s.page;
  await s.pick(p.getByRole("combobox", { name: /^見積り先/ }), /デモ商事株式会社$/, { search: "デモ商事" });
  await s.pick(p.getByRole("combobox", { name: /^製品/ }), /超硬ドリル/, { search: "ドリル" });
  await s.pick(p.getByRole("combobox", { name: /^材種/ }), /^B01A0001/);
  await s.pick(p.getByRole("combobox", { name: /^直径/ }), "φ6", { exact: true });
  await s.pick(p.getByRole("combobox", { name: /^黒皮\/研磨/ }), "研磨", { exact: true });
  await s.fill(p.getByRole("textbox", { name: /^最大径/ }), "4");
  await s.fill(p.getByRole("textbox", { name: /^全長/ }), "50");
  await settled(s);
}

/**
 * 計算が落ち着くのを待つ。素材を選ぶと参照単価をサーバーから引き、届いてから
 * 材料原価 → 原価合計が入り直る。届く前に読むと、途中の額を「正」として控えてしまう
 * （並列に走らせて機械が忙しいときに実際に起きた）。材料原価が入り、原価合計が
 * 続けて 3 回同じ値になるまで待つ。
 */
async function settled(s: Scn): Promise<void> {
  let last = "";
  let same = 0;
  for (let i = 0; i < 40 && same < 3; i++) {
    await s.page.waitForTimeout(250);
    const t = await mainText(s);
    const now = `${money(t, "材料原価")}/${money(t, "原価合計")}`;
    same = now === last && !/材料原価 ￥0\b/.test(t) ? same + 1 : 0;
    last = now;
  }
}

export const costEstimate: Scenario = {
  id: "cost-estimate",
  title: "原価試算 — 原価合計で止まり、権限のある人にしか見えず、価格表には使えない",
  feature: "原価試算 / 売価試算 (#976)",
  user: "admin",
  steps: [
    {
      caption: "原価試算を作る（管理者）— 種別を「原価試算」にすると、結果は原価合計だけになる",
      run: async (s) => {
        const p = s.page;
        const perm = s.sqlRows(
          `select distinct u.username from app.user_permissions p join app.users u on u.id = p.user_id
            where p.permission_code = 'estimate_cost' and u.username in ('demo1', 'demo2', 'demo_shot') order by 1`,
        );
        s.check("（前提）estimate_cost を持つのは管理者 demo1 だけ", perm.join(",") === "demo1", perm);

        await s.goto("/sales/trial-estimates/new");
        await s.see("種別", { exact: true });
        await fillEstimate(s);
        const asPrice = await mainText(s);
        s.check("売価試算（既定）では 最低単価・見積単価（基準）・粗利 が出る", /最低単価 ￥/.test(asPrice) && /見積単価（基準） ￥/.test(asPrice) && /粗利 ￥/.test(asPrice), (asPrice.match(/最低単価.{0,120}/) ?? [""])[0]);
        ctx.costTotal = money(asPrice, "原価合計");

        await s.click(p.getByText("原価試算", { exact: true }).first());
        await s.see("原価合計だけを出します", { exact: false });
        const asCost = await mainText(s);
        s.check("原価試算にすると 最低単価・見積単価・粗利・数量ごとの単価 が消える", !/最低単価/.test(asCost) && !/見積単価（基準）/.test(asCost) && !/粗利/.test(asCost) && !/参考：数量ごとの単価/.test(asCost), (asCost.match(/原価内訳.{0,400}/) ?? [""])[0].slice(-200));
        s.check(`原価合計は種別を変えても同じ（${ctx.costTotal}）`, ctx.costTotal !== "" && money(asCost, "原価合計") === ctx.costTotal, money(asCost, "原価合計"));
        await s.fill(p.getByPlaceholder(/^例: 精密軸/), COST_NAME);
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("原価試算の入力（結果は原価合計だけ）");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/sales/trial-estimates", "EST"));
        ctx.costUrl = new URL(p.url()).pathname;
        ctx.costNumber = decodeURIComponent(ctx.costUrl).split("~")[1] ?? "";
        const row = s.sql(`select kind || '|' || status from app.estimates where doc_number = '${ctx.costNumber}'`);
        s.check("DB: 種別 COST・下書き で入る", row === "COST|DRAFT", row);
      },
    },
    {
      caption: "原価試算の詳細 — 「原価試算」の印と注意書きが出て、見積単価と価格表への段が無い。確定しても価格表へは進まない",
      run: async (s) => {
        await s.see(docNumber("EST"));
        await s.checkVisible("「原価試算」のバッジが出る", "原価試算", { exact: true });
        await s.checkVisible("注意書き（価格表の基準単価にはできない）が出る", /これは原価試算です/);
        const draft = await mainText(s);
        s.check(`原価合計 ${ctx.costTotal} が出る`, money(draft, "原価合計") === ctx.costTotal, money(draft, "原価合計"));
        s.check("見積単価（基準）・最低単価・粗利 は出ない", !/見積単価（基準）/.test(draft) && !/最低単価/.test(draft) && !/粗利/.test(draft), (draft.match(/.{0,40}(見積単価（基準）|最低単価|粗利).{0,40}/) ?? ["どれも無い"])[0]);
        s.check("手続き状況に「価格表登録済」の段が無い", !/価格表登録済/.test(draft), (draft.match(/手続き状況.{0,120}/) ?? [""])[0]);

        await s.menu("確定");
        await s.toast("確定しました");
        await s.see("確定済み");
        // 確定の通知。売価試算では「価格表の基準単価ソースとして選択できます」と出るが、
        // 原価試算は選べないので、同じ文が出てはいけない。
        const toast = (await s.page.locator(".mantine-Notification-root").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
        s.check("確定の通知が「価格表の基準単価ソースとして選択できます」と言わない（原価試算は選べない）", !toast.some((t) => /基準単価ソースとして選択できます/.test(t)), toast);
        await s.shot("原価試算を確定した直後（通知）");
        const confirmed = await mainText(s);
        s.check("確定しても「価格表を作成」への案内は出ない", !/価格表を作成|価格表の基準単価に選べ/.test(confirmed), (confirmed.match(/.{0,40}価格表.{0,60}/) ?? ["価格表の語が無い"])[0]);
        const row = s.sql(`select kind || '|' || status from app.estimates where doc_number = '${ctx.costNumber}'`);
        s.check("DB: COST・確定", row === "COST|CONFIRMED", row);
      },
    },
    {
      caption: "価格試算の一覧（管理者）— 原価試算は印つきで並び、代表値は見積単価ではなく原価合計",
      run: async (s) => {
        await s.goto("/sales/trial-estimates");
        await s.see(COST_NAME);
        const row = s.page.getByRole("row").filter({ hasText: COST_NAME }).first();
        const text = (await row.innerText()).replace(/\s+/g, " ");
        s.check("行に「原価試算」の印と「原価合計 …」が出る", text.includes("原価試算") && text.includes(`原価合計 ${ctx.costTotal}`), text);
      },
    },
    {
      caption: "権限の無い担当者には見えない — 一覧に出ず、URL を直接開いても「見つからない」。種別の選択肢も出ない",
      run: async (s) => {
        const p = s.page;
        await s.switchUser("staff", "/sales/trial-estimates");
        await s.see("エンドミル φ6×60 CX400");
        await s.checkHidden("担当者の一覧に原価試算は出ない", COST_NAME);
        s.check("担当者の一覧には売価試算 3 件だけが出る", /1–3 \/ 3件/.test(await mainText(s)), ((await mainText(s)).match(/\d+–\d+ \/ \d+件/) ?? [""])[0]);
        await s.shot("担当者の一覧（原価試算が無い）");

        // 別のタブで開く — 404 は「正しい結果」なので、この 1 本の console.error の見張りに載せない。
        const tab = await p.context().newPage();
        const res = await tab.goto(new URL(ctx.costUrl, p.url()).href, { waitUntil: "load" });
        const body = (await tab.locator("body").innerText()).replace(/\s+/g, " ");
        s.check("担当者が原価試算の URL を直接開くと 404（中身が出ない）", res?.status() === 404 && !body.includes(COST_NAME) && !/原価合計/.test(body), `${res?.status()} ${body.slice(0, 120)}`);
        await s.shot("担当者が原価試算の URL を開いたところ", tab);
        await tab.close();

        await s.goto("/sales/trial-estimates/new");
        await s.see("見積り先");
        const form = await mainText(s);
        s.check("担当者の新規作成に 種別（売価試算 / 原価試算）の選択肢は出ない", !/原価試算/.test(form) && !/売価試算/.test(form), (form.match(/.{0,30}(原価試算|売価試算).{0,30}/) ?? ["出ていない"])[0]);
        s.check("担当者には 原価合計・粗利 が出ない（見積単価は出る）", !/原価合計/.test(form) && !/粗利/.test(form) && /見積単価（基準） ￥/.test(form), (form.match(/最低単価.{0,120}/) ?? [""])[0]);
      },
    },
    {
      caption: "価格表の単価のもとには選べない（管理者）— 価格ソースの候補に原価試算は出ない",
      run: async (s) => {
        const p = s.page;
        await s.switchUser("admin", "/sales/price-lists/new");
        await s.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/, { search: "デモ商事" });
        await s.pick(p.getByRole("combobox", { name: /^製品/ }), /超硬ドリル/, { search: "ドリル" });
        const source = p.getByRole("combobox", { name: /^価格ソース/ });
        await s.click(source);
        const options = (await p.getByRole("option").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
        s.check("候補に確定済みの売価試算（シードの「ドリル φ4×50 ノンコート」）は出る", options.some((o) => o.includes("ドリル φ4×50 ノンコート")), options);
        s.check("候補に原価試算は出ない", !options.some((o) => o.includes(COST_NAME) || o.includes(ctx.costNumber)), options);
        await s.shot("価格ソースの候補（原価試算が無い）");
        await p.keyboard.press("Escape");
      },
    },
    {
      caption: "原価試算から売価試算を作る — 入力を引き継いだ売価試算が開き、見積単価まで出る。元の原価試算は残る",
      run: async (s) => {
        const p = s.page;
        await s.goto(ctx.costUrl);
        await s.see(docNumber("EST"));
        await s.shot("確定済みの原価試算の詳細");
        await s.click(p.getByRole("button", { name: "操作メニュー" }).first());
        await p.getByRole("menuitem").first().waitFor({ state: "visible", timeout: 10_000 });
        const items = await p.getByRole("menuitem").allInnerTexts();
        s.check("操作メニューに「売価試算を作成」がある", items.some((i) => i.includes("売価試算を作成")), items);
        await s.shot("原価試算の操作メニュー");
        await p.keyboard.press("Escape");
        await s.menu("売価試算を作成");
        await p.waitForURL(/\/sales\/trial-estimates\/new\?.*kind=PRICE/, { timeout: 30_000 });
        await s.see("見積単価（基準）");
        await settled(s);
        const form = await mainText(s);
        s.check("種別は「売価試算」が選ばれている", await p.getByRole("radio", { name: "売価試算" }).isChecked(), form.slice(0, 0));
        s.check(`入力が引き継がれている（製品 超硬ドリル・全長 50・原価合計 ${ctx.costTotal}）`, (await p.getByRole("textbox", { name: /^全長/ }).inputValue()) === "50" && /超硬ドリル/.test(await p.getByRole("combobox", { name: /^製品/ }).inputValue()) && money(form, "原価合計") === ctx.costTotal, { 全長: await p.getByRole("textbox", { name: /^全長/ }).inputValue(), 製品: await p.getByRole("combobox", { name: /^製品/ }).inputValue(), 原価合計: money(form, "原価合計") });
        s.check("見積単価（基準）が出る", /見積単価（基準） ￥[\d,]+/.test(form), money(form, "見積単価（基準）"));
        await s.fill(p.getByPlaceholder(/^例: 精密軸/), PRICE_NAME);
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("原価試算から開いた売価試算（保存前）");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/sales/trial-estimates", "EST"));
        await s.see(docNumber("EST"));
        const rows = s.sqlRows(`select name || '|' || kind || '|' || status from app.estimates where name like 'SCN %' order by doc_number`);
        s.check("DB: 元の原価試算は COST・確定のまま、新しい行が PRICE・下書きで入る", rows.join(" / ") === `${COST_NAME}|COST|CONFIRMED / ${PRICE_NAME}|PRICE|DRAFT`, rows);
        s.check("新しい売価試算の詳細に「原価試算」の印は無い", !(await mainText(s)).includes("これは原価試算です"), "");
      },
    },
  ],
};
