/**
 * 計算基準の「原価のみに含める」（#976・SY02 価格試算計算）。
 *
 * 計算基準の「原価の扱い」が 3 択になった:
 *   原価に数えない / 原価と売価に数える（従来の「原価」）/ 原価のみに含める
 * 「原価のみに含める」にした基準は、原価合計には数えるが、最低単価（小計）にも
 * 見積単価にも足さない。
 *
 * コート代（既定の入力で ¥320）を「原価のみに含める」に変えて、同じ入力の価格試算が
 *   原価合計 … 変わらない / 最低単価 … コート代ぶん下がる / 見積単価 … 下がる
 * ことを見る。保存済みの価格試算は保存時の結果のまま（引き直さない）。
 */

import { docNumber, docUrl } from "../doc-number";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

const BEFORE_NAME = "SCN 基準変更前の価格試算";

const mainText = async (s: Scn) => (await s.page.locator("main").innerText()).replace(/\s+/g, " ");
const yen = (text: string, label: string): number => {
  // 原価にだけ数える行には「原価のみ」の印が付く（原価を見られる人の画面）。
  const m = new RegExp(`${label}\\s*(?:原価のみ\\s*)?￥([\\d,]+)`).exec(text);
  return m ? Number((m[1] ?? "").replace(/,/g, "")) : Number.NaN;
};

interface Figures {
  coat: number;
  cost: number;
  min: number;
  price: number;
}
async function readFigures(s: Scn): Promise<Figures> {
  // 2 回続けて同じ値になるまで待つ（描き直しの途中の額を控えない）。
  let prev = "";
  let t = "";
  for (let i = 0; i < 20; i++) {
    t = await mainText(s);
    const now = `${yen(t, "コート代")}/${yen(t, "最低単価")}/${yen(t, "見積単価（基準）")}`;
    if (now === prev) break;
    prev = now;
    await s.page.waitForTimeout(250);
  }
  return { coat: yen(t, "コート代"), cost: yen(t, "原価合計"), min: yen(t, "最低単価"), price: yen(t, "見積単価（基準）") };
}

const ctx: { before: Figures; savedUrl: string } = { before: { coat: 0, cost: 0, min: 0, price: 0 }, savedUrl: "" };

