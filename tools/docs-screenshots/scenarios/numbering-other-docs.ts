/**
 * 見積書・注文請書以外の書類にも「自社法人 × 会計年度」の連番が振られること —
 * 棚卸（STK）・入出庫伝票（MOV）・外注依頼（OUT）・購買依頼（PRQ）・素材発注書（PO）・
 * 会計文書（ACC）を、それぞれ普段の画面から起こして番号を確かめる。最後に共有端末で
 * 指示書を完了し、共有端末が起こす入出庫伝票が Web と同じ連番から続くことを見る。
 *
 * 始まり: fixtures/company-tsp.sql + fixtures/numbering-other-docs.sql
 * （指示書 9002 = 承認済み・4 工程目が依頼日の無い外注工程 / 指示書 9001 = 最後の
 *   1 工程だけ未着手）。番号は fixtures では 1 つも入れていない。
 */

import { docNumber, docUrl } from "../doc-number";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

const OUTSOURCE_STEP = "dc012000-0000-4000-8000-000000000004";
const LAST_STEP_9001 = "dc011000-0000-4000-8000-000000000006";

function fiscalYearToday(s: Scn, code: string): string {
  return s.sql(
    `select app.fiscal_year_of(fiscal_year_start_month::int, app.jst_date(now())) from app.own_companies where code = '${code}'`,
  );
}

function lastSeq(s: Scn, key: string, code: string): number {
  const fy = fiscalYearToday(s, code);
  return Number(
    s.sql(
      `select coalesce((select last_seq from app.document_sequences q join app.own_companies c on c.id = q.own_company_id where q.key = '${key}' and c.code = '${code}' and q.fiscal_year = ${fy}), 0)`,
    ),
  );
}

/** その法人で次に振られるはずの番号（今日の年度・連番 + 1）。 */
function nextNumber(s: Scn, key: string, prefix: string, code: string): string {
  return `${prefix}-${fiscalYearToday(s, code)}-${String(lastSeq(s, key, code) + 1).padStart(5, "0")}`;
}

function idFromUrl(s: Scn): string {
  return decodeURIComponent(new URL(s.page.url()).pathname.split("/").pop() ?? "");
}

/** 連番の行と、表にある最大の連番が一致しているか（番号を払い出した表 = 連番の行）。 */
function sequenceMatchesTable(s: Scn, key: string, table: string, code: string): { ok: boolean; actual: string } {
  const fy = fiscalYearToday(s, code);
  const max = s.sql(
    `select coalesce(max(t.doc_seq), 0) || '/' || count(*) from app.${table} t join app.own_companies c on c.id = t.own_company_id where c.code = '${code}' and t.fiscal_year = ${fy}`,
  );
  const [maxSeq, count] = max.split("/");
  const seq = lastSeq(s, key, code);
  return { ok: Number(maxSeq) === seq && Number(count) === seq, actual: `document_sequences=${seq} / ${table} の最大連番=${maxSeq}・行数=${count}` };
}

/** 手動入出庫（入庫）を 1 件登録して、直前に登録した伝票のリンク先（id）を返す。 */
async function postGoodsReceipt(s: Scn, plant: RegExp, quantity: string): Promise<string> {
  const p = s.page;
  await s.goto("/inventory/goods-movement");
  await s.pick(p.getByRole("combobox", { name: /^移動タイプ/ }), /入庫/);
  await s.pick(p.getByRole("combobox", { name: /^拠点/ }), plant);
  await s.pick(p.getByRole("combobox", { name: /^品目/ }), /超硬エンドミル 4枚刃/, { search: "エンドミル" });
  await s.fill(p.getByRole("textbox", { name: "数量" }), quantity);
  await s.click(p.getByRole("button", { name: "登録", exact: true }));
  await s.see("直前に登録した伝票");
  const href = await p.getByRole("alert").getByRole("link", { name: docNumber("MOV") }).getAttribute("href");
  return decodeURIComponent((href ?? "").split("/").pop() ?? "");
}

