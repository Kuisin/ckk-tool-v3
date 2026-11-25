/**
 * 工程納期 と 作業場所一覧 PD09（#971）。
 *
 *   1. 指示書の新規作成（工程の組み立て画面）で工程納期を入れる → 工程カードとフロー図に出る
 *   2. 進行中の指示書 #9001 の工程実行画面（計画パネル）で工程納期を入れ、今日の作業計画を足す
 *   3. 作業場所一覧 (PD09) — 今日: 計画した工程が作業場所の下に工程納期つきで出る / 日付を替える
 *   4. 過ぎて未完了の工程は赤、完了した工程は赤くしない（過ぎた日付は fixtures で入れる）
 *   5. 画面から過去の日付を選べるか（どうなるかの記録）
 */

import type { Locator } from "@playwright/test";
import { WORK_ORDER_URL } from "../doc-number";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

const ORDER_LINE = "e0000000-0000-4000-8000-000000000001";
const STEP_CUTTING = "dc011000-0000-4000-8000-000000000002"; // #9001 切断（完了）
const STEP_MACHINING = "dc011000-0000-4000-8000-000000000004"; // #9001 段加工（進行中・NC-01）
const STEP_INSPECTION = "dc011000-0000-4000-8000-000000000005"; // #9001 段加工検査（未着手）
const STEP_APPROVAL = "dc011000-0000-4000-8000-000000000006"; // #9001 段加工検査承認（未着手）

/** JST の「今日」から数えた年月日。monthOffset = +1 で来月。 */
function jstDate(monthOffset: number, day?: number): { iso: string; slash: string } {
  const now = new Date(Date.now() + 9 * 3600_000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, day ?? now.getUTCDate()));
  const iso = d.toISOString().slice(0, 10);
  return { iso, slash: iso.replaceAll("-", "/") };
}

/** 全高で撮る前に上へ戻す（固定ヘッダーが途中に写り込まないように）。 */
async function top(s: Scn): Promise<void> {
  await s.page.evaluate(() => window.scrollTo(0, 0));
}

/** 工程納期のバッジの見た目（赤 = filled の赤 / そうでなければ灰）。 */
async function badgeLook(badge: Locator): Promise<{ text: string; variant: string | null; bg: string; red: boolean }> {
  return badge.first().evaluate((el) => {
    const root = (el.closest(".mantine-Badge-root") ?? el) as HTMLElement;
    const bg = getComputedStyle(root).backgroundColor;
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    const [r, g, b, a] = m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : [0, 0, 0, 0];
    return {
      text: (root.textContent ?? "").trim(),
      variant: root.getAttribute("data-variant"),
      bg,
      red: r > 200 && g < 120 && b < 120 && a > 0.9,
    };
  });
}

/** 指示書詳細の工程カード（工程名で引く）。 */
function stepCard(s: Scn, name: string): Locator {
  return s.page
    .locator(".mantine-Paper-root")
    .filter({ has: s.page.getByText(name, { exact: true }) })
    .filter({ has: s.page.getByRole("link", { name: /^(詳細|開始|実行)$/ }) })
    .last();
}

/** フロー図のノード（工程名で引く）。 */
function flowNode(s: Scn, name: string): Locator {
  return s.page.locator(".react-flow__node").filter({ has: s.page.getByText(name, { exact: true }) }).first();
}

/** 作業場所一覧の、作業場所 1 つぶんの枠。 */
function boardGroup(s: Scn, location: string): Locator {
  return s.page
    .locator(".mantine-Paper-root")
    .filter({ has: s.page.getByRole("heading", { name: location, exact: true }) })
    .last();
}

async function groupRows(group: Locator): Promise<string[]> {
  const rows = await group.locator("tbody tr").allInnerTexts();
  return rows.map((r) => r.replace(/\s+/g, " ").trim());
}

let newWoNumber = "";

