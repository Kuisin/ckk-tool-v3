/**
 * 再研磨の価格表の「対象工具」（#975）。
 *
 * 再研磨の値段は、同じ顧客 × 同じ役務（再研磨品目）でも**どの工具を研ぐか**で
 * 変わり得る。価格表は任意の「対象工具」を持てるようになり、引く順は
 *
 *   顧客 × 再研磨品目 × 工具が一致 → 顧客 × 再研磨品目（工具を問わない）→ 標準価格
 *
 * 見るもの: 工具なし・工具ありの 2 本を画面から作れること、注文請書の再研磨の明細が
 * 工具で値段を引き分けること（工具の価格表が当たった行はバッジで言い分ける）、
 * 価格表の無い役務が標準価格へ落ちること、見積書の再研磨の明細も「研ぎ直す工具」を
 * 持って同じ順で引くこと（保存・詳細・PDF・複製まで工具が付いて回る）。
 *
 * 注文請書は見積書を**紐づけるだけ**で明細を写さない（写す経路は無い）ので、
 * 見積書 → 注文請書で工具が運ばれることはここでは見ない。
 *
 * fixtures: 研ぎ直す工具（他社製品）9301 日研 / 9302 OSG。役務はシードの 9204
 * （RGD-202601-0004・標準価格 ¥720）と 9201（RGD-202601-0001・標準価格 ¥390）。
 */

import { docNumber, docUrl } from "../doc-number";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

const CUSTOMER = /デモ商事株式会社$/;
const ITEM = /4枚刃 φ10超20以下/; // 9204
const TOOL_A = /日研 超硬エンドミル/; // 9301 — 工具専用の価格表を作る
const TOOL_B = /OSG 超硬エンドミル/; // 9302 — 価格表を作らない
const ANY_PRICE = "600";
const TOOL_PRICE = "900";
/** 数量 25 本は既定の数量段階で倍率 ×1.00（21〜30 本）— 基準単価がそのまま単価になる。 */
const QTY = "25";

const mainText = async (s: Scn) => (await s.page.locator("main").innerText()).replace(/\s+/g, " ");

const entries = (s: Scn) =>
  s.sqlRows(
    `select coalesce(e.tool_item_id::text, '-') || '|' || v.order_type || '|' || v.base_unit_price::int
       from app.price_list_entries e join app.price_list_variants v on v.entry_id = e.id
      where e.item_id = 9204 order by e.tool_item_id nulls first`,
  );