export const numberingOtherDocs: Scenario = {
  id: "numbering-other-docs",
  title: "書類番号 — 棚卸・入出庫伝票・外注依頼・購買・会計文書・共有端末からの伝票",
  feature: "PR 9 書類番号（法人 × 年度の連番） (#979 / #980 / #982 / #985 / #990)",
  user: "approver",
  kiosk: true,
  fixtures: ["scenarios/fixtures/company-tsp.sql", "scenarios/fixtures/numbering-other-docs.sql"],
  steps: [
    {
      caption: "棚卸（STK）— 在庫の無い拠点では作れず番号も消費しない。本社工場（CKK）で作ると CKK の 1 番",
      run: async (s) => {
        const p = s.page;
        s.check("シード直後、棚卸は 1 枚も採番されていない", lastSeq(s, "STOCK_TAKE", "CKK") === 0 && lastSeq(s, "STOCK_TAKE", "TSP") === 0, `CKK ${lastSeq(s, "STOCK_TAKE", "CKK")} / TSP ${lastSeq(s, "STOCK_TAKE", "TSP")}`);
        await s.goto("/inventory/stock-takes/new");
        await s.pick(p.getByRole("combobox", { name: /^拠点/ }), /第二工場/);
        await s.click(p.getByRole("button", { name: "登録", exact: true }));
        await s.checkVisible("在庫の無い拠点では「数える対象がありません」で作れない", "数える対象がありません");
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("在庫の無い第二工場では棚卸を作れない");
        const rows = s.sql("select count(*) from app.stock_takes");
        const seqRows = s.sql("select count(*) from app.document_sequences where key = 'STOCK_TAKE'");
        s.check("作れなかった棚卸は行も番号も残さない（保存が巻き戻ると番号も戻る）", rows === "0" && seqRows === "0", `stock_takes ${rows} 行 / document_sequences ${seqRows} 行`);

        const expected = nextNumber(s, "STOCK_TAKE", "STK", "CKK");
        await s.goto("/inventory/stock-takes/new");
        await s.pick(p.getByRole("combobox", { name: /^拠点/ }), /本社工場/);
        await s.click(p.getByRole("button", { name: "登録", exact: true }));
        await s.waitForUrl(docUrl("/inventory/stock-takes", "STK"));
        await s.see(docNumber("STK"));
        s.check(`棚卸は CKK~${expected}`, idFromUrl(s) === `CKK~${expected}`, p.url());
        const m = sequenceMatchesTable(s, "STOCK_TAKE", "stock_takes", "CKK");
        s.check("連番の行（STOCK_TAKE × CKK）と棚卸の表が一致する", m.ok, m.actual);
      },
    },
    {
      caption: "入出庫伝票（MOV）— 手動入出庫で本社工場（CKK）と第二工場（TSP）に入庫。伝票は拠点の法人ごとに 1 番から",
      run: async (s) => {
        const p = s.page;
        const ckkExpected = nextNumber(s, "INVENTORY_MOVEMENT", "MOV", "CKK");
        const ckkId = await postGoodsReceipt(s, /本社工場/, "5");
        await s.shot("本社工場への入庫を登録した直後");
        s.check(`本社工場の伝票は CKK~${ckkExpected}`, ckkId === `CKK~${ckkExpected}`, ckkId);

        const tspExpected = nextNumber(s, "INVENTORY_MOVEMENT", "MOV", "TSP");
        const tspId = await postGoodsReceipt(s, /第二工場/, "3");
        s.check(`第二工場の伝票は TSP~${tspExpected}`, tspId === `TSP~${tspExpected}`, tspId);
        s.check("TSP の伝票は TSP の 1 番（CKK の続きではない）", tspExpected.endsWith("-00001"), tspExpected);

        await s.click(p.getByRole("alert").getByRole("link", { name: docNumber("MOV") }));
        await s.waitForUrl(docUrl("/inventory/movements", "MOV"));
        await s.see(docNumber("MOV"));
        s.check("伝票の詳細が 法人コード~番号 の URL で開く", idFromUrl(s) === tspId, p.url());
        await s.shot("第二工場（TSP）の入出庫伝票");

        await s.goto("/inventory/movements");
        await s.see(docNumber("MOV"));
        await s.shot("入出庫伝票の一覧");
        const ckk = sequenceMatchesTable(s, "INVENTORY_MOVEMENT", "inventory_movements", "CKK");
        s.check("連番の行（INVENTORY_MOVEMENT × CKK）と伝票の表が一致する", ckk.ok, ckk.actual);
        const tsp = sequenceMatchesTable(s, "INVENTORY_MOVEMENT", "inventory_movements", "TSP");
        s.check("連番の行（INVENTORY_MOVEMENT × TSP）と伝票の表が一致する", tsp.ok, tsp.actual);
      },
    },
    {
      caption: "外注依頼（OUT）— 外注工程に依頼日を入れた時点で番号が振られ、外注へ預ける入出庫伝票も続き番で起きる",
      run: async (s) => {
        const p = s.page;
        const before = s.sql(`select count(*) from app.outsource_orders where work_order_step_id = '${OUTSOURCE_STEP}'`);
        s.check("依頼日を入れる前、この外注工程に依頼番号は無い", before === "0", `${before} 行`);
        const outExpected = nextNumber(s, "OUTSOURCE_ORDER", "OUT", "CKK");
        const movExpected = nextNumber(s, "INVENTORY_MOVEMENT", "MOV", "CKK");

        await s.goto(`/production/work-orders/9002/steps/${OUTSOURCE_STEP}`);
        await s.see("外注日程");
        const requested = p.getByRole("button", { name: /^依頼日/ });
        await s.pickDate(requested, "today");
        const picked = (await requested.innerText()).trim();
        s.check("依頼日の欄に今日の日付が入った", /^\d{4}\/\d{2}\/\d{2}$/.test(picked), picked);
        // 保存前に撮る — 全高で撮ると表示領域の高さが変わる。高さが変わっただけで
        // 未保存の入力（依頼日）が初期値へ戻り、空のまま保存されたことがある。
        await s.shot("外注工程に依頼日を入れた（保存前）");
        const afterShot = (await requested.innerText()).trim();
        s.check("表示領域の高さが変わっても未保存の依頼日が残る", afterShot === picked, { picked, afterShot });
        await s.click(p.getByRole("button", { name: "外注日程を保存" }));
        await s.toast("外注日程を保存しました");
        await s.shot("外注工程に依頼日を入れて保存した");
        const saved = s.sql(`select to_char(outsource_requested_at, 'YYYY/MM/DD') from app.work_order_steps where id = '${OUTSOURCE_STEP}'`);
        s.check("保存した依頼日が DB に入る（空で保存されない）", saved === picked, { picked, saved });

        const out = s.sql(
          `select c.code || '~' || o.doc_number from app.outsource_orders o join app.own_companies c on c.id = o.own_company_id where o.work_order_step_id = '${OUTSOURCE_STEP}'`,
        );
        s.check(`依頼日を入れると外注依頼の番号 ${outExpected} が振られる`, out === `CKK~${outExpected}`, out);
        const mov = s.sql(
          `select c.code || '~' || m.doc_number || ' ' || m.cause from app.work_order_steps st join app.inventory_movements m on m.id = st.outsource_issue_movement_id join app.own_companies c on c.id = m.own_company_id where st.id = '${OUTSOURCE_STEP}'`,
        );
        s.check(`外注へ預ける入出庫伝票は続き番 ${movExpected}`, mov === `CKK~${movExpected} OUTSOURCE_ISSUE`, mov);

        await s.goto("/purchase/outsource-orders");
        await s.checkVisible("外注依頼の一覧に新しい依頼番号が並ぶ", outExpected, { exact: true });
        const row = p.getByRole("row", { name: new RegExp(outExpected) });
        const text = (await row.innerText({ timeout: 5000 }).catch(() => "")).replace(/\s+/g, " ");
        s.check("その行は指示書 9002 の段加工", /9002/.test(text) && /段加工/.test(text), text);
        const m = sequenceMatchesTable(s, "OUTSOURCE_ORDER", "outsource_orders", "CKK");
        s.check("連番の行（OUTSOURCE_ORDER × CKK）と外注依頼の表が一致する", m.ok, m.actual);
      },
    },
    {
      caption: "購買依頼（PRQ）と素材発注書（PO）— それぞれの連番から続き番が振られる",
      run: async (s) => {
        const p = s.page;
        const prqExpected = nextNumber(s, "PURCHASE_REQUEST", "PRQ", "CKK");
        await s.goto("/purchase/purchase-requests/new");
        await s.fill(p.getByRole("textbox", { name: /^依頼理由/ }), "採番の確認（購買依頼）");
        await s.pick(p.getByRole("combobox", { name: /^素材/ }).first(), /B01A0001-A060-310/, { search: "B01A0001-A060" });
        await s.pick(p.getByRole("combobox", { name: /^入荷先拠点/ }).first(), /本社工場/);
        await s.fill(p.getByRole("textbox", { name: "数量" }).first(), "20");
        await s.pickDate(p.getByRole("button", { name: /^希望納期/ }).first(), { nextMonthDay: 10 });
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/purchase/purchase-requests", "PRQ"));
        await s.see(docNumber("PRQ"));
        s.check(`購買依頼は CKK~${prqExpected}`, idFromUrl(s) === `CKK~${prqExpected}`, p.url());
        await s.shot("購買依頼");
        const prq = sequenceMatchesTable(s, "PURCHASE_REQUEST", "purchase_requests", "CKK");
        s.check("連番の行（PURCHASE_REQUEST × CKK）と購買依頼の表が一致する", prq.ok, prq.actual);

        const poExpected = nextNumber(s, "PURCHASE", "PO", "CKK");
        await s.goto("/purchase/purchase-orders/new");
        await s.pick(p.getByRole("combobox", { name: /^仕入先/ }), /デモ精密材料/, { search: "デモ精密" });
        await s.pick(p.getByRole("combobox", { name: /^素材/ }).first(), /B01A0001-A060-310/, { search: "B01A0001-A060" });
        await s.pick(p.getByRole("combobox", { name: /^入荷先拠点/ }).first(), /本社工場/);
        await s.fill(p.getByRole("textbox", { name: "数量" }).first(), "20");
        await s.fill(p.getByRole("textbox", { name: "単価" }).first(), "1250");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/purchase/purchase-orders", "PO"));
        await s.see(docNumber("PO"));
        s.check(`素材発注書は CKK~${poExpected}`, idFromUrl(s) === `CKK~${poExpected}`, p.url());
        const po = sequenceMatchesTable(s, "PURCHASE", "material_purchase_orders", "CKK");
        s.check("連番の行（PURCHASE × CKK）と素材発注書の表が一致する", po.ok, po.actual);
      },
    },
    {
      caption: "会計文書（ACC）— 請求書の「会計連携CSV」を出すと転記され、会計文書の番号が振られる（文書履歴は管理者の画面）",
      run: async (s) => {
        const p = s.page;
        s.check("シード直後、会計文書は 1 枚も採番されていない", lastSeq(s, "ACCOUNTING_DOC", "CKK") === 0, String(lastSeq(s, "ACCOUNTING_DOC", "CKK")));
        const expected = nextNumber(s, "ACCOUNTING_DOC", "ACC", "CKK");
        await s.goto("/billing/invoices/INV-202606-00001");
        await s.see("未エクスポート");
        await s.click(p.getByRole("button", { name: "操作メニュー" }).first());
        const item = p.getByRole("menuitem", { name: "会計連携CSV" });
        await item.waitFor({ state: "visible" });
        await s.shot("請求書の操作メニュー — 会計連携CSV");
        const href = (await item.getAttribute("href")) ?? "";
        s.check("メニューの行き先は会計連携のエクスポート", href.startsWith("/api/export/accounting?invoice="), href);
        const res = await p.request.get(href);
        const csv = (await res.text()).replace(/^﻿/, "");
        s.check("CSV が返る", res.ok() && /csv/.test(res.headers()["content-type"] ?? ""), `${res.status()} ${res.headers()["content-type"]}`);
        s.check("CSV に請求書番号が載る", csv.includes("INV-"), csv.split(/\r?\n/).slice(0, 3).join(" ⏎ "));
        await p.keyboard.press("Escape");

        await s.goto(p.url());
        await s.checkVisible("請求書の詳細に会計文書の番号が出る", expected);
        await s.shot("転記したあとの請求書（会計文書履歴）");
        const doc = s.sql(
          "select c.code || '~' || d.doc_number || ' ' || d.status from app.accounting_documents d join app.own_companies c on c.id = d.own_company_id",
        );
        s.check(`会計文書は請求書の法人（CKK）の ${expected}`, doc === `CKK~${expected} POSTED`, doc);
        const m = sequenceMatchesTable(s, "ACCOUNTING_DOC", "accounting_documents", "CKK");
        s.check("連番の行（ACCOUNTING_DOC × CKK）と会計文書の表が一致する", m.ok, m.actual);

        // 会計連携（SY0J）はシステム権限の画面なので、管理者で開く。
        await s.switchUser("admin", "/settings/accounting/documents");
        await s.checkVisible("会計連携の文書履歴（SY0J）に並ぶ", expected, { wait: 8000 });
      },
    },
    {
      caption: "共有端末 — 指示書 9001 の最後の工程を完了すると指示書が完了し、完成品の入庫の伝票が Web と同じ連番から続く",
      run: async (s) => {
        const expected = nextNumber(s, "INVENTORY_MOVEMENT", "MOV", "CKK");
        const before = lastSeq(s, "INVENTORY_MOVEMENT", "CKK");
        const kiosk = await s.openKiosk(`/steps/${LAST_STEP_9001}?from=wo`);
        await kiosk.getByRole("button", { name: "工程開始" }).waitFor({ state: "visible", timeout: 20_000 });
        await s.shot("共有端末 — 最後の工程（段加工検査承認）", kiosk);
        await kiosk.getByRole("button", { name: "工程開始" }).click();
        await kiosk.getByRole("button", { name: "工程完了" }).click();
        await kiosk.getByRole("button", { name: "完了する" }).waitFor({ state: "visible", timeout: 20_000 });
        await s.shot("共有端末 — 工程を完了する", kiosk);
        await kiosk.getByRole("button", { name: "完了する" }).click();
        await kiosk.getByText("完了 6 / 6 工程").waitFor({ state: "visible", timeout: 30_000 });
        // 隅の「作業中 n 件」は layout が描く — 戻っただけでは描き直されず、
        // 完了した工程が残っていた。消えるのを少し待ってから確かめる。
        const pill = kiosk.getByText(/^作業中 \d+ 件$/);
        await pill.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
        s.check("最後の工程を完了すると 隅の「作業中 n 件」が消える", (await pill.count()) === 0, await pill.allInnerTexts());
        await s.shot("共有端末 — 指示書が完了した", kiosk);
        await kiosk.close();

        const wo = s.sql("select status from app.work_orders where work_order_number = 9001");
        s.check("指示書 9001 は完了になった", wo === "COMPLETED", wo);
        const mov = s.sql(
          "select c.code || '~' || m.doc_number || ' ' || m.cause || ' ' || u.username from app.inventory_movements m join app.own_companies c on c.id = m.own_company_id left join app.users u on u.id = m.created_by where m.source_type = 'work_orders' and m.source_id = '9001' and m.cause = 'WORK_ORDER_COMPLETION'",
        );
        s.check(`共有端末が起こした入出庫伝票は続き番 ${expected}`, mov === `CKK~${expected} WORK_ORDER_COMPLETION demo_shot`, mov);
        s.check("共有端末の伝票は Web と同じ連番の行を 1 進めた", lastSeq(s, "INVENTORY_MOVEMENT", "CKK") === before + 1, `${before} → ${lastSeq(s, "INVENTORY_MOVEMENT", "CKK")}`);
        const m = sequenceMatchesTable(s, "INVENTORY_MOVEMENT", "inventory_movements", "CKK");
        s.check("連番に欠番も重複も無い（連番の行 = 伝票の最大連番 = 行数）", m.ok, m.actual);

        await s.goto("/inventory/movements");
        await s.checkVisible("Web の入出庫伝票の一覧に、共有端末の伝票が並ぶ", expected);
      },
    },
  ],
};