export const stepDueDateBoard: Scenario = {
  id: "step-due-date-board",
  title: "工程納期 — 入力・表示・期限超過の赤表示と、作業場所一覧 (PD09)",
  feature: "D 工程納期・作業場所一覧 (#971)",
  user: "staff",
  fixtures: ["scenarios/fixtures/step-due-date-board.sql"],
  steps: [
    {
      caption: "指示書を新規作成 — 工程の組み立て画面の「工程納期」で 切断 に来月 20 日を入れて保存。工程カードとフロー図に出る",
      run: async (s) => {
        const p = s.page;
        const due = jstDate(1, 20);
        const versionsBefore = s.sql("select count(*) from app.product_process_route_versions");
        await s.goto(`/production/work-orders/new?orderLine=${ORDER_LINE}`);
        await s.see("工程・作業時間");
        // 工程リストの版をそのまま使っている — 何も変えていないのに「新バージョン
        // として保存されます」と出て、保存で中身の同じ版が増えていた（版の側では
        // 社内のみの工程にも拠点が入っていて、比べ方が保存の規則と違った）。
        const banner = await p.getByText(/保存時に新バージョン v\d+ として保存されます/).count();
        s.check("工程を触っていなければ「新バージョンとして保存」の案内は出ない", banner === 0, `${banner} 件`);
        const picker = p.getByRole("button", { name: "切断 の工程納期" });
        await picker.scrollIntoViewIfNeeded();
        await s.pickDate(picker, { nextMonthDay: 20 });
        s.check("工程納期の欄に選んだ日付が入る", (await picker.innerText()).trim() === due.slash, await picker.innerText());
        // 承認依頼の条件（社内工程すべてに日付 + 作業場所）を満たすために作業場所を入れる。
        const locations = p.getByRole("combobox", { name: "作業場所" });
        for (let i = 0; i < (await locations.count()); i++) await s.pick(locations.nth(i), /./);
        await picker.scrollIntoViewIfNeeded();
        await top(s);
        await s.shot("新規作成 — 工程納期（切断 = 来月 20 日）を入れた状態（保存前）");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(WORK_ORDER_URL);
        await s.see("工程ワークフロー");
        newWoNumber = new URL(p.url()).pathname.split("/").pop() ?? "";
        const versionsAfter = s.sql("select count(*) from app.product_process_route_versions");
        s.check("DB: 工程リストの版は増えていない（工程納期・作業計画は版の中身ではない）", versionsAfter === versionsBefore, `${versionsBefore} → ${versionsAfter}`);

        const db = s.sqlRows(
          `select c.code || '=' || coalesce(to_char(st.due_date, 'YYYY-MM-DD'), '-') from app.work_order_steps st
             join app.work_orders w on w.id = st.work_order_id join app.process_step_catalog c on c.id = st.process_step_id
            where w.work_order_number = ${Number(newWoNumber)} order by st.sort_order`,
        );
        s.check("DB: 切断 だけに工程納期が入り、ほかの工程は空", db.filter((r) => !r.endsWith("=-")).join(",") === `CUTTING=${due.iso}`, db);
        // 作成画面の作業計画の日付は既定で今日（画面に 今日 の日付が出ていた）。そのまま保存した。
        const planDates = s.sqlRows(
          `select distinct to_char(pl.planned_date, 'YYYY-MM-DD') from app.work_order_step_plans pl
             join app.work_order_steps st on st.id = pl.work_order_step_id join app.work_orders w on w.id = st.work_order_id
            where w.work_order_number = ${Number(newWoNumber)}`,
        );
        s.check("DB: 作成画面で入れた作業計画の日付は、画面に出ていた今日の日付", planDates.join(",") === jstDate(0).iso, { 画面: jstDate(0).iso, DB: planDates });

        const card = stepCard(s, "切断");
        await card.scrollIntoViewIfNeeded();
        const cardText = (await card.innerText()).replace(/\s+/g, " ");
        s.check("工程カード（切断）に「工程納期 来月 20 日」のバッジ", cardText.includes(`工程納期 ${due.slash}`), cardText);
        const look = await badgeLook(card.getByText(`工程納期 ${due.slash}`));
        s.check("先の日付なので赤くない", !look.red, look);
        const node = flowNode(s, "切断");
        // フロー図は遅れて描かれる（動的 import + 寸法を測ってから表示）。描き終わるのを待つ。
        await node.getByText(/工程納期/).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
        const nodeText = (await node.innerText().catch(() => "（フロー図のノードが無い）")).replace(/\s+/g, " ");
        s.check("フロー図のノード（切断）にも工程納期", nodeText.includes(`工程納期 ${due.slash}`), nodeText);
        const others = await p.getByText(/^工程納期 \d{4}\/\d{2}\/\d{2}$/).count();
        s.check("工程納期のバッジは 切断 のカードとノードの 2 つだけ", others === 2, others);
        await top(s);
      },
    },
    {
      caption: "進行中の指示書 #9001 — 工程実行画面（段加工検査）の計画パネルで工程納期（来月 15 日）を入れ、今日・研磨機 1号機 の作業計画を足す",
      run: async (s) => {
        const p = s.page;
        const due = jstDate(1, 15);
        const today = jstDate(0);
        await s.goto(`/production/work-orders/9001/steps/${STEP_INSPECTION}`);
        await s.see("作業計画");
        const picker = p.getByRole("button", { name: "工程納期", exact: true });
        s.check("入れる前は「未設定」", (await picker.innerText()).trim() === "未設定", await picker.innerText());
        await s.pickDate(picker, { nextMonthDay: 15 });
        await s.toast("工程納期を保存しました");
        await s.see(`工程納期 ${due.slash}`);
        const saved = s.sql(`select to_char(due_date, 'YYYY-MM-DD') from app.work_order_steps where id = '${STEP_INSPECTION}'`);
        s.check("DB: 段加工検査 の工程納期 = 来月 15 日", saved === due.iso, saved);
        const look = await badgeLook(p.getByText(`工程納期 ${due.slash}`));
        s.check("工程の見出しに工程納期のバッジ（先の日付なので灰色）", look.text === `工程納期 ${due.slash}` && !look.red, look);
        const audit = s.sql(
          `select after_data->>'note' from app.audit_logs where table_name = 'work_orders' and record_id = '9001' order by id desc limit 1`,
        );
        s.check("履歴に「工程納期を … に変更」が残る", audit.includes("工程納期を") && audit.includes(due.iso), audit);

        // 今日の作業計画（作業場所つき）を足す — 作業場所一覧に出すため。
        await s.pickDate(p.getByRole("button", { name: "日付", exact: true }).first(), "today");
        await s.pick(p.getByRole("combobox", { name: "作業場所" }).first(), /研磨機 1号機/);
        // ここでは撮らない — この画面は全高で撮ると、保存前の入力（日付・作業場所）が消える
        // （撮影のための一時的な画面サイズ変更で入力行が作り直される）。追加してから撮る。
        await s.click(p.getByRole("button", { name: "追加", exact: true }).first());
        await s.toast("作業計画を追加しました");
        const plan = s.sqlRows(
          `select to_char(pl.planned_date, 'YYYY-MM-DD') || '@' || coalesce(wl.code, '-') from app.work_order_step_plans pl
             left join app.work_locations wl on wl.id = pl.work_location_id
            where pl.work_order_step_id = '${STEP_INSPECTION}' order by pl.planned_date`,
        );
        s.check("DB: 選んだ日付（今日）・GR-01 の計画が足された", plan.includes(`${today.iso}@GR-01`), { 選んだ日付: today.iso, DB: plan });
        const row = (await p.locator("tbody tr").filter({ hasText: "研磨機 1号機" }).first().innerText()).replace(/\s+/g, " ");
        s.check("作業計画の表に、選んだ日付（今日）で行が足される", row.includes(today.slash), { 選んだ日付: today.slash, 表の行: row });
        await top(s);
        await s.shot("工程納期（見出しのバッジ・計画パネルの欄）と、足した今日の作業計画");
      },
    },
    {
      caption: "作業場所一覧 (PD09) — 今日: 計画した工程が「研磨機 1号機」の下に工程納期つきで出る。前日以前の未完了は「持ち越し」",
      run: async (s) => {
        const p = s.page;
        const due = jstDate(1, 15);
        const today = jstDate(0);
        await s.goto("/production/work-location-board");
        await s.see("作業場所一覧");
        await s.see("研磨機 1号機");
        const dateBox = p.getByRole("button", { name: "日付", exact: true });
        s.check("日付の初期値は今日", (await dateBox.innerText()).trim() === today.slash, await dateBox.innerText());
        s.check("今日の説明文（持ち越し・作業中も出す）", (await p.getByText("今日の計画に加え、前日以前から持ち越した未完了の工程と", { exact: false }).count()) === 1, await p.locator("main").innerText().then((t) => t.slice(0, 200)));

        const grinder = await groupRows(boardGroup(s, "研磨機 1号機"));
        s.check(
          "研磨機 1号機 の下に #9001 段加工検査（工程納期 来月 15 日・未着手）",
          grinder.length === 1 && /WOR-\d{4}-00001/.test(grinder[0]) && grinder[0].includes("段加工検査") && grinder[0].includes(`工程納期 ${due.slash}`) && grinder[0].includes("未着手"),
          grinder,
        );
        s.check("今日の計画として出る（「持ち越し」の印は付かない）", grinder.length === 1 && !grinder[0].includes("持ち越し"), grinder);
        const lathe = await groupRows(boardGroup(s, "NC旋盤 1号機"));
        s.check(
          "NC旋盤 1号機 の下に #9001 段加工（7/21 の計画の持ち越し・進行中）— 1 行だけ（作業中と重複しない）",
          lathe.length === 1 && lathe[0].includes("段加工") && /持ち越し（2026-07-21）/.test(lathe[0]) && lathe[0].includes("進行中"),
          lathe,
        );
        const overdue = jstDate(-1, 10);
        const lathBadge = await badgeLook(boardGroup(s, "NC旋盤 1号機").getByText(`工程納期 ${overdue.slash}`));
        s.check("段加工 の工程納期（先月 10 日・未完了）は赤", lathBadge.red, lathBadge);
        const none = await groupRows(boardGroup(s, "作業場所なし"));
        s.check("作業場所の無い計画（段加工検査 7/22）は「作業場所なし」の下に持ち越しで出る", none.some((r) => r.includes("段加工検査") && r.includes("持ち越し")), none);
        s.check("承認依頼中の #9002・完了の #9004・下書きは出ない", !(await p.locator("main").innerText()).match(/WOR-\d{4}-0000[234]/), (await p.locator("main").innerText()).match(/WOR-\d{4}-\d{5}/g));
        if (newWoNumber) {
          const newDoc = s.sql(`select doc_number from app.work_orders where work_order_number = ${Number(newWoNumber)}`);
          s.check("手順 1 で作った下書きの指示書は（今日の計画があっても）出ない", !(await p.locator("main").innerText()).includes(newDoc), newDoc);
        }
        await top(s);
        await s.shot("作業場所一覧 — 今日");

        // 行を押すと工程実行画面へ。
        await s.click(boardGroup(s, "研磨機 1号機").locator("tbody tr").first());
        await s.waitForUrl(new RegExp(`/production/work-orders/9001/steps/${STEP_INSPECTION}`));
        s.check("行を押すとその工程の実行画面が開く", p.url().includes(STEP_INSPECTION), p.url());
      },
    },
    {
      caption: "作業場所一覧の日付を来月 10 日に替える — その日の計画（段加工検査承認・マシニング 1号機）だけになる。「今日」で戻る",
      run: async (s) => {
        const p = s.page;
        const day = jstDate(1, 10);
        const today = jstDate(0);
        await s.goto("/production/work-location-board");
        await s.see("研磨機 1号機");
        await s.pickDate(p.getByRole("button", { name: "日付", exact: true }), { nextMonthDay: 10 });
        await p.waitForURL(new RegExp(`date=${day.iso}`), { timeout: 20_000 });
        await s.see("この日の作業計画を作業場所ごとに表示しています。");
        await s.see("マシニング 1号機");
        s.check("URL に日付が載る（?date=来月 10 日）", p.url().includes(`date=${day.iso}`), p.url());
        const mc = await groupRows(boardGroup(s, "マシニング 1号機"));
        s.check("マシニング 1号機 の下に #9001 段加工検査承認", mc.length === 1 && mc[0].includes("段加工検査承認") && !mc[0].includes("持ち越し"), mc);
        s.check("今日の計画・持ち越しは出ない（研磨機 1号機 / NC旋盤 1号機 の枠が無い）", (await p.getByRole("heading", { name: "研磨機 1号機" }).count()) === 0 && (await p.getByRole("heading", { name: "NC旋盤 1号機" }).count()) === 0, await p.getByRole("heading").allInnerTexts());
        const planned = s.sql(`select to_char(planned_date, 'YYYY-MM-DD') from app.work_order_step_plans where work_order_step_id = '${STEP_APPROVAL}'`);
        s.check("DB: その計画の日付と一致", planned === day.iso, planned);
        await top(s);
        await s.shot("作業場所一覧 — 来月 10 日");

        await s.click(p.getByRole("button", { name: "今日", exact: true }));
        await s.see("研磨機 1号機");
        s.check("「今日」で今日に戻る（URL から date が消える）", !p.url().includes("date=") && (await p.getByRole("button", { name: "日付", exact: true }).innerText()).trim() === today.slash, p.url());

        // 計画の無い日。
        await s.goto(`/production/work-location-board?date=${jstDate(2, 28).iso}`);
        await s.checkVisible("計画の無い日は「この日の作業計画はありません」", "この日の作業計画はありません");
        await top(s);
      },
    },
    {
      caption: "指示書 #9001 の詳細 — 過ぎて未完了の工程（段加工）は工程カードもフロー図も赤。完了した工程（切断）は過ぎていても赤くしない",
      run: async (s) => {
        const p = s.page;
        const overdue = jstDate(-1, 10);
        const done = jstDate(-1, 5);
        const future = jstDate(1, 15);
        await s.goto("/production/work-orders/9001");
        await s.see("工程ワークフロー");
        const state = s.sqlRows(
          `select c.code || ':' || st.status || ':' || coalesce(to_char(st.due_date, 'YYYY-MM-DD'), '-') from app.work_order_steps st
             join app.process_step_catalog c on c.id = st.process_step_id
            where st.id in ('${STEP_CUTTING}', '${STEP_MACHINING}', '${STEP_INSPECTION}') order by st.sort_order`,
        );
        s.check("前提: 切断 = 完了・先月 5 日 / 段加工 = 進行中・先月 10 日 / 段加工検査 = 未着手・来月 15 日", state.join(" ") === `CUTTING:COMPLETED:${done.iso} STEP_MACHINING:IN_PROGRESS:${overdue.iso} STEP_INSPECTION:PENDING:${future.iso}`, state);

        const machining = stepCard(s, "段加工");
        await machining.scrollIntoViewIfNeeded();
        const m = await badgeLook(machining.getByText(`工程納期 ${overdue.slash}`));
        s.check("工程カード: 段加工（過ぎて未完了）のバッジは赤", m.red && m.variant === "filled", m);
        const c = await badgeLook(stepCard(s, "切断").getByText(`工程納期 ${done.slash}`));
        s.check("工程カード: 切断（完了済み）は過ぎていても赤くない", !c.red && c.text === `工程納期 ${done.slash}`, c);
        const i = await badgeLook(stepCard(s, "段加工検査").getByText(`工程納期 ${future.slash}`));
        s.check("工程カード: 段加工検査（先の日付）は赤くない", !i.red && i.text === `工程納期 ${future.slash}`, i);

        const nm = await badgeLook(flowNode(s, "段加工").getByText(`工程納期 ${overdue.slash}`));
        s.check("フロー図: 段加工 のノードのバッジも赤", nm.red, nm);
        const nc = await badgeLook(flowNode(s, "切断").getByText(`工程納期 ${done.slash}`));
        s.check("フロー図: 切断 のノードは赤くない", !nc.red, nc);
        await top(s);
        await s.shot("指示書 #9001 — 工程カードとフロー図の工程納期（赤 = 過ぎて未完了）");

        // 工程実行画面の見出しも同じ色。
        await s.goto(`/production/work-orders/9001/steps/${STEP_MACHINING}`);
        await s.see("作業計画");
        const head = await badgeLook(p.getByText(`工程納期 ${overdue.slash}`));
        s.check("工程実行画面（段加工）の見出しのバッジも赤", head.red, head);
      },
    },
    {
      caption: "画面から過去の日付を工程納期に選べるか — 段加工検査 の計画パネルで先月 10 日を選んでみる（どうなるかの記録）",
      run: async (s) => {
        const p = s.page;
        const past = jstDate(-1, 10);
        await s.goto(`/production/work-orders/9001/steps/${STEP_INSPECTION}`);
        await s.see("作業計画");
        const picker = p.getByRole("button", { name: "工程納期", exact: true });
        await s.click(picker);
        const popover = p.locator(".mantine-Popover-dropdown:visible").last();
        await popover.waitFor({ state: "visible", timeout: 10_000 });
        // いまの値は来月 15 日なのでカレンダーは来月を開く。2 回戻って先月へ。
        await s.click(popover.locator("button[data-direction='previous']").first());
        await s.click(popover.locator("button[data-direction='previous']").first());
        const day = popover.locator("button.mantine-DatePickerInput-day:not([data-outside])").getByText("10", { exact: true }).first();
        const disabled = await day.isDisabled().catch(() => false);
        await s.shot("工程納期のカレンダー — 先月を開いたところ");
        if (!disabled) await s.click(day);
        const saved = await p
          .getByText("工程納期を保存しました")
          .first()
          .waitFor({ state: "visible", timeout: 8_000 })
          .then(() => true)
          .catch(() => false);
        const db = s.sql(`select to_char(due_date, 'YYYY-MM-DD') from app.work_order_steps where id = '${STEP_INSPECTION}'`);
        const accepted = saved && db === past.iso;
        let look: Awaited<ReturnType<typeof badgeLook>> | null = null;
        if (accepted) {
          await p.reload();
          await s.see(`工程納期 ${past.slash}`);
          look = await badgeLook(p.getByText(`工程納期 ${past.slash}`));
          s.check("過去の日付を入れた未着手の工程は、その場で赤くなる", look.red, look);
        }
        s.check(
          "（観察・合否なし）過去の日付を画面から工程納期に選べるか",
          true,
          accepted
            ? `選べる — 警告も確認も無く保存され（DB=${db}）、すぐ期限超過の赤になる。カレンダーに「今日より前は選べない」制限は無い`
            : `選べない／保存されない（disabled=${disabled} saved=${saved} DB=${db}）`,
        );
        // 消せること（解除）。
        await s.click(p.locator(".mantine-InputClearButton-root, button[aria-label='Clear']").first().or(picker.locator("xpath=..").locator("button").last()));
        const cleared = await p
          .getByText("工程納期を保存しました")
          .first()
          .waitFor({ state: "visible", timeout: 8_000 })
          .then(() => true)
          .catch(() => false);
        const after = s.sql(`select coalesce(to_char(due_date, 'YYYY-MM-DD'), 'null') from app.work_order_steps where id = '${STEP_INSPECTION}'`);
        s.check("× で工程納期を解除できる（DB が null に戻る）", after === "null", `toast=${cleared} DB=${after}`);
        await top(s);
      },
    },
  ],
};