export const costOnlyCriterion: Scenario = {
  id: "cost-only-criterion",
  title: "計算基準「原価のみに含める」— 原価合計には数え、見積単価には足さない",
  feature: "原価試算 / 売価試算 (#976)",
  user: "admin",
  steps: [
    {
      caption: "変える前の価格試算を 1 つ保存する — コート代は原価にも見積単価にも入っている",
      run: async (s) => {
        const p = s.page;
        await s.goto("/sales/trial-estimates/new");
        await s.see("見積単価（基準）");
        ctx.before = await readFigures(s);
        s.check("既定の入力で コート代 ¥320・最低単価 = 原価合計（全部の費目が売価にも入っている）", ctx.before.coat === 320 && ctx.before.min === ctx.before.cost && ctx.before.price > ctx.before.min, ctx.before);
        await s.fill(p.getByPlaceholder(/^例: 精密軸/), BEFORE_NAME);
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/sales/trial-estimates", "EST"));
        await s.see(docNumber("EST"));
        ctx.savedUrl = new URL(p.url()).pathname;
      },
    },
    {
      caption: "SY02 計算基準でコート代を「原価のみに含める」にする — 一覧の印が「原価」から「原価のみ」に変わる",
      run: async (s) => {
        const p = s.page;
        await s.goto("/settings/trial-pricing-engine/criteria/coating");
        const mode = p.getByRole("combobox", { name: "原価の扱い" });
        await s.see("原価の扱い");
        s.check("変える前は「原価と売価に数える」", (await mode.inputValue()) === "原価と売価に数える", await mode.inputValue());
        await s.click(mode);
        const options = await p.getByRole("option").allInnerTexts();
        s.check("選択肢は 3 つ（原価に数えない / 原価と売価に数える / 原価のみに含める）", options.join("|") === "原価に数えない|原価と売価に数える|原価のみに含める", options);
        await s.shot("原価の扱いの選択肢");
        await s.click(p.getByRole("option", { name: "原価のみに含める", exact: true }));
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.toast(/保存しました/);
        await s.goto("/settings/trial-pricing-engine/criteria");
        const row = p.getByRole("link", { name: /^コート代/ });
        await row.waitFor({ state: "visible", timeout: 20_000 });
        const label = (await row.innerText()).replace(/\s+/g, " ");
        s.check("計算基準の一覧でコート代に「原価のみ」の印が付く", /原価のみ/.test(label), label);
        const stored = s.sql(
          `select (c->>'isCost') || '|' || coalesce(c->>'costOnly', '-') from app.system_settings s,
                  jsonb_array_elements(s.value::jsonb) c where s.key = 'trial_pricing.criteria' and c->>'id' = 'coating'`,
        );
        s.check("設定に isCost + costOnly として保存される", stored === "true|true", stored);
      },
    },
    {
      caption: "中間の基準では選べない — 「原価のみに含める」は小計に足す基準（加算）だけの選択肢",
      run: async (s) => {
        const p = s.page;
        await s.goto("/settings/trial-pricing-engine/criteria/shapeOut");
        await s.see("原価の扱い");
        s.check("（前提）形状出し単価の役割は「中間」", /中間/.test(await p.getByRole("combobox", { name: "役割" }).inputValue()), await p.getByRole("combobox", { name: "役割" }).inputValue());
        await s.click(p.getByRole("combobox", { name: "原価の扱い" }));
        const options = await p.getByRole("option").allInnerTexts();
        s.check("中間の基準の選択肢に「原価のみに含める」は無い", options.join("|") === "原価に数えない|原価と売価に数える", options);
        await p.keyboard.press("Escape");
      },
    },
    {
      caption: "同じ入力で価格試算を開き直す — 原価合計は同じ、最低単価と見積単価はコート代ぶん下がる",
      run: async (s) => {
        await s.goto("/sales/trial-estimates/new");
        await s.see("見積単価（基準）");
        const after = await readFigures(s);
        const b = ctx.before;
        s.check(`原価内訳にコート代 ¥320 は残り、原価合計は変わらない（¥${b.cost}）`, after.coat === 320 && after.cost === b.cost, after);
        const marked = /コート代\s*原価のみ\s*￥320/.test(await mainText(s));
        s.check("コート代の行に「原価のみ」の印が付く（売価に入らない行だと分かる）", marked, marked ? "コート代 原価のみ ￥320" : "印が無い");
        s.check(`最低単価はコート代ぶん下がる（¥${b.min} → ¥${b.min - 320}）`, after.min === b.min - 320, after.min);
        s.check(`見積単価（基準）は下がる（¥${b.price} → 最低単価 × 補正値 1.25 を丸めた額）`, after.price < b.price && Math.abs(after.price - after.min * 1.25) <= 10, { before: b.price, after: after.price, 最低単価x補正値: after.min * 1.25 });
        const t = await mainText(s);
        const profit = /粗利\s*￥([\d,]+)/.exec(t);
        s.check("粗利 = 見積単価 − 原価合計（コート代は原価として引かれる）", profit != null && Number((profit[1] ?? "").replace(/,/g, "")) === after.price - after.cost, (t.match(/粗利.{0,30}/) ?? [""])[0]);
        await s.shot("基準を変えたあとの価格試算（管理者）");
      },
    },
    {
      caption: "保存済みの価格試算は引き直されない — 保存したときの見積単価のまま",
      run: async (s) => {
        await s.goto(ctx.savedUrl);
        await s.see(docNumber("EST"));
        const saved = await readFigures(s);
        s.check(`変える前に保存した価格試算は 見積単価 ¥${ctx.before.price}・最低単価 ¥${ctx.before.min} のまま`, saved.price === ctx.before.price && saved.min === ctx.before.min, saved);
      },
    },
    {
      caption: "原価を見られない担当者 — 見積単価は管理者と同じ額。原価合計も「原価のみ」の費目も出ない",
      run: async (s) => {
        await s.switchUser("staff", "/sales/trial-estimates/new");
        await s.see("見積単価（基準）");
        const staff = await readFigures(s);
        const t = await mainText(s);
        const b = ctx.before;
        s.check(`担当者の見積単価も同じ額に下がる（権限で売価が変わらない）— 最低単価 ¥${b.min - 320}`, staff.min === b.min - 320 && staff.price < b.price, staff);
        s.check("担当者には 原価合計・粗利 が出ない", Number.isNaN(staff.cost) && !/粗利/.test(t), (t.match(/最低単価.{0,80}/) ?? [""])[0]);
        // 担当者に見える内訳（見出しは「原価内訳」）の行を足すと最低単価になるはず — 売価に
        // 入らない「原価のみ」の費目が同じ顔で並ぶと、内訳と最低単価が食い違って見える
        // うえ、隠している原価合計が行の足し算で分かってしまう。
        const seg = (/原価内訳（1本あたり）(.*?)基準単価/.exec(t) ?? [])[1] ?? "";
        const rows = [...seg.matchAll(/￥([\d,]+)/g)].map((m) => Number((m[1] ?? "").replace(/,/g, "")));
        const sum = rows.reduce((a, b) => a + b, 0);
        s.check(
          "担当者に見える内訳の行を足すと最低単価になる（「原価のみ」のコート代が売価の内訳に混ざらない）",
          rows.length > 0 && sum === staff.min,
          `内訳の合計 ￥${sum}（コート代 ￥${staff.coat} を含む）≠ 最低単価 ￥${staff.min} — ${seg.trim()}`,
        );
        await s.shot("基準を変えたあとの価格試算（担当者）");
      },
    },
  ],
};