export const priceListRegrindTool: Scenario = {
  id: "price-list-regrind-tool",
  title: "再研磨の価格表 — 対象工具ごとの価格と、工具 → 工具なし → 標準価格 の順の解決",
  feature: "価格表: 対象工具 + 法人ごと (#975, #988)",
  user: "staff",
  pdf: true,
  fixtures: ["scenarios/fixtures/price-list-regrind-tool.sql"],
  steps: [
    {
      caption: "工具を問わない価格表を作る — 再研磨品目を選ぶと「対象工具」の欄が出る（製品では出ない）",
      run: async (s) => {
        const p = s.page;
        await s.goto("/sales/price-lists/new");
        await s.pick(p.getByRole("combobox", { name: /^顧客/ }), CUSTOMER, { search: "デモ商事" });
        await s.pick(p.getByRole("combobox", { name: /^製品/ }), /超硬リーマ/, { search: "リーマ" });
        s.check("製品を選んだときは「対象工具」の欄が出ない", (await p.getByRole("combobox", { name: /^対象工具/ }).count()) === 0, `${await p.getByRole("combobox", { name: /^対象工具/ }).count()} 個`);

        // 再研磨品目を選ぶと、注文種別は「再研磨」に切り替わる（再研磨品目が持てるのは
        // 「再研磨」だけ — 初期値の「本番」のままだと保存が必ず弾かれていた）。
        await s.pick(p.getByRole("combobox", { name: /^製品/ }), ITEM, { search: "再研磨" });
        await s.checkVisible("再研磨品目を選ぶと「対象工具」の欄と説明が出る", /未選択は工具を問わない価格です/);
        const typeBox = p.getByRole("combobox", { name: /^注文種別/ });
        let autoType = "";
        for (let i = 0; i < 20 && autoType !== "再研磨"; i++) {
          autoType = await typeBox.inputValue();
          if (autoType !== "再研磨") await p.waitForTimeout(200);
        }
        s.check("再研磨品目を選ぶと注文種別が「再研磨」になる（手で直さなくてよい）", autoType === "再研磨", autoType);
        await s.fill(p.getByRole("textbox", { name: /^基準単価/ }), ANY_PRICE);
        await s.pickDate(p.getByRole("button", { name: /^有効開始日/ }), "today");
        s.check("保存前は価格表が無い", entries(s).length === 0, entries(s));
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("工具を問わない価格表（対象工具は空・再研磨 ¥600）");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/sales/price-lists", "PRC"));
        await s.see("価格表 詳細");
        const t = await mainText(s);
        s.check("詳細の対象工具は「工具を問わない」", /対象工具 工具を問わない/.test(t), (t.match(/対象工具.{0,40}/) ?? ["対象工具の欄が無い"])[0]);
        s.check("DB: 工具なし・再研磨 ¥600 の 1 本", entries(s).join(",") === "-|REGRIND|600", entries(s));
      },
    },
    {
      caption: "同じ顧客 × 同じ再研磨品目に、工具専用の価格表を足す — 工具を選ぶまでは「登録済み」と止められる",
      run: async (s) => {
        const p = s.page;
        await s.goto("/sales/price-lists/new");
        await s.pick(p.getByRole("combobox", { name: /^顧客/ }), CUSTOMER, { search: "デモ商事" });
        await s.pick(p.getByRole("combobox", { name: /^製品/ }), ITEM, { search: "再研磨" });
        await s.see("対象工具");
        const dupBefore = await mainText(s);
        s.check("工具を選ぶ前は、同じ顧客 × 品目の価格表が既にあると知らせる", /既に|すでに|登録済/.test(dupBefore), (dupBefore.match(/.{0,30}(既に|すでに|登録済).{0,60}/) ?? ["重複の知らせが無い"])[0]);
        await s.shot("工具を選ぶ前（重複の知らせ）");

        await s.pick(p.getByRole("combobox", { name: /^対象工具/ }), TOOL_A, { search: "超硬エンドミル" });
        const toolOptionsHasExternal = /日研 超硬エンドミル/.test(await p.getByRole("combobox", { name: /^対象工具/ }).inputValue());
        s.check("対象工具に他社製品（日研）を選べる", toolOptionsHasExternal, await p.getByRole("combobox", { name: /^対象工具/ }).inputValue());
        const dupAfter = await mainText(s);
        s.check("工具を選ぶと重複の知らせが消える（工具ごとに別の価格表）", !/既に|すでに|登録済/.test(dupAfter), (dupAfter.match(/.{0,30}(既に|すでに|登録済).{0,60}/) ?? ["消えた"])[0]);
        // 注文種別は再研磨品目を選んだ時点で「再研磨」になっている（選び直さない —
        // 選択済みの項目をもう一度押すと選択が外れる）。
        s.check("注文種別は「再研磨」になっている", (await p.getByRole("combobox", { name: /^注文種別/ }).inputValue()) === "再研磨", await p.getByRole("combobox", { name: /^注文種別/ }).inputValue());
        await s.fill(p.getByRole("textbox", { name: /^基準単価/ }), TOOL_PRICE);
        await s.pickDate(p.getByRole("button", { name: /^有効開始日/ }), "today");
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("工具専用の価格表（対象工具 = 日研・再研磨 ¥900）");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/sales/price-lists", "PRC"));
        await s.see("価格表 詳細");
        const t = await mainText(s);
        s.check("詳細の対象工具に工具名が出る", /対象工具 日研 超硬エンドミル 4枚刃 φ12×75/.test(t), (t.match(/対象工具.{0,60}/) ?? ["対象工具の欄が無い"])[0]);
        s.check("DB: 工具なし ¥600 と 工具 9301 ¥900 の 2 本が並ぶ", entries(s).join(",") === "-|REGRIND|600,9301|REGRIND|900", entries(s));

        await s.click(p.getByRole("button", { name: "編集" }).first());
        await s.see("価格表 編集");
        const edit = await mainText(s);
        s.check("編集画面では対象工具を変えられない（文字で出るだけ）", /作成後に変更できません/.test(edit) && (await p.getByRole("combobox", { name: /^対象工具/ }).count()) === 0 && /対象工具 日研/.test(edit), (edit.match(/対象工具.{0,60}/) ?? [""])[0]);
      },
    },
    {
      caption: "価格表の一覧 — 工具専用の行にだけ「対象工具」が出て、工具名でも探せる",
      run: async (s) => {
        const p = s.page;
        await s.goto("/sales/price-lists");
        await s.see("対象工具: 日研", { exact: false });
        const rows = p.getByRole("row").filter({ hasText: "φ10超20以下" });
        s.check("同じ顧客 × 再研磨品目の行が 2 本並ぶ", (await rows.count()) === 2, `${await rows.count()} 行`);
        const withTool = await p.getByText(/^対象工具: /).count();
        s.check("「対象工具: …」が付くのは工具専用の 1 行だけ", withTool === 1, `${withTool} 行`);
        await s.fill(p.getByPlaceholder("顧客・製品で検索"), "日研");
        await p.waitForTimeout(800);
        const filtered = p.getByRole("row").filter({ hasText: "φ10超20以下" });
        s.check("工具名「日研」で絞り込むと工具専用の 1 行だけが残る", (await filtered.count()) === 1, `${await filtered.count()} 行`);
        await s.shot("工具名で絞り込んだ一覧");
        // 製品の列は名前の後ろ（サイズ帯）で役務を見分ける。切れずに読めること。
        const cell = p.getByRole("row").filter({ hasText: "対象工具: 日研" }).getByText(/^再研磨 超硬エンドミル/).first();
        const clipped = await cell.evaluate((el) => {
          let n: HTMLElement | null = el as HTMLElement;
          while (n && n.tagName !== "TD") {
            if (n.scrollWidth > n.clientWidth + 1) return `${n.clientWidth}px に ${n.scrollWidth}px ぶんの文字`;
            n = n.parentElement;
          }
          return n && n.scrollWidth > n.clientWidth + 1 ? `${n.clientWidth}px に ${n.scrollWidth}px ぶんの文字` : "";
        });
        s.check("一覧の製品名（再研磨品目の名称・サイズ帯）が切れずに読める（幅 1440px）", clipped === "", clipped || "切れていない");
      },
    },
    {
      caption: "注文請書の再研磨の明細 — 研ぎ直す工具で単価が変わる（工具一致 ¥900 / 別の工具は工具なしの ¥600 / 価格表の無い役務は標準価格）",
      run: async (s) => {
        const p = s.page;
        await s.goto("/sales/order-acceptances/new");
        await s.pick(p.getByRole("combobox", { name: /^顧客/ }), CUSTOMER, { search: "デモ商事" });
        await s.fill(p.getByRole("textbox", { name: /^顧客注文書番号/ }), "SCN-RGD-0001");
        await s.pickDate(p.getByRole("button", { name: /^注文日/ }), "today");

        const line = async (i: number, item: RegExp, tool: RegExp | null) => {
          if (i > 0) await s.click(p.getByRole("button", { name: "明細を追加" }));
          await s.pick(p.getByRole("combobox", { name: "種別", exact: true }).nth(i), "再研磨", { exact: true });
          await s.pick(p.getByRole("combobox", { name: "再研磨品目" }).nth(i), item, { search: "再研磨" });
          await s.fill(p.getByRole("textbox", { name: "数量" }).nth(i), QTY);
          if (tool) await s.pick(p.getByRole("combobox", { name: "研ぎ直す工具" }).nth(i), tool, { search: "超硬エンドミル" });
          await s.pickDate(p.getByRole("button", { name: "納期" }).nth(i), { nextMonthDay: 25 });
        };
        const prices = async () => {
          await p.waitForTimeout(500);
          return p.getByRole("textbox", { name: "単価" }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
        };

        // 1 行目: まず工具を選ばずに単価を見る → 工具を問わない価格表。
        await s.pick(p.getByRole("combobox", { name: "種別", exact: true }).first(), "再研磨", { exact: true });
        await s.checkVisible("再研磨の行は「再研磨品目」と「研ぎ直す工具」の 2 欄になる", "研ぎ直す工具");
        await s.pick(p.getByRole("combobox", { name: "再研磨品目" }).first(), ITEM, { search: "再研磨" });
        await s.fill(p.getByRole("textbox", { name: "数量" }).first(), QTY);
        const before = await prices();
        s.check("工具を選ぶ前の単価は、工具を問わない価格表の ¥600", /600/.test(before[0] ?? ""), before);
        await s.pick(p.getByRole("combobox", { name: "研ぎ直す工具" }).first(), TOOL_A, { search: "超硬エンドミル" });
        await s.pickDate(p.getByRole("button", { name: "納期" }).first(), { nextMonthDay: 25 });
        const afterTool = await prices();
        s.check("工具（日研）を選ぶと、工具専用の価格表の ¥900 に変わる", /900/.test(afterTool[0] ?? ""), afterTool);
        const badges = async () => (await mainText(s)).match(/価格表（対象工具）[^ ]*|価格表 ￥\S+|標準価格 ￥\S+/g) ?? [];
        const firstBadges = await badges();
        s.check("工具の価格表から入った単価のバッジは「価格表（対象工具）￥900（21〜30本）」", firstBadges.some((b) => /^価格表（対象工具）￥900（21〜30本）/.test(b)), firstBadges);

        await line(1, ITEM, TOOL_B);
        await line(2, /外周 2枚刃 φ10以下/, TOOL_A);
        const all = await prices();
        s.check("2 行目（OSG — 専用の価格表なし）は、工具を問わない ¥600 に落ちる", /600/.test(all[1] ?? ""), all);
        s.check("3 行目（価格表の無い役務）は、標準価格 ¥390 に落ちる", /390/.test(all[2] ?? ""), all);
        const allBadges = await badges();
        s.check(
          "バッジで出どころを言い分ける — 1 行目だけ「対象工具」、2 行目は工具を問わない価格表、3 行目は標準価格",
          allBadges.filter((b) => b.startsWith("価格表（対象工具）")).length === 1 &&
            allBadges.some((b) => /^価格表 ￥600/.test(b)) &&
            allBadges.some((b) => /^標準価格 ￥390/.test(b)),
          allBadges,
        );
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("再研磨の 3 明細（単価は工具で引き分けられている）");

        await s.click(p.getByRole("button", { name: "下書きを作成" }));
        await s.waitForUrl(docUrl("/sales/order-acceptances", "ORD", "", true));
        const saved = s.sqlRows(
          `select ol.item_id || '|' || coalesce(ol.tool_item_id::text, '-') || '|' || ol.unit_price::int || '|' || ol.price_overridden
             from app.order_lines ol join app.order_acceptances oa on oa.id = ol.acceptance_id
            where oa.customer_order_ref = 'SCN-RGD-0001' order by ol.sort_order`,
        );
        s.check(
          "保存された単価もサーバーが同じ順で引く（900 / 600 / 390・上書きなし）",
          saved.join(",") === "9204|9301|900|false,9204|9302|600|false,9201|9301|390|false",
          saved,
        );
      },
    },
    {
      caption: "承認依頼の価格照合 — 工具で引き分けた単価は「価格差異」にならない",
      run: async (s) => {
        await s.click(s.page.getByRole("button", { name: "承認依頼", exact: true }).first());
        await s.see("第一承認待ち");
        const t = await mainText(s);
        s.check("価格差異の警告なしで承認依頼に進む", !/価格差異/.test(t), (t.match(/.{0,40}価格差異.{0,60}/) ?? ["価格差異の語が無い"])[0]);
      },
    },
    {
      caption: "見積書の再研磨の明細 — 「研ぎ直す工具」で単価が変わる（日研 ¥900 / OSG は工具を問わない ¥600）",
      run: async (s) => {
        const p = s.page;
        await s.goto("/sales/quotes/new");
        await s.pick(p.getByRole("combobox", { name: /^顧客/ }), CUSTOMER);
        await s.pickDate(p.getByRole("button", { name: /^有効期限/ }), { nextMonthDay: 20 });

        const line = async (i: number, tool: RegExp | null) => {
          if (i > 0) await s.click(p.getByRole("button", { name: "明細を追加" }));
          await s.pick(p.getByRole("combobox", { name: "注文種別" }).nth(i), "再研磨", { exact: true });
          await s.pick(p.getByRole("combobox", { name: "再研磨品目" }).nth(i), ITEM, { search: "再研磨" });
          await s.fill(p.getByRole("textbox", { name: "数量" }).nth(i), QTY);
          if (tool) await s.pick(p.getByRole("combobox", { name: /^研ぎ直す工具/ }).nth(i), tool, { search: "超硬エンドミル" });
          await p.waitForTimeout(400);
        };

        await line(0, null);
        await s.checkVisible("再研磨の行には「研ぎ直す工具」の欄が出る", "研ぎ直す工具");
        const before = await mainText(s);
        s.check("工具を選ぶ前の単価は、工具を問わない価格表の ¥600", /単価（価格表）[^￥]*￥600/.test(before), (before.match(/単価（価格表）.{0,40}/) ?? [""])[0]);

        // 工具を入れずに保存すると止められる（工具で値段が変わり得るので必須）。
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.checkVisible("工具が空のまま保存すると「研ぎ直す工具を選択してください」", "研ぎ直す工具を選択してください");
        s.check("止められて、見積書は作られていない", s.sql("select count(*) from app.quote_items where tool_item_id is not null or item_id = 9204") === "0", s.sql("select count(*) from app.quote_items where item_id = 9204"));

        await s.pick(p.getByRole("combobox", { name: /^研ぎ直す工具/ }).first(), TOOL_A, { search: "超硬エンドミル" });
        await p.waitForTimeout(400);
        const afterTool = await mainText(s);
        s.check("工具（日研）を選ぶと、工具専用の価格表の ¥900 に変わる", /単価（価格表）[^￥]*￥900/.test(afterTool), (afterTool.match(/単価（価格表）.{0,40}/) ?? [""])[0]);
        s.check("単価の下に「対象工具の価格表」と出る", /対象工具の価格表/.test(afterTool), (afterTool.match(/￥900.{0,20}/) ?? [""])[0]);

        await line(1, TOOL_B);
        const both = await mainText(s);
        const unitPrices = both.match(/単価（価格表）[^￥]*￥[\d,]+/g) ?? [];
        s.check("2 行目（OSG — 専用の価格表なし）は、工具を問わない ¥600", /￥600$/.test(unitPrices[1] ?? ""), unitPrices);
        s.check("「対象工具の価格表」が付くのは 1 行目だけ", (both.match(/対象工具の価格表/g) ?? []).length === 1, `${(both.match(/対象工具の価格表/g) ?? []).length} 個`);
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("見積書の再研磨の 2 明細（日研 ¥900 / OSG ¥600）");

        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/sales/quotes", "QOT"));
        await s.see(docNumber("QOT"));
        const saved = s.sqlRows(
          `select qi.item_id || '|' || coalesce(qi.tool_item_id::text, '-') || '|' || qi.unit_price::int || '|' || (qi.price_list_tier_id is not null)
             from app.quote_items qi join app.quotes q on q.id = qi.quote_id
            where q.doc_ref = (select doc_ref from app.quotes order by created_at desc limit 1) order by qi.sort_order`,
        );
        s.check("保存された単価もサーバーが同じ順で引く（日研 900 / OSG 600・工具も保存）", saved.join(",") === "9204|9301|900|true,9204|9302|600|true", saved);
      },
    },
    {
      caption: "見積書の詳細 — 品名の下に研ぎ直す工具、適用価格表に「対象工具の価格表」",
      run: async (s) => {
        const t = await mainText(s);
        s.check("1 行目の品名の下に「研ぎ直す工具: 日研ツール 日研 超硬エンドミル …」", /研ぎ直す工具: 日研ツール 日研 超硬エンドミル 4枚刃 φ12×75/.test(t), (t.match(/研ぎ直す工具.{0,50}/) ?? ["工具が出ていない"])[0]);
        s.check("2 行目の品名の下に「研ぎ直す工具: OSG …」", /研ぎ直す工具: OSG OSG 超硬エンドミル 4枚刃 φ16×90/.test(t), (t.match(/研ぎ直す工具: OSG.{0,40}/) ?? ["工具が出ていない"])[0]);
        s.check("手続き状況の価格表 2 件は、工具専用の方に「対象工具: 日研 …」が付いて見分けられる", /RGD-202601-0004（対象工具: 日研 超硬エンドミル 4枚刃 φ12×75/.test(t), (t.match(/価格表 2 件.{0,200}/) ?? ["価格表の欄が無い"])[0]);
        s.check("適用価格表に「対象工具の価格表」が付くのは 1 行目だけ", (t.match(/対象工具の価格表/g) ?? []).length === 1, `${(t.match(/対象工具の価格表/g) ?? []).length} 個`);
        await s.shot("見積書の詳細（明細に工具）");
      },
    },
    {
      caption: "見積書の PDF — 再研磨の明細の品名の下に「研ぎ直す工具: …」が刷られる",
      run: async (s) => {
        await s.menu("発行");
        await s.clickInDialog("発行");
        await s.see("発行済");
        const id = decodeURIComponent(new URL(s.page.url()).pathname.split("/").filter(Boolean)[2] ?? "");
        const text = await s.pdf("見積書", `/api/pdf/quote?id=${encodeURIComponent(id)}&force=1`);
        const flat = text.replace(/[ \t]+/g, " ");
        // 品名の欄は狭いので工具名は折り返して刷られる — 空白・改行を落として読む。
        const dense = text.replace(/\s+/g, "");
        s.check("PDF に「研ぎ直す工具: 日研ツール 日研 超硬エンドミル 4枚刃 φ12×75 PRD-209903-0001」", dense.includes("研ぎ直す工具:日研ツール日研超硬エンドミル4枚刃φ12×75PRD-209903-0001"), (dense.match(/研ぎ直す工具.{0,50}/) ?? ["刷られていない"])[0]);
        s.check("PDF に「研ぎ直す工具: OSG OSG 超硬エンドミル 4枚刃 φ16×90 PRD-209903-0002」", dense.includes("研ぎ直す工具:OSGOSG超硬エンドミル4枚刃φ16×90PRD-209903-0002"), (dense.match(/研ぎ直す工具:OSG.{0,40}/) ?? ["刷られていない"])[0]);
        s.check("PDF の単価は 900 と 600、金額は 22,500 と 15,000", /900/.test(flat) && /600/.test(flat) && /22,500/.test(flat) && /15,000/.test(flat), (flat.match(/.{0,30}22,500.{0,10}/) ?? ["22,500 が無い"])[0]);
      },
    },
    {
      caption: "見積書を複製する — 研ぎ直す工具も引き継がれ、単価もその工具で引き直される",
      run: async (s) => {
        const p = s.page;
        await s.menu("複製");
        await s.waitForUrl(/\/sales\/quotes\/new\?from=/);
        await s.see("研ぎ直す工具");
        const tools = await p.getByRole("combobox", { name: /^研ぎ直す工具/ }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
        s.check("複製のフォームに 2 行とも工具が入っている（日研 / OSG）", /日研/.test(tools[0] ?? "") && /OSG/.test(tools[1] ?? ""), tools);
        const t = await mainText(s);
        const unitPrices = t.match(/単価（価格表）[^￥]*￥[\d,]+/g) ?? [];
        s.check("複製の単価も ¥900 / ¥600", /￥900$/.test(unitPrices[0] ?? "") && /￥600$/.test(unitPrices[1] ?? ""), unitPrices);
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("複製のフォーム（工具を引き継いでいる）");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/sales/quotes", "QOT"));
        await s.see(docNumber("QOT"));
        const copies = s.sql(
          `select count(*) from app.quote_items where item_id = 9204 and tool_item_id = 9301 and unit_price = 900`,
        );
        s.check("DB: 日研 ¥900 の再研磨の明細が元と複製で 2 行", copies === "2", copies);
      },
    },
  ],
};
